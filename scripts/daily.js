// Usage: node scripts/daily.js   (once a day: deploy/anna-daily.timer)
// 1) Removes expired sessions and codes, old daily counters and processed payment notifications.
// 2) Re-checks orders that stayed pending (lost notification, provider outage) and applies their final state.
// 3) Charges saved cards for plans ending within a day; the provider notification then extends the period.
// Without payment keys only the housekeeping runs.
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
const store = await createStore(process.env.DATABASE_URL || 'pglite:./data/pglite');
try {
  const pruned = await store.pruneExpired();
  console.log(`cleanup	${Object.entries(pruned).map(([table, count]) => `${table}=${count}`).join(' ')}`);
  if (!ru && !intl) {
    console.log('payments are off: no reconciliation or renewals');
  } else {
    const billing = createBilling({ store, providers: { ru, intl }, publicUrl: process.env.PUBLIC_URL });
    const checked = await billing.reconcilePending();
    for (const row of checked) console.log(`reconcile	${row.orderId}	${row.outcome}${row.error ? `	${row.error}` : ''}`);
    const results = await billing.renewDue();
    for (const row of results) console.log(`renew	${row.userId}	${row.orderId}	${row.status}${row.error ? `	${row.error}` : ''}`);
    console.log(`reconciled: ${checked.length}, renewals: ${results.length}`);
  }
} finally { await store.close(); }
