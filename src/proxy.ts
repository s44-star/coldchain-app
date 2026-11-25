import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getPublicEnv } from "@/lib/env";
import { buildCsp, createNonce } from "@/lib/security/csp";

/**
 * Runs before every page and API request (see `config.matcher`):
 *  1. Creates a per-request CSP nonce and passes it to the app.
 *  2. Refreshes the Supabase session cookie, because Server Components
 *     cannot write cookies themselves.
 *  3. Sends signed-out visitors of /app to /login (and signed-in users
 *     away from /login and /signup).
 * If Supabase is not configured yet, step 2 is skipped so public pages keep
 * working.
 */
export async function proxy(request: NextRequest) {
  const env = getPublicEnv();
  const nonce = createNonce();
  const csp = buildCsp({
    nonce,
    supabaseUrl: env?.supabaseUrl,
    isDev: process.env.NODE_ENV === "development",
  });

  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("content-security-policy", csp);
    headers.set("x-pathname", request.nextUrl.pathname);
    return NextResponse.next({ request: { headers } });
  };

  let response = forward();

  if (env) {
    const supabase = createServerClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers?: Record<string, string>) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = forward();
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          // Auth responses must never be cached by a CDN.
          if (headers) for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        },
      },
    });

    // Do not put code between createServerClient and getClaims(): the call
    // validates the JWT and triggers the cookie refresh above.
    let userId: string | undefined;
    try {
      const { data } = await supabase.auth.getClaims();
      userId = data?.claims?.sub;
    } catch (error) {
      console.error("proxy: session refresh failed", error);
    }

    // Route protection. Pages check again on the server; this just saves a
    // round trip and keeps signed-in users out of the sign-in screens.
    const path = request.nextUrl.pathname;
    const isProtected = path === "/app" || path.startsWith("/app/") || path === "/onboarding";
    const isAuthScreen = path === "/login" || path === "/signup";
    if ((!userId && isProtected) || (userId && isAuthScreen)) {
      const target = request.nextUrl.clone();
      target.search = "";
      if (userId) {
        target.pathname = "/app";
      } else {
        target.pathname = "/login";
        target.searchParams.set("next", path);
      }
      const redirect = NextResponse.redirect(target);
      for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
      redirect.headers.set("content-security-policy", csp);
      return redirect;
    }
  }

  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Everything except static files, images, and machine-to-machine APIs
      // (sensor ingestion and payment webhooks authenticate on their own).
      source:
        "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|api/ingest|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
