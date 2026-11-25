"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { Callout } from "@/components/ui/callout";
import { Field, Input, Select, Textarea, describedBy } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";
import type { FormState } from "@/lib/validation";
import { addIncidentComment, createIncident, recordAttachment, updateIncident } from "./actions";

const init = {} as FormState;

export const INCIDENT_STATUSES = [
  ["open", "Open"],
  ["under_investigation", "Under investigation"],
  ["action_required", "Action required"],
  ["resolved", "Resolved"],
  ["closed", "Closed"],
] as const;

type Option = { id: string; name: string };

export function NewIncidentForm({
  warehouses,
  zones,
  defaults,
}: {
  warehouses: Option[];
  zones: (Option & { warehouseId: string })[];
  defaults: { warehouseId?: string; zoneId?: string; alertId?: string; title?: string; severity?: string; description?: string };
}) {
  const [state, action] = useActionState(createIncident, init);
  const v = { ...defaults, ...state.values };
  const [warehouseId, setWarehouseId] = useState(v.warehouseId ?? warehouses[0]?.id ?? "");
  const e = state.fieldErrors ?? {};

  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="alertId" value={v.alertId ?? ""} />
      <Field id="inc-title" label="What happened?" error={e.title}>
        <Input id="inc-title" name="title" defaultValue={v.title} aria-invalid={!!e.title} aria-describedby={describedBy("inc-title", null, e.title)} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field id="inc-wh" label="Warehouse" error={e.warehouseId}>
          <Select id="inc-wh" name="warehouseId" value={warehouseId} onChange={(ev) => setWarehouseId(ev.target.value)}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="inc-zone" label="Zone">
          <Select id="inc-zone" name="zoneId" defaultValue={v.zoneId ?? ""} key={warehouseId}>
            <option value="">Whole warehouse</option>
            {zones
              .filter((z) => z.warehouseId === warehouseId)
              .map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field id="inc-sev" label="Severity">
          <Select id="inc-sev" name="severity" defaultValue={v.severity ?? "warning"}>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </Select>
        </Field>
      </div>
      <Field id="inc-desc" label="Details" hint="What was affected, when it was noticed, what was done straight away." error={e.description}>
        <Textarea id="inc-desc" name="description" rows={4} defaultValue={v.description} aria-describedby={describedBy("inc-desc", "hint", e.description)} />
      </Field>
      <div>
        <SubmitButton pendingLabel="Reporting">Report incident</SubmitButton>
      </div>
    </form>
  );
}

export function IncidentStatusForm({
  id,
  initial,
}: {
  id: string;
  initial: { status: string; rootCause: string; correctiveAction: string; resolution: string };
}) {
  const [state, action] = useActionState(updateIncident, init);
  const v = { ...initial, ...state.values };
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <Field id="is-status" label="Status">
        <Select id="is-status" name="status" defaultValue={v.status}>
          {INCIDENT_STATUSES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="is-root" label="Root cause">
        <Textarea id="is-root" name="rootCause" rows={3} defaultValue={v.rootCause} />
      </Field>
      <Field id="is-ca" label="Corrective action">
        <Textarea id="is-ca" name="correctiveAction" rows={3} defaultValue={v.correctiveAction} />
      </Field>
      <Field id="is-res" label="Resolution" hint="Required to resolve or close." error={e.resolution}>
        <Textarea id="is-res" name="resolution" rows={3} defaultValue={v.resolution} aria-invalid={!!e.resolution} aria-describedby={describedBy("is-res", "hint", e.resolution)} />
      </Field>
      <div>
        <SubmitButton pendingLabel="Saving">Save incident</SubmitButton>
      </div>
    </form>
  );
}

export function CommentForm({ incidentId }: { incidentId: string }) {
  const [state, action] = useActionState(addIncidentComment, init);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-3">
      {state.error ? <FormMessage state={state} /> : null}
      <input type="hidden" name="incidentId" value={incidentId} />
      <Field id="c-body" label="Add an update" error={e.body}>
        <Textarea id="c-body" name="body" rows={3} aria-invalid={!!e.body} aria-describedby={describedBy("c-body", null, e.body)} />
      </Field>
      <div>
        <SubmitButton variant="secondary" pendingLabel="Posting">
          Post update
        </SubmitButton>
      </div>
    </form>
  );
}

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export function AttachmentUpload({ companyId, incidentId }: { companyId: string; incidentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    if (!TYPES.includes(file.type)) return setError("Choose a JPEG, PNG or WebP photo, or a PDF.");
    if (file.size > MAX_BYTES) return setError("Files can be up to 10 MB.");

    setBusy(true);
    const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80) || "file";
    const path = `${companyId}/${incidentId}/${crypto.randomUUID()}-${safe}`;
    const { error: uploadError } = await createClient()
      .storage.from("incident-attachments")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setBusy(false);
      return setError("Upload failed. Check your connection and try again.");
    }
    const result = await recordAttachment({ incidentId, path, fileName: file.name });
    setBusy(false);
    if (!result.ok) return setError(result.error ?? "Upload failed.");
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      {error ? <Callout tone="critical" title={error} /> : null}
      <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-control border border-line-strong bg-surface px-4 py-2 type-small font-medium text-ink hover:bg-surface-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="sr-only"
          disabled={busy}
          onChange={(ev) => {
            void upload(ev.target.files);
            ev.target.value = "";
          }}
        />
        {busy ? "Uploading…" : "Add photo or PDF"}
      </label>
      <p className="type-caption text-ink-muted">On a phone you can take a photo or pick a file. Up to 10 MB each.</p>
    </div>
  );
}
