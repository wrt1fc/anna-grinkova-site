import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from '../server/http.js';
import { createStore } from '../server/store.js';
import { createTrafficLimiter } from '../server/traffic.js';
import { hashPassword } from '../server/auth.js';
import { parseForm, payLink, PRODAMUS_PRODUCTS, signPayload } from '../server/billing/prodamus.js';

const SECRET = 'prodamus-test-secret';
const PASSWORD = 'Very-long-password1!';

async function fixture(run, { webhookLimiter } = {}) {
  const store = await createStore('pglite:memory');
  const server = createServer({ store, prodamusKey: SECRET, publicUrl: 'https://anna.example', webhookLimiter,
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
  const post = (body, sign = 'x') => fetch(`${base}/api/billing/webhook/prodamus`, { method: 'POST', body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Sign: sign } });
  try { await run({ store, notify, post, userId: user.id ?? user }); }
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

test('an unsigned notification cannot change the objects of the running site', async () => fixture(async ({ post }) => {
  for (const body of ['__proto__[polluted]=1&sum=990', 'constructor[prototype][polluted]=1', 'products[__proto__][polluted]=1',
    'a[b][c][d][e][f]=1', Array.from({ length: 400 }, (_, i) => `f${i}=1`).join('&')]) {
    assert.equal((await post(body)).status, 400, body.slice(0, 40));
  }
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(Object.getPrototypeOf(parseForm('toString=1&valueOf=2')), null);
}));

test('the signature matches the one Prodamus builds: numbered fields are lists, "/" either plain or escaped', async () => fixture(async ({ store, post }) => {
  const body = 'sum=990.00&order_id=2001&customer_email=buyer%40example.com&payment_status=success'
    + '&products%5B0%5D%5Bname%5D=%D0%9F%D0%BE%D0%B4%D0%BF%D0%B8%D1%81%D0%BA%D0%B0&products%5B0%5D%5Bprice%5D=990.00&date=2026%2F10%2F21';
  // What prodamuspy signs: sorted keys, strings, lists for numbered levels, compact JSON without escaped Unicode.
  const json = '{"customer_email":"buyer@example.com","date":"2026/10/21","order_id":"2001","payment_status":"success",'
    + '"products":[{"name":"Подписка","price":"990.00"}],"sum":"990.00"}';
  assert.equal(signPayload(parseForm(body), SECRET), createHmac('sha256', SECRET).update(json).digest('hex'));
  const escaped = createHmac('sha256', SECRET).update(json.replaceAll('/', '\/')).digest('hex');
  assert.equal((await post(body, escaped)).status, 200);
  assert.equal((await store.planState((await store.findUserByEmail('buyer@example.com')).id)).plan, 'subscription');
}));

test('forged notifications are capped per address without touching visitor traffic', async () => {
  const { createTrafficLimiter: limiter } = await import('../server/traffic.js');
  await fixture(async ({ post }) => {
    assert.equal((await post('sum=1')).status, 403);
    assert.equal((await post('sum=1')).status, 403);
    assert.equal((await post('sum=1')).status, 429);
  }, { webhookLimiter: limiter({ perIpLimit: 2, globalLimit: 10 }) });
});
