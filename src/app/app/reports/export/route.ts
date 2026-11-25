import { NextResponse, type NextRequest } from "next/server";
import { getAppContext } from "@/lib/auth/context";
import { toCsv } from "@/lib/csv";
import { buildReport, recordExport, reportQuerySchema } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** CSV download. Data comes through the user's own session, so RLS applies. */
export async function GET(request: NextRequest) {
  const ctx = await getAppContext();
  if (ctx.access.state === "locked") return NextResponse.json({ error: "Subscription required" }, { status: 402 });

  const parsed = reportQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid report request" }, { status: 400 });

  const report = await buildReport(ctx, parsed.data);
  await recordExport(ctx, parsed.data, "csv", report.rows.length, report.warehouse.timezone);

  const note: unknown[][] = [];
  if (report.simulated) note.push(["NOTE: this report contains simulated (demo) readings"]);
  if (report.truncated) note.push(["NOTE: limited to the first 50,000 rows; choose a shorter period"]);

  const safeName = report.warehouse.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "warehouse";
  const filename = `${parsed.data.type}_${safeName}_${parsed.data.from}_${parsed.data.to}.csv`;

  return new NextResponse(toCsv(report.columns, [...report.rows, ...note]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
