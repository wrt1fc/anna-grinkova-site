// Usage: node scripts/renew-subscriptions.js   (run once a day from cron or a systemd timer)
// 1) Re-checks orders that stayed pending (lost notification, provider outage) and applies their final state.
// 2) Charges saved cards for plans ending within a day; the provider notification then extends the period.
import { createStore } from '../server/store.js';
import { createBilling } from '../server/billing/service.js';
import { createYooKassa } from '../server/billing/yookassa.js';
import { createRobokassa } from '../server/billing/robokassa.js';

const ru = process.env.BILLING_PROVIDER === 'yookassa'
  ? createYooKassa({ shopId: process.env.YOOKASSA_SHOP_ID, secretKey: process.env.YOOKASSA_SECRET_KEY }) : null;
const intl = process.env.BILLING_INTL_PROVIDER === 'robokassa'
  ? createRobokassa({ merchantLogin: process.env.ROBOKASSA_LOGIN, password1: process.env.ROBOKASSA_PASSWORD1,
    password2: process.env.ROBOKASSA_PASSWORD2, hashAlgorithm: process.env.ROBOKASSA_HASH || 'sha256', isTest: process.env.ROBOKASSA_TEST === '1' })
  : null;
if (!ru && !intl) { console.error('Set BILLING_PROVIDER=yookassa and/or BILLING_INTL_PROVIDER=robokassa with their keys'); process.exit(2); }
const store = await createStore(process.env.DATABASE_URL || 'pglite:./data/pglite');
try {
  const billing = createBilling({ store, providers: { ru, intl }, publicUrl: process.env.PUBLIC_URL });
  const checked = await billing.reconcilePending();
  for (const row of checked) console.log(`reconcile\t${row.orderId}\t${row.outcome}${row.error ? `\t${row.error}` : ''}`);
  const results = await billing.renewDue();
  for (const row of results) console.log(`renew\t${row.userId}\t${row.orderId}\t${row.status}${row.error ? `\t${row.error}` : ''}`);
  console.log(`reconciled: ${checked.length}, renewals: ${results.length}`);
} finally { await store.close(); }
