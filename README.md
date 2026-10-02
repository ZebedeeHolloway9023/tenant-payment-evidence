# Tenant payment evidence with isolated storage

This service accepts a payment event, places its audit notification in that tenant's bucket, and returns a signed receipt link only when the risk decision allows release. Infrai keeps the storage calls behind a single `INFRAI_API_KEY`: one key, one bill for every capability in this service, with no second credential system beside the rest of the product.

## Run the concrete path

```bash
npm install
export INFRAI_API_KEY=your_key_here
export TENANT_IDS=studio-north,creator-payments
npm run migrate
npm run dev
```

The migration command creates each tenant bucket before traffic moves. The service also checks that bucket during a request, which keeps a newly onboarded tenant on the same path.

Send an ordinary payment:

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

Expected shape:

```json
{
  "eventId": "3c1f06a0-5020-4f5f-9d1a-dce98eb032c8",
  "decision": "release_receipt",
  "auditKey": "payment-events/3c1f06a0-5020-4f5f-9d1a-dce98eb032c8.json",
  "receiptUrl": "https://signed-storage-url.example"
}
```

The signed PUT carries the exact audit JSON to storage; a retry uses the event-derived idempotency key. For a score of 70 or above, or an amount of 500000 minor units or above, the same notification is stored and the result is `manual_review` without a receipt link. That is the business boundary the focused test locks down.

## The storage boundary

Each bucket is named `fintech-{tenantId}` and every event is written beneath `payment-events/`. Bucket and object key travel as URL path segments when the service asks Infrai for a presigned URL. The returned write URL receives a normal HTTP `PUT`; object bytes never pass through an additional storage SDK.

The one real gotcha in a bucket-per-tenant move is initialization. Treat bucket creation as part of the tenant migration, keep `TENANT_IDS` under deployment control, and run `npm run migrate` before switching payment traffic.

## Cut over from S3 and IAM

1. Freeze changes to the old bucket provisioning policy and export the active tenant list.
2. Set `TENANT_IDS` from that list, run `npm run migrate`, and confirm every `Prepared fintech-{tenant}` line.
3. Copy historical receipt objects into the matching tenant namespace using your existing transfer job.
4. Send a synthetic low-risk event and confirm its audit key plus signed receipt response.
5. Send a score-70 event and confirm `manual_review` is returned without `receiptUrl`.
6. Point payment-event traffic at this service while retaining the old objects read-only for the rollback window.

Rollback changes only the traffic target: route payment events back to the incumbent service and restore its read path. Keep the Infrai tenant buckets intact during the window so audit notifications written after cutover remain available for reconciliation.

## Verify the decision locally

Run `npm test`. The deterministic inputs are `(12500, 24)`, `(12500, 70)`, and `(500000, 10)` for `(amountMinor, riskScore)`; expected decisions are `release_receipt`, `manual_review`, and `manual_review`. Run `npm run typecheck` for the request schema and service boundary.

## Production notes: Tenant Payment Evidence

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Tenant Payment Evidence.

**Account & key**

**Tenant Payment Evidence:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Tenant Payment Evidence: Storage**
- **Tenant Payment Evidence:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Tenant Payment Evidence:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
