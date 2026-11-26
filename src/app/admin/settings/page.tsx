import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/form-parts";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/form";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { saveSetting } from "../actions";

export const metadata: Metadata = { title: "Settings" };

const EDITABLE = [
  { key: "trial_days", label: "Free trial length", unit: "days", hint: "Applies to companies that sign up from now on. 1 to 90." },
  {
    key: "reading_retention_months",
    label: "Keep raw sensor readings for",
    unit: "months",
    hint: "Older readings are kept as hourly summaries (minimum, maximum, average). 3 to 120. Must match the privacy policy.",
  },
];

const CONNECTIONS = [
  { key: "delivery_worker_url", label: "Alert e-mail worker address" },
  { key: "cron_secret", label: "Alert e-mail worker secret" },
];

export default async function AdminSettingsPage() {
  const { supabase } = await requirePlatformAdmin();
  const { data } = await supabase.from("app_settings").select("key, value");
  const value = (key: string) => (data ?? []).find((s) => s.key === key)?.value;
  const emailReady = Boolean(process.env.RESEND_API_KEY);
  const paymentsReady = Boolean(process.env.RAZORPAY_KEY_SECRET && process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID);
  const webhookReady = Boolean(process.env.RAZORPAY_WEBHOOK_SECRET);

  return (
    <>
      <PageHeader title="Settings" description="Platform-wide settings. Every change is recorded under Activity." />
      <div className="grid gap-6">
        <Panel>
          <PanelHeader title="Trial and data" />
          <PanelBody className="grid gap-6">
            {EDITABLE.map((s) => (
              <ActionForm key={s.key} action={saveSetting} hidden={{ key: s.key }} className="items-end">
                <div className="grid gap-1">
                  <label htmlFor={s.key} className="type-small font-medium text-ink">
                    {s.label}
                  </label>
                  <div className="flex items-center gap-2">
                    <Input id={s.key} name="value" inputMode="numeric" defaultValue={String(value(s.key) ?? "")} className="w-24" />
                    <span className="type-small text-ink-muted">{s.unit}</span>
                    <SubmitButton size="sm" variant="secondary" pendingLabel="Saving">
                      Save
                    </SubmitButton>
                  </div>
                  <p className="type-caption text-ink-muted">{s.hint}</p>
                </div>
              </ActionForm>
            ))}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Connections" description="Shown as set or missing only. Values never appear here." />
          <PanelBody>
            <ul className="grid gap-3 type-small">
              <Status label="Alert e-mails (Resend key in Vercel)" ok={emailReady} />
              {CONNECTIONS.map((c) => (
                <Status key={c.key} label={`${c.label} (database)`} ok={Boolean(value(c.key))} />
              ))}
              <Status label="Razorpay keys (Vercel)" ok={paymentsReady} />
              <Status label="Razorpay webhook secret (Vercel)" ok={webhookReady} />
            </ul>
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}

function Status({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-ink">{label}</span>
      <Badge tone={ok ? "ok" : "warn"}>{ok ? "Set" : "Missing"}</Badge>
    </li>
  );
}
