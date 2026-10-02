import { z } from "zod";
import { ensureBucket, infrai } from "./infrai_storage.js";
import { decidePaymentAction } from "./risk_decision.js";

export const paymentEventSchema = z.object({
  tenantId: z.string().regex(/^[a-z0-9-]{3,40}$/),
  eventId: z.string().uuid(),
  amountMinor: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  riskScore: z.number().int().min(0).max(100),
  occurredAt: z.string().datetime(),
}).strict();

export type PaymentEvent = z.infer<typeof paymentEventSchema>;

export type PaymentResult = {
  eventId: string;
  decision: "release_receipt" | "manual_review";
  auditKey: string;
  receiptUrl?: string;
};

export async function processPaymentEvent(event: PaymentEvent): Promise<PaymentResult> {
  const bucket = `fintech-${event.tenantId}`;
  const auditKey = `payment-events/${event.eventId}.json`;
  const decision = decidePaymentAction(event.amountMinor, event.riskScore);
  await ensureBucket(bucket);

  const audit = JSON.stringify({
    eventId: event.eventId,
    tenantId: event.tenantId,
    amountMinor: event.amountMinor,
    currency: event.currency,
    riskScore: event.riskScore,
    occurredAt: event.occurredAt,
    decision,
  });
  const signedWrite = await infrai.storage.object.presign(bucket, auditKey, {
    op: "put",
    expires_seconds: 300,
    content_type: "application/json",
    max_bytes: Buffer.byteLength(audit),
    idempotency_key: `audit-${event.eventId}`,
  });
  const upload = await fetch(signedWrite.url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: audit,
  });
  if (!upload.ok) throw new Error(`Audit upload rejected (${upload.status})`);

  if (decision === "manual_review") return { eventId: event.eventId, decision, auditKey };

  const signedRead = await infrai.storage.object.presign(bucket, auditKey, {
    op: "get",
    expires_seconds: 600,
    response_disposition: `attachment; filename="${event.eventId}.json"`,
  });
  return { eventId: event.eventId, decision, auditKey, receiptUrl: signedRead.url };
}
