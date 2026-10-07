import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { createStore } from '../server/store.js';

// The production path: the `pg` driver over the PostgreSQL wire protocol (served here by PGlite),
// with pooled connections, BIGINT parsing and transactions on a dedicated client.
test('the store works through the pg driver: types, transactions, rollback and quotas', async () => {
  const db = await PGlite.create();
  const server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  const { port } = server.server.address();
  const store = await createStore(`postgres://postgres:postgres@127.0.0.1:${port}/postgres`);
  try {
    const user = await store.createUser('driver@example.com', 'hash', 1, 1);
    assert.equal(typeof user.id, 'number');
    const order = await store.createOrder({ userId: user.id, productId: 'individual-30d', plan: 'individual', periodDays: 30,
      amountKop: 69_000, provider: 'test' }, 1_791_400_000_000);
    assert.equal(order.createdAt, 1_791_400_000_000);
    assert.equal(typeof order.invoiceNo, 'number');
    assert.equal(order.autoRenew, false);
    assert.equal(await store.inTransaction(async (tx) => { await tx.lockUser(user.id); return tx.transitionOrder(order.id, 'pending', 'paid'); }), true);
    await assert.rejects(store.inTransaction(async (tx) => { await tx.setPlan(user.id, 'family'); throw new Error('boom'); }), /boom/);
    assert.equal((await store.planState(user.id)).plan, 'free');
    assert.equal(await store.consumeDailyQuota('chat:1', '2026-10-08', 1), true);
    assert.equal(await store.consumeDailyQuota('chat:1', '2026-10-08', 1), false);
    assert.equal(await store.health(), true);
  } finally {
    await store.close();
    await server.stop();
    await db.close();
  }
});
