import "server-only";

import { emailConfig, escapeHtml, sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/types/database";

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://coldchain-app-z971.vercel.app").replace(/\/$/, "");
}

/** Renders a queued delivery (body = message, blank line, app path) as an e-mail. */
export function renderAlertEmail(subject: string, body: string): { text: string; html: string } {
  const [message = "", path = "/app/alerts"] = body.split("\n\n");
  const link = `${siteUrl()}${path.startsWith("/") ? path : "/app/alerts"}`;
  const text = `${subject}\n\n${message}\n\nOpen the alert: ${link}\n\nYou receive this because you are on a ColdChain OS team. Turn alert e-mails off under Your account.`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f7f8;font-family:Arial,Helvetica,sans-serif;color:#10202b">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dce3e7;border-radius:12px">
<tr><td style="padding:24px">
<p style="margin:0 0 4px;font-size:13px;color:#4e5f6b">ColdChain OS alert</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapeHtml(subject)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6">${escapeHtml(message)}</p>
<a href="${escapeHtml(link)}" style="display:inline-block;background:#165e78;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:15px">Open the alert</a>
<p style="margin:24px 0 0;font-size:12px;color:#6b7c87">You receive this because you are on a ColdChain OS team. Turn alert e-mails off under Your account.</p>
</td></tr></table></body></html>`;
  return { text, html };
}

/**
 * Sends queued e-mails. Safe to run from several places at once: rows are
 * claimed atomically in the database. Returns counts for logging.
 */
export async function processDeliveries(limit = 50): Promise<{ sent: number; failed: number; skipped: number }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_deliveries", { p_limit: limit });
  if (error) throw new Error(`claim_deliveries failed: ${error.message}`);
  // The function returns notification_deliveries rows (setof).
  const rows = (data ?? []) as unknown as Tables<"notification_deliveries">[];

  const config = emailConfig();
  const result = { sent: 0, failed: 0, skipped: 0 };

  for (const row of rows) {
    if (row.channel !== "email") continue;

    if (!config) {
      await admin.from("notification_deliveries").update({ status: "provider_not_configured", provider: null }).eq("id", row.id);
      result.skipped += 1;
      continue;
    }

    const { text, html } = renderAlertEmail(row.subject ?? "ColdChain OS alert", row.body);
    const sent = await sendEmail(config, { to: row.recipient, subject: row.subject ?? "ColdChain OS alert", text, html });
    if (sent.ok) {
      await admin
        .from("notification_deliveries")
        .update({ status: "sent", provider: "resend", provider_message_id: sent.id, sent_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id);
      result.sent += 1;
    } else {
      const giveUp = !sent.retry || row.attempts >= 5;
      await admin
        .from("notification_deliveries")
        .update({
          status: giveUp ? "failed" : "pending",
          provider: "resend",
          last_error: sent.error,
          // back off: 1, 4, 9, 16 minutes
          scheduled_at: new Date(Date.now() + row.attempts * row.attempts * 60_000).toISOString(),
        })
        .eq("id", row.id);
      result.failed += 1;
    }
  }
  return result;
}
