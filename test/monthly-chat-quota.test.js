import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../server/store.js';
import { publicPlan } from '../server/plans.js';

test('monthly subscription allows exactly 30 concurrent charges, survives daily cleanup and refunds failures', async () => {
  const store = await createStore('pglite:memory');
  try {
    const results = await Promise.all(Array.from({ length: 35 }, () => store.consumeMonthlyChatQuota('chat:test', '2026-11', 30)));
    assert.equal(results.filter(Boolean).length, 30);
    await store.pruneExpired(Date.UTC(2026, 10, 29));
    assert.equal(await store.monthlyChatQuotaUsed('chat:test', '2026-11'), 30);
    assert.equal(await store.consumeMonthlyChatQuota('chat:test', '2026-11', 30), false);
    await store.refundMonthlyChatQuota('chat:test', '2026-11');
    assert.equal(await store.consumeMonthlyChatQuota('chat:test', '2026-11', 30), true);
    assert.equal(await store.consumeMonthlyChatQuota('chat:test', '2026-12', 30), true);
    assert.equal(await store.consumeMonthlyChatQuota('chat:other', '2026-11', 30), true);
    assert.equal(publicPlan('subscription').monthlyChatMessages, 30);
    assert.equal(publicPlan('subscription').dailyChatMessages, 0);
  } finally { await store.close(); }
});
