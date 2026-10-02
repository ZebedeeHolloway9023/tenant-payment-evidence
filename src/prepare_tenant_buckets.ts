import { ensureBucket } from "./infrai_storage.js";

const tenants = (process.env.TENANT_IDS ?? "")
  .split(",")
  .map((tenant) => tenant.trim())
  .filter(Boolean);

if (tenants.length === 0) throw new Error("Set TENANT_IDS to a comma-separated tenant list");

for (const tenant of tenants) {
  if (!/^[a-z0-9-]{3,40}$/.test(tenant)) throw new Error(`Invalid tenant id: ${tenant}`);
  await ensureBucket(`fintech-${tenant}`);
  console.log(`Prepared fintech-${tenant}`);
}
