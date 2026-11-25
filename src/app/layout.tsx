import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import "./globals.css";

// Archivo's width axis does the typographic work: wide for headings,
// normal width for running text and data.
const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

function siteUrl(): URL {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: "ColdChain OS | Temperature monitoring for cold storage",
    template: "%s | ColdChain OS",
  },
  description:
    "Continuous temperature and humidity monitoring for cold-storage warehouses, with alerts, incident handling and audit-ready reports.",
  applicationName: "ColdChain OS",
  authors: [{ name: "LexConv" }],
  formatDetection: { telephone: false },
  other: { google: "notranslate" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1820" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);

  // Reading the request headers renders every page per request. That is what
  // lets Next.js stamp the per-request CSP nonce (set in src/proxy.ts) onto
  // its scripts; a statically cached page would carry no valid nonce.
  headerList.get("x-nonce");

  return (
    // translate="no": browser auto-translation rewrites text nodes React owns,
    // which breaks navigation and buttons. The product UI is English.
    <html lang="en" translate="no" data-theme={theme} className={archivo.variable} suppressHydrationWarning>
      <body className="bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
