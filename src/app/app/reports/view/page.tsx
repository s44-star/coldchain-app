import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "@/app/app/billing/invoices/[id]/print-button";
import { Logo } from "@/components/brand/logo";
import { Callout } from "@/components/ui/callout";
import { getAppContext } from "@/lib/auth/context";
import { formatDateTime } from "@/lib/format";
import { buildReport, recordExport, reportQuerySchema } from "@/lib/reports";

export const metadata: Metadata = { title: "Report" };

const generatedAt = () => new Date().toISOString();

/** Printable report. "Print or save as PDF" uses the browser's PDF output. */
export default async function ReportViewPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await getAppContext();
  const parsed = reportQuerySchema.safeParse(await searchParams);
  if (!parsed.success) {
    return <Callout tone="warn" title="This report link is incomplete. Create the report again from the Reports page." />;
  }
  const report = await buildReport(ctx, parsed.data);
  await recordExport(ctx, parsed.data, "pdf", report.rows.length, report.warehouse.timezone);
  const tz = report.warehouse.timezone;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/app/reports" className="type-small text-primary underline-offset-4 hover:underline">
          Back to reports
        </Link>
        <PrintButton />
      </div>

      <article className="grid gap-6 rounded-panel border border-line bg-surface p-6 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div className="grid gap-2">
            <Logo />
            <h1 className="type-h1 text-ink">{report.title}</h1>
            <p className="type-small text-ink-muted">
              {ctx.company.companyName}, {report.warehouse.name}. {parsed.data.from} to {parsed.data.to}, times in {tz}.
            </p>
          </div>
          <p className="type-caption text-ink-muted">
            Generated {formatDateTime(generatedAt(), tz)} by {ctx.email}
          </p>
        </header>

        {report.simulated ? (
          <Callout tone="warn" title="Contains simulated readings">
            Some values were generated for demonstration and are not real measurements.
          </Callout>
        ) : null}
        {report.truncated ? <Callout tone="info" title="Showing the first 50,000 rows. Choose a shorter period for the full record." /> : null}

        {report.rows.length ? (
          <div className="overflow-x-auto [contain:inline-size] print:overflow-visible">
            <table className="w-full border-collapse type-caption">
              <thead>
                <tr className="border-b border-line-strong text-left text-ink-muted">
                  {report.columns.map((c) => (
                    <th key={c} scope="col" className="px-2 py-2 font-medium whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.slice(0, 5000).map((row, i) => (
                  <tr key={i} className="border-b border-line break-inside-avoid">
                    {row.map((cell, j) => (
                      <td key={j} className={typeof cell === "number" ? "px-2 py-1.5 text-right tabular" : "px-2 py-1.5"}>
                        {cell ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {report.rows.length > 5000 ? (
              <p className="mt-3 type-caption text-ink-muted">
                The printable view shows the first 5,000 of {report.rows.length.toLocaleString("en-GB")} rows. Download the CSV for all of them.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="type-small text-ink-muted">No records for this period.</p>
        )}
      </article>
    </div>
  );
}
