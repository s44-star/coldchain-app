import { NextResponse, type NextRequest } from "next/server";
import { isServerEnvConfigured } from "@/lib/env";
import { verifyWebhookSignature } from "@/lib/razorpay-signature";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";

type PaymentEntity = { id?: string; order_id?: string; method?: string; error_description?: string };
type RazorpayEvent = { event?: string; payload?: { payment?: { entity?: PaymentEntity } } };

/**
 * Razorpay → ColdChain OS. Confirms payments even if the customer closes the
 * browser before the checkout callback runs. Every event is stored once
 * (idempotent on the event id); activation itself is idempotent too.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !isServerEnvConfigured()) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const raw = await request.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const valid = verifyWebhookSignature(raw, signature, secret);

  let event: RazorpayEvent;
  try {
    event = JSON.parse(raw) as RazorpayEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = request.headers.get("x-razorpay-event-id") ?? `${event.event}:${event.payload?.payment?.entity?.id ?? "unknown"}`;
  const admin = createAdminClient();

  const { data: stored, error: storeError } = await admin
    .from("payment_webhook_events")
    .upsert(
      {
        provider: "razorpay",
        event_id: eventId.slice(0, 128),
        event_type: (event.event ?? "unknown").slice(0, 80),
        payload: JSON.parse(raw) as Json,
        signature_valid: valid,
      },
      { onConflict: "provider,event_id", ignoreDuplicates: true },
    )
    .select("id");

  if (storeError) {
    console.error("razorpay webhook: store failed", storeError.message);
    return NextResponse.json({ error: "Storage failed" }, { status: 500 });
  }
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  let eventRowId = stored?.[0]?.id;
  if (!eventRowId) {
    // Seen before: skip if it was processed, otherwise retry it.
    const { data: previous } = await admin
      .from("payment_webhook_events")
      .select("id, processed_at, error")
      .eq("provider", "razorpay")
      .eq("event_id", eventId.slice(0, 128))
      .maybeSingle();
    if (!previous || (previous.processed_at && !previous.error)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    eventRowId = previous.id;
  }

  const payment = event.payload?.payment?.entity;
  let processingError: string | null = null;

  if ((event.event === "payment.captured" || event.event === "order.paid") && payment?.order_id && payment.id) {
    const { error } = await admin.rpc("record_payment_success", {
      p_order_id: payment.order_id,
      p_payment_id: payment.id,
      p_method: payment.method,
    });
    // Orders created outside ColdChain OS are not ours to activate.
    if (error && error.code !== "P0002") processingError = error.message;
  } else if (event.event === "payment.failed" && payment?.order_id) {
    await admin
      .from("payment_records")
      .update({ status: "failed", failure_reason: (payment.error_description ?? "Payment failed").slice(0, 500) })
      .eq("provider", "razorpay")
      .eq("provider_order_id", payment.order_id)
      .eq("status", "created");
  }

  await admin
    .from("payment_webhook_events")
    .update({ processed_at: new Date().toISOString(), error: processingError })
    .eq("id", eventRowId);

  if (processingError) {
    console.error("razorpay webhook: processing failed", processingError);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
