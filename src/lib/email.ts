import "server-only";

/**
 * Transactional e-mail through Resend (https://resend.com). Without
 * RESEND_API_KEY nothing is sent and deliveries are marked
 * "provider_not_configured", which the app shows honestly.
 */
export function emailConfig(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return { apiKey, from: process.env.EMAIL_FROM || "ColdChain OS <alerts@lexconv.com>" };
}

export async function sendEmail(
  config: { apiKey: string; from: string },
  message: { to: string; subject: string; text: string; html: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string; retry: boolean }> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (response.ok && body.id) return { ok: true, id: body.id };
    // 4xx (bad address, unverified domain) will not succeed on retry; 429/5xx may.
    return {
      ok: false,
      error: `${response.status} ${body.name ?? ""} ${body.message ?? ""}`.trim().slice(0, 500),
      retry: response.status === 429 || response.status >= 500,
    };
  } catch (error) {
    return { ok: false, error: String(error).slice(0, 500), retry: true };
  }
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
