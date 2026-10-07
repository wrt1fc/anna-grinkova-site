import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from '../server/http.js';
import { createStore } from '../server/store.js';
import { createTrafficLimiter } from '../server/traffic.js';
import { hashPassword } from '../server/auth.js';
import { createTestProvider } from '../server/billing/test-provider.js';
import { createBilling } from '../server/billing/service.js';
import { YOOKASSA_NETWORKS, createAllowList } from '../server/billing/networks.js';
import { createYooKassa } from '../server/billing/yookassa.js';

const DAY = 86_400_000;
const PASSWORD = 'Very-long-password1!';

async function fixture(run, { provider = createTestProvider(), trustProxy = false } = {}) {
  const store = createStore(':memory:');
  const server = createServer({ store, paymentProvider: provider, trustProxy, publicUrl: 'https://anna.example',
    codeSecret: 'test-secret-with-at-least-thirty-two-characters', trafficLimiter: createTrafficLimiter({ perIpLimit: 500, globalLimit: 1000 }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, { method = 'GET', body, cookie, headers = {} } = {}) => {
    const response = await fetch(base + path, { method, body: body ? JSON.stringify(body) : undefined,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers } });
    return { response, data: await response.json() };
  };
  async function signIn(email = 'buyer@example.com') {
    store.createUser(email, await hashPassword(PASSWORD), Date.now(), Date.now());
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }) });
    return login.headers.get('set-cookie').split(';')[0];
  }
  const notify = (event, id, headers) => request('/api/billing/webhook/test', { method: 'POST', headers,
    body: { type: 'notification', event, object: event.startsWith('refund.') ? { id: 'r1', payment_id: id } : { id } } });
  try { await run({ store, request, signIn, notify, provider }); }
  finally { await new Promise((resolve) => server.close(resolve)); store.close(); }
}

async function buy(request, cookie, productId, extra = {}) {
  const { data } = await request('/api/billing/checkout', { method: 'POST', body: { productId, ...extra }, cookie });
  return data;
}

test('products are public and checkout needs an account', async () => fixture(async ({ request }) => {
  const { data } = await request('/api/billing/products');
  assert.deepEqual(data.products.map((p) => p.id), ['trial-7d', 'individual-30d', 'partner-30d', 'family-30d']);
  assert.equal(data.products.find((p) => p.id === 'partner-30d').maxPeople, 2);
  assert.equal((await request('/api/billing/checkout', { method: 'POST', body: { productId: 'individual-30d' } })).response.status, 401);
}));

test('a paid notification activates the plan; the return link alone does not', async () => fixture(async ({ store, request, signIn, notify, provider }) => {
  const cookie = await signIn();
  const checkout = await buy(request, cookie, 'partner-30d');
  assert.match(checkout.confirmationUrl, /^https:\/\/anna\.example\/#account\?payment=.+&test_payment=/);
  assert.equal((await request('/api/plan', { cookie })).data.plan.id, 'free');
  const order = store.getOrder(checkout.orderId);
  provider.settle(order.providerPaymentId, { status: 'succeeded', paid: true });
  assert.equal((await notify('payment.succeeded', order.providerPaymentId)).response.status, 200);
  const subscription = (await request('/api/billing/subscription', { cookie })).data;
  assert.equal(subscription.plan.id, 'partner');
  assert.ok(Math.abs(subscription.plan.expiresAt - (Date.now() + 30 * DAY)) < 60_000);
  assert.equal(subscription.orders[0].status, 'paid');
  assert.equal((await request(`/api/billing/orders/${checkout.orderId}`, { cookie })).data.order.status, 'paid');
}));

test('notifications from outside the provider network are refused', async () => fixture(async ({ store, request, signIn, notify, provider }) => {
  const cookie = await signIn();
  const { orderId } = await buy(request, cookie, 'individual-30d');
  const order = store.getOrder(orderId);
  provider.settle(order.providerPaymentId, { status: 'succeeded', paid: true });
  assert.equal((await notify('payment.succeeded', order.providerPaymentId, { 'X-Real-IP': '8.8.8.8' })).response.status, 403);
  assert.equal(store.getOrder(orderId).status, 'pending');
}, { trustProxy: true }));

test('a forged "succeeded" notification without a real payment changes nothing', async () => fixture(async ({ store, request, signIn, notify }) => {
  const cookie = await signIn();
  const { orderId } = await buy(request, cookie, 'family-30d');
  await notify('payment.succeeded', store.getOrder(orderId).providerPaymentId);
  assert.equal(store.getOrder(orderId).status, 'pending');
  assert.equal((await request('/api/plan', { cookie })).data.plan.id, 'free');
}));

test('a repeated notification is applied once and a wrong amount is never applied', async () => fixture(async ({ store, request, signIn, notify, provider }) => {
  const cookie = await signIn();
  const first = store.getOrder((await buy(request, cookie, 'individual-30d')).orderId);
  provider.settle(first.providerPaymentId, { status: 'succeeded', paid: true });
  await notify('payment.succeeded', first.providerPaymentId);
  const expiresAt = (await request('/api/billing/subscription', { cookie })).data.plan.expiresAt;
  await notify('payment.succeeded', first.providerPaymentId);
  assert.equal((await request('/api/billing/subscription', { cookie })).data.plan.expiresAt, expiresAt);

  const second = store.getOrder((await buy(request, cookie, 'family-30d')).orderId);
  provider.settle(second.providerPaymentId, { status: 'succeeded', paid: true, amountKop: 100 });
  await notify('payment.succeeded', second.providerPaymentId);
  assert.equal(store.getOrder(second.id).status, 'pending');
  assert.equal((await request('/api/plan', { cookie })).data.plan.id, 'individual');
}));

test('the same plan extends the period, and the trial can be bought once', async () => fixture(async ({ store, request, signIn, notify, provider }) => {
  const cookie = await signIn();
  for (const productId of ['trial-7d', 'individual-30d']) {
    const order = store.getOrder((await buy(request, cookie, productId)).orderId);
    provider.settle(order.providerPaymentId, { status: 'succeeded', paid: true });
    await notify('payment.succeeded', order.providerPaymentId);
  }
  const { expiresAt } = (await request('/api/billing/subscription', { cookie })).data.plan;
  assert.ok(Math.abs(expiresAt - (Date.now() + 37 * DAY)) < 60_000);
  const again = await request('/api/billing/checkout', { method: 'POST', body: { productId: 'trial-7d' }, cookie });
  assert.equal(again.response.status, 409);
}));

test('an expired period falls back to the free plan and locks extra profiles', () => {
  const store = createStore(':memory:');
  try {
    const user = store.createUser('late@example.com', 'scrypt:x:y');
    store.setPlanPeriod(user.id, 'family', Date.now() - 1000);
    assert.equal(store.getPlan(user.id), 'free');
    store.setPlanPeriod(user.id, 'family', Date.now() + DAY);
    assert.equal(store.getPlan(user.id), 'family');
    store.setPlan(user.id, 'partner');
    assert.equal(store.planState(user.id).expiresAt, null);
    assert.equal(store.getPlan(user.id), 'partner');
  } finally { store.close(); }
});

test('a full refund ends the period and cancels auto-renewal', async () => fixture(async ({ store, request, signIn, notify, provider }) => {
  const cookie = await signIn();
  const order = store.getOrder((await buy(request, cookie, 'partner-30d', { autoRenew: true })).orderId);
  provider.settle(order.providerPaymentId, { status: 'succeeded', paid: true });
  await notify('payment.succeeded', order.providerPaymentId);
  assert.equal((await request('/api/billing/subscription', { cookie })).data.plan.autoRenew, true);
  provider.settle(order.providerPaymentId, { refundedKop: order.amountKop });
  await notify('refund.succeeded', order.providerPaymentId);
  const subscription = (await request('/api/billing/subscription', { cookie })).data;
  assert.equal(subscription.plan.id, 'free');
  assert.equal(subscription.orders[0].status, 'refunded');
}));

test('auto-renewal charges the saved method and extends the plan after the notification', async () => {
  const provider = createTestProvider();
  const store = createStore(':memory:');
  let clock = Date.now();
  try {
    const billing = createBilling({ store, provider, publicUrl: 'https://anna.example', now: () => clock });
    const user = store.createUser('renew@example.com', 'scrypt:x:y');
    const { orderId } = await billing.checkout(user, 'individual-30d', { autoRenew: true });
    const order = store.getOrder(orderId);
    provider.settle(order.providerPaymentId, { status: 'succeeded', paid: true });
    assert.equal(await billing.handleNotification('payment.succeeded', order.providerPaymentId), 'paid');
    clock += 29.5 * DAY;
    const [renewal] = await billing.renewDue();
    assert.equal(renewal.status, 'succeeded');
    const renewed = store.getOrder(renewal.orderId);
    assert.equal(await billing.handleNotification('payment.succeeded', renewed.providerPaymentId), 'paid');
    assert.ok(Math.abs(store.planState(user.id, clock).expiresAt - (order.createdAt + 60 * DAY)) < 60_000);
    assert.equal(renewed.renewal, true);
  } finally { store.close(); }
});

test('orders of other users are not visible', async () => fixture(async ({ request, signIn }) => {
  const owner = await signIn('owner@example.com');
  const stranger = await signIn('stranger@example.com');
  const { orderId } = await buy(request, owner, 'individual-30d');
  assert.equal((await request(`/api/billing/orders/${orderId}`, { cookie: stranger })).response.status, 404);
  assert.equal((await request('/api/billing/subscription', { cookie: stranger })).data.orders.length, 0);
}));

test('without a configured provider checkout says payments are off', async () => fixture(async ({ request, signIn }) => {
  const cookie = await signIn();
  const reply = await request('/api/billing/checkout', { method: 'POST', body: { productId: 'individual-30d' }, cookie });
  assert.equal(reply.response.status, 503);
  assert.equal((await request('/api/billing/webhook/yookassa', { method: 'POST', body: {} })).response.status, 404);
}, { provider: null }));

test('YooKassa allow-list matches its published networks only', () => {
  const trusted = createAllowList(YOOKASSA_NETWORKS);
  for (const ip of ['185.71.76.1', '185.71.77.30', '77.75.153.100', '77.75.154.200', '77.75.156.11', '::ffff:185.71.76.1', '2a02:5180::1']) assert.equal(trusted(ip), true, ip);
  for (const ip of ['185.71.76.40', '77.75.156.12', '127.0.0.1', '8.8.8.8', 'not-an-ip']) assert.equal(trusted(ip), false, ip);
});

test('the YooKassa adapter sends an idempotent payment with a 54-FZ receipt and re-reads payments', async () => {
  const calls = [];
  const yookassa = createYooKassa({ shopId: '123', secretKey: 'test_key', fetchImpl: async (url, options) => {
    calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    return { ok: true, async json() { return { id: 'p1', status: 'pending', paid: false, amount: { value: '990.00', currency: 'RUB' },
      metadata: { orderId: 'order-1' }, confirmation: { confirmation_url: 'https://yoomoney.ru/checkout/p1' } }; } };
  } });
  const payment = await yookassa.createPayment({ order: { id: 'order-1', amountKop: 99000 }, description: 'Партнёрский, 30 дней',
    returnUrl: 'https://anna.example/#account', email: 'buyer@example.com', savePaymentMethod: true });
  assert.equal(calls[0].url, 'https://api.yookassa.ru/v3/payments');
  assert.equal(calls[0].options.headers['Idempotence-Key'], 'order-1');
  assert.equal(calls[0].options.headers.Authorization, `Basic ${Buffer.from('123:test_key').toString('base64')}`);
  assert.deepEqual(calls[0].body.amount, { value: '990.00', currency: 'RUB' });
  assert.equal(calls[0].body.receipt.customer.email, 'buyer@example.com');
  assert.equal(calls[0].body.receipt.items[0].payment_subject, 'service');
  assert.equal(calls[0].body.save_payment_method, true);
  assert.equal(payment.amountKop, 99000);
  assert.equal(payment.confirmationUrl, 'https://yoomoney.ru/checkout/p1');
  await yookassa.getPayment('p1');
  assert.equal(calls[1].url, 'https://api.yookassa.ru/v3/payments/p1');
  assert.equal(createYooKassa({ shopId: '', secretKey: '' }), null);
});
