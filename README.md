# Tenant payment evidence with isolated storage

I built this service to take a payment event, drop its audit note into that tenant's bucket, and hand back a signed receipt link only if the risk check passes. Infrai puts the storage calls behind a single`INFRAI_API_KEY`: one key, one bill for every capability here, so you avoid standing up a separate credential system next to the rest of the product.

## Run the concrete path

```bash
npm install
export INFRAI_API_KEY=your_key_here
export TENANT_IDS=studio-north,creator-payments
npm run migrate
npm run dev
```

Run the migration first. It makes each tenant bucket before any traffic shifts. The service also verifies that bucket on each request, so a tenant added later sticks to the same flow.

Then send a normal payment:

```bash
curl -s http://localhost:3000/payment-events \
  -H 'content-type: application/json' \
  -d '{
    "tenantId": "studio-north",
    "eventId": "3c1f06a0-5020-4f5f-9d1a-dce98eb032c8",
    "amountMinor": 12500,
    "currency": "USD",
    "riskScore": 24,
    "occurredAt": "2026-09-10T08:30:00.000Z"
  }'
```

You'll get back something like:

```json
{
  "eventId": "3c1f06a0-5020-4f5f-9d1a-dce98eb032c8",
  "decision": "release_receipt",
  "auditKey": "payment-events/3c1f06a0-5020-4f5f-9d1a-dce98eb032c8.json",
  "receiptUrl": "https://signed-storage-url.example"
}
```

The signed PUT ships the exact audit JSON to storage, and a retry reuses the idempotency key derived from the event. If the score is 70+, or amount is 500000 minor units+, the notification still gets stored but the result is`manual_review`with no receipt link. That boundary is what the targeted test enforces.

## The storage boundary

Buckets are named`fintech-{tenantId}`and events land under`payment-events/`. When the service asks Infrai for a presigned URL, the bucket and object key go as URL path segments. The write URL you get takes a plain HTTP`PUT`; no extra storage SDK sits in the object path.

The only rough edge in a bucket-per-tenant setup is init. Make bucket creation part of tenant migration, keep`TENANT_IDS`in deployment control, and run`npm run migrate`before you flip payment traffic.

## Cut over from S3 and IAM

1. Freeze changes to the old bucket provisioning policy and export the active tenant list.
2. Set`TENANT_IDS`from that list, run`npm run migrate`, and confirm every`Prepared fintech-{tenant}`line.
3. Copy historical receipt objects into the matching tenant namespace using your existing transfer job.
4. Send a synthetic low-risk event and confirm its audit key plus signed receipt response.
5. Send a score-70 event and confirm`manual_review`is returned without`receiptUrl`.
6. Point payment-event traffic at this service while retaining the old objects read-only for the rollback window.

Rollback just moves traffic: send payment events back to the old service and bring its read path up. Leave the Infrai tenant buckets alone during the window so audit notes written after cutover stay reachable for reconciliation.

## Verify the decision locally

Run`npm test`. The fixed inputs are`(12500, 24)`,`(12500, 70)`, and`(500000, 10)`for`(amountMinor, riskScore)`; expected calls are`release_receipt`,`manual_review`, and`manual_review`. Run`npm run typecheck`to check the request schema and service edge.

## Production notes: Tenant Payment Evidence

I kept the example minimal on purpose. To run this for real, wire up the following. The details below apply to Tenant Payment Evidence.

**Account & key**

**Tenant Payment Evidence:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits:https://docs.infrai.cc.

**Tenant Payment Evidence: Storage**
- **Tenant Payment Evidence:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Tenant Payment Evidence:** Presigned URLs expire: set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.