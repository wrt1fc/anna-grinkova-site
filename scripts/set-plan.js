// Usage: node scripts/set-plan.js <email> <individual|partner|family>
// Until payments are connected, plans are assigned by the operator.
import { createStore } from '../server/store.js';
import { PLANS, isPlan } from '../server/plans.js';

const [email, plan] = process.argv.slice(2);
if (!email || !isPlan(plan)) {
  console.error(`Usage: node scripts/set-plan.js <email> <${Object.keys(PLANS).join('|')}>`);
  process.exit(2);
}
const store = await createStore(process.env.DATABASE_URL || 'pglite:./data/pglite');
try {
  const userId = await store.findUserIdByEmail(email.trim().toLowerCase());
  if (!userId) { console.error('Пользователь не найден'); process.exitCode = 1; }
  else { await store.setPlan(userId, plan); console.log(`${email}: тариф ${PLANS[plan].label}`); }
} finally { await store.close(); }
