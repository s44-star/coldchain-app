import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { roleLabels } from "@/components/status";
import { buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { getSession } from "@/lib/auth/context";
import { getPublicEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";
import { AcceptInvitationForm } from "./accept-form";

export const metadata: Metadata = { title: "Invitation", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = getPublicEnv() ? await loadInvitation(token) : null;
  const session = await getSession();
  const here = `/invite/${encodeURIComponent(token)}`;

  return (
    <main id="main" className="mx-auto grid min-h-dvh w-full max-w-md content-start gap-8 px-6 py-10 sm:content-center">
      <Logo />
      {!invitation ? (
        <Callout tone="warn" title="This invitation link is not valid">
          Ask the person who invited you to send a new link.
        </Callout>
      ) : invitation.state !== "pending" ? (
        <Callout tone="warn" title={stateMessage(invitation.state)}>
          Ask an admin at {invitation.company_name} to invite you again.
        </Callout>
      ) : (
        <div className="grid gap-6">
          <div className="grid gap-2">
            <h1 className="type-h1 text-ink">Join {invitation.company_name}</h1>
            <p className="type-body text-ink-muted">
              You are invited as <strong className="text-ink">{roleLabels[invitation.role as Enums<"member_role">]}</strong>{" "}
              with {invitation.email}. The link works until {formatDateTime(invitation.expires_at)}.
            </p>
          </div>

          {session ? (
            session.email.toLowerCase() === invitation.email ? (
              <AcceptInvitationForm token={token} />
            ) : (
              <Callout tone="warn" title={`You are signed in as ${session.email}`}>
                This invitation is for {invitation.email}. Sign out, then sign in or create an account with that address.
              </Callout>
            )
          ) : (
            <div className="grid gap-3">
              <Link
                href={`/signup?next=${encodeURIComponent(here)}&email=${encodeURIComponent(invitation.email)}`}
                className={buttonClasses({ size: "lg" })}
              >
                Create an account to join
              </Link>
              <Link href={`/login?next=${encodeURIComponent(here)}`} className={buttonClasses({ variant: "secondary", size: "lg" })}>
                I already have an account
              </Link>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

async function loadInvitation(token: string) {
  if (token.length < 32 || token.length > 256) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_invitation", { p_token: token });
  if (error) {
    console.error("get_invitation failed", error.message);
    return null;
  }
  return data?.[0] ?? null;
}

function stateMessage(state: string): string {
  if (state === "accepted") return "This invitation has already been used";
  if (state === "expired") return "This invitation has expired";
  return "This invitation was withdrawn";
}
