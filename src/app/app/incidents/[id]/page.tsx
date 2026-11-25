import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { IncidentStatusBadge, SeverityBadge } from "@/components/status";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { getAppContext } from "@/lib/auth/context";
import { formatDateTime } from "@/lib/format";
import { AttachmentUpload, CommentForm, IncidentStatusForm } from "../forms";

export const metadata: Metadata = { title: "Incident" };

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  under_investigation: "Under investigation",
  action_required: "Action required",
  resolved: "Resolved",
  closed: "Closed",
};

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAppContext();
  const { data: inc } = await ctx.supabase.from("incidents").select("*").eq("id", id).maybeSingle();
  if (!inc || inc.company_id !== ctx.company.companyId) notFound();

  const [{ data: updates }, { data: files }, { data: warehouse }, { data: zone }] = await Promise.all([
    ctx.supabase.from("incident_updates").select("*").eq("incident_id", id).order("created_at", { ascending: false }),
    ctx.supabase.from("incident_attachments").select("*").eq("incident_id", id).order("created_at"),
    ctx.supabase.from("warehouses").select("name, timezone").eq("id", inc.warehouse_id).single(),
    inc.zone_id ? ctx.supabase.from("storage_zones").select("id, name").eq("id", inc.zone_id).single() : Promise.resolve({ data: null }),
  ]);

  const authorIds = [...new Set([...(updates ?? []).map((u) => u.author_id), inc.reported_by].filter((x): x is string => !!x))];
  const [{ data: people }, signed] = await Promise.all([
    authorIds.length ? ctx.supabase.from("profiles").select("id, full_name, email").in("id", authorIds) : Promise.resolve({ data: [] }),
    files?.length
      ? ctx.supabase.storage.from("incident-attachments").createSignedUrls(files.map((f) => f.storage_path), 600)
      : Promise.resolve({ data: [] }),
  ]);
  const who = (uid: string | null) => {
    const p = (people ?? []).find((x) => x.id === uid);
    return p?.full_name || p?.email || "ColdChain OS";
  };
  const urlFor = (path: string) => signed.data?.find((s) => s.path === path)?.signedUrl ?? null;
  const tz = warehouse?.timezone ?? "UTC";
  const canEdit = ctx.role !== "viewer";

  return (
    <>
      <PageHeader
        title={inc.title}
        description={
          <>
            {warehouse?.name}
            {zone ? (
              <>
                {", "}
                <Link href={`/app/zones/${zone.id}`} className="text-primary underline-offset-4 hover:underline">
                  {zone.name}
                </Link>
              </>
            ) : null}
            {`. Reported by ${who(inc.reported_by)}, ${formatDateTime(inc.occurred_at, tz)}.`}
          </>
        }
        actions={
          <>
            <SeverityBadge value={inc.severity} />
            <IncidentStatusBadge value={inc.status} />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-6">
          {inc.description ? <p className="type-body whitespace-pre-line text-ink">{inc.description}</p> : null}
          {inc.alert_id ? (
            <Link href={`/app/alerts/${inc.alert_id}`} className="type-small text-primary underline-offset-4 hover:underline">
              View the alert that started this incident
            </Link>
          ) : null}

          <Panel>
            <PanelHeader title="Evidence" description="Photos and documents. Links expire after 10 minutes." />
            <PanelBody className="grid gap-4">
              {files?.length ? (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {files.map((f) => {
                    const url = urlFor(f.storage_path);
                    return (
                      <li key={f.id} className="grid gap-1">
                        {url && f.mime_type.startsWith("image/") ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-control border border-line">
                            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                            <img src={url} alt={f.file_name} className="aspect-square w-full object-cover" />
                          </a>
                        ) : (
                          <a href={url ?? "#"} target="_blank" rel="noopener noreferrer" className="grid aspect-square place-items-center rounded-control border border-line bg-surface-2 type-small text-primary">
                            PDF
                          </a>
                        )}
                        <span className="truncate type-caption text-ink-muted">{f.file_name}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="type-small text-ink-muted">No evidence attached yet.</p>
              )}
              {canEdit ? <AttachmentUpload companyId={ctx.company.companyId} incidentId={id} /> : null}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Timeline" description={`Times in ${tz}.`} />
            <PanelBody className="grid gap-5">
              {canEdit ? <CommentForm incidentId={id} /> : null}
              <ol className="grid gap-4">
                {(updates ?? []).map((u) => (
                  <li key={u.id} className="grid gap-0.5 border-l-2 border-line pl-4">
                    <p className="type-small font-medium text-ink">
                      {u.to_status ? `Status: ${STATUS_LABEL[u.to_status]}` : "Update"}
                      <span className="font-normal text-ink-muted"> by {who(u.author_id)}</span>
                    </p>
                    <p className="type-caption tabular text-ink-muted">{formatDateTime(u.created_at, tz)}</p>
                    {u.body ? <p className="type-small whitespace-pre-line text-ink">{u.body}</p> : null}
                  </li>
                ))}
              </ol>
            </PanelBody>
          </Panel>
        </div>

        <Panel className="self-start">
          <PanelHeader title="Investigation" />
          <PanelBody>
            {canEdit ? (
              <IncidentStatusForm
                id={id}
                initial={{
                  status: inc.status,
                  rootCause: inc.root_cause ?? "",
                  correctiveAction: inc.corrective_action ?? "",
                  resolution: inc.resolution ?? "",
                }}
              />
            ) : (
              <dl className="grid gap-3 type-small">
                {[
                  ["Root cause", inc.root_cause],
                  ["Corrective action", inc.corrective_action],
                  ["Resolution", inc.resolution],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-ink-muted">{label}</dt>
                    <dd className="text-ink">{value || "Not recorded yet"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
