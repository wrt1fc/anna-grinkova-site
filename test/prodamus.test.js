import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from '../server/http.js';
import { createStore } from '../server/store.js';
import { createTrafficLimiter } from '../server/traffic.js';
import { hashPassword } from '../server/auth.js';
import { parseForm, payLink, PRODAMUS_PRODUCTS, signPayload } from '../server/billing/prodamus.js';

const SECRET = 'prodamus-test-secret';
const PASSWORD = 'Very-long-password1!';

async function fixture(run) {
  const store = await createStore('pglite:memory');
  const server = createServer({ store, prodamusKey: SECRET, publicUrl: 'https://anna.example',
    codeSecret: 'test-secret-with-at-least-thirty-two-characters', trafficLimiter: createTrafficLimiter({ perIpLimit: 500, globalLimit: 1000 }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const user = await store.createUser('buyer@example.com', await hashPassword(PASSWORD), Date.now(), Date.now());
  const notify = async (fields, { sign } = {}) => {
    const body = new URLSearchParams(fields).toString();
    const response = await fetch(`${base}/api/billing/webhook/prodamus`, { method: 'POST', body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Sign: sign ?? signPayload(parseForm(body), SECRET) } });
    return response.status;
  };
  try { await run({ store, notify, userId: user.id ?? user }); }
  finally { await new Promise((resolve) => server.close(resolve)); await store.close(); }
}

const success = (extra = {}) => ({ order_id: '1001', sum: '990.00', customer_email: 'Buyer@Example.com', payment_status: 'success', 'products[0][name]': 'Подписка', ...extra });

test('a Prodamus payment grants the subscription by email and a repeat does not extend it again', async () => fixture(async ({ store, notify }) => {
  assert.equal(await notify(success()), 200);
  const buyer = await store.findUserByEmail('buyer@example.com');
  const first = await store.planState(buyer.id);
  assert.equal(first.plan, 'subscription');
  assert.ok(Math.abs(first.expiresAt - Date.now() - 30 * 86_400_000) < 60_000);
  assert.equal(await notify(success()), 200);
  assert.equal((await store.planState(buyer.id)).expiresAt, first.expiresAt);
  assert.equal(await notify(success({ order_id: '1002', sum: '2070.00' })), 200);
  assert.equal((await store.planState(buyer.id)).expiresAt, first.expiresAt + 90 * 86_400_000);
}));

test('a wrong signature, an unknown amount or an unknown email changes nothing', async () => fixture(async ({ store, notify }) => {
  const buyer = await store.findUserByEmail('buyer@example.com');
  assert.equal(await notify(success(), { sign: 'bad' }), 403);
  assert.equal(await notify(success({ sum: '100.00' })), 200);
  assert.equal(await notify(success({ customer_email: 'nobody@example.com' })), 200);
  assert.equal(await notify(success({ payment_status: 'order_canceled' })), 200);
  assert.equal((await store.planState(buyer.id)).plan, 'free');
}));

test('the payment link carries the account email and the prices match the agreed ones', () => {
  assert.deepEqual(PRODAMUS_PRODUCTS.map((item) => [item.periodDays, item.priceRub]), [[30, 990], [90, 2070]]);
  assert.equal(new URL(payLink(PRODAMUS_PRODUCTS[0], 'a@b.ru')).searchParams.get('customer_email'), 'a@b.ru');
});
