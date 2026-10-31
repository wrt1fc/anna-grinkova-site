// Operator-only utility. No API accepts this entitlement and display names are never used to grant it.
import { createStore } from '../server/store.js';

const emails = ['test1@anna.test', 'test2@anna.test', 'test3@anna.test'];
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const enabled = !process.argv.includes('--disable');
const store = await createStore(process.env.DATABASE_URL);
try {
  await store.inTransaction(async (tx) => {
    const users = await tx.q.query('SELECT id, email, email_verified_at FROM users WHERE email IN ($1,$2,$3) FOR UPDATE', emails);
    if (users.length !== 3 || users.some((user) => user.email_verified_at == null)) throw new Error('Expected three existing verified test accounts; no accounts changed');
    await tx.q.run('UPDATE users SET chat_unlimited = $1 WHERE id IN ($2,$3,$4)', [enabled, ...users.map((user) => user.id)]);
    console.log(JSON.stringify({ accounts: users.map((user) => user.email).sort(), unlimitedChat: enabled }));
  });
} finally { await store.close(); }
