// Usage: node scripts/renew-subscriptions.js   (run once a day from cron or a systemd timer)
// Charges saved cards for plans ending within a day; the provider notification then extends the period.
import { resolve } from 'node:path';
import { createStore } from '../server/store.js';
import { createBilling } from '../server/billing/service.js';
import { createYooKassa } from '../server/billing/yookassa.js';

const provider = process.env.BILLING_PROVIDER === 'yookassa'
  ? createYooKassa({ shopId: process.env.YOOKASSA_SHOP_ID, secretKey: process.env.YOOKASSA_SECRET_KEY }) : null;
if (!provider) { console.error('Set BILLING_PROVIDER=yookassa and its keys'); process.exit(2); }
const store = createStore(resolve(process.env.DATA_PATH || './data/site.sqlite'));
try {
  const results = await createBilling({ store, provider, publicUrl: process.env.PUBLIC_URL }).renewDue();
  for (const row of results) console.log(`${row.userId}\t${row.orderId}\t${row.status}${row.error ? `\t${row.error}` : ''}`);
  console.log(`renewals: ${results.length}`);
} finally { store.close(); }
