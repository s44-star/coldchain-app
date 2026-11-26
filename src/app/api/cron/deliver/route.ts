import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { processDeliveries } from "@/lib/delivery";
import { isServerEnvConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from((request.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Delivery worker. Called every minute by pg_cron (pg_net) with CRON_SECRET. */
async function handle(request: NextRequest) {
  if (!isServerEnvConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await processDeliveries(100);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("delivery worker failed", error);
    return NextResponse.json({ error: "Delivery failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
