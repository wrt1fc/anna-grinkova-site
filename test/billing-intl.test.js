import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createServer } from '../server/http.js';
import { createStore } from '../server/store.js';
import { createTrafficLimiter } from '../server/traffic.js';
import { hashPassword } from '../server/auth.js';
import { createTestProvider } from '../server/billing/test-provider.js';
import { createBilling } from '../server/billing/service.js';
import { createRobokassa } from '../server/billing/robokassa.js';
import { createMailRouter, isRussianMailbox } from '../server/mail.js';

const PASSWORD = 'Very-long-password1!';
const sha = (text) => createHash('sha256').update(text).digest('hex').toUpperCase();

async function fixture(run, providers) {
  const store = createStore(':memory:');
  const server = createServer({ store, paymentProviders: providers, publicUrl: 'https://anna.example',
    codeSecret: 'test-secret-with-at-least-thirty-two-characters', trafficLimiter: createTrafficLimiter({ perIpLimit: 500, globalLimit: 1000 }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, { method = 'GET', body, cookie, raw, type } = {}) => {
    const response = await fetch(base + path, { method, body: raw ?? (body ? JSON.stringify(body) : undefined),
      headers: { ...(body || raw ? { 'Content-Type': type ?? 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) } });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { response, data };
  };
  store.createUser('abroad@example.com', await hashPassword(PASSWORD), Date.now(), Date.now());
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'abroad@example.com', password: PASSWORD }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  try { await run({ store, request, cookie }); }
  finally { await new Promise((resolve) => server.close(resolve)); store.close(); }
}

test('products list both payment regions with prices in each currency', async () => fixture(async ({ request }) => {
  const { data } = await request('/api/billing/products');
  assert.deepEqual(data.regions.map((r) => [r.id, r.available]), [['ru', true], ['intl', false]]);
  assert.deepEqual(data.regions[1].currencies, ['USD', 'EUR']);
  assert.equal(data.products.find((p) => p.id === 'partner-30d').prices.RUB, 990);
  assert.ok(data.products.every((p) => p.prices.USD > 0 && p.prices.EUR > 0));
}, { ru: createTestProvider() }));

test('a foreign-card order is priced in its currency, goes to its provider and activates the plan', async () => {
  const ru = createTestProvider();
  const intl = createTestProvider({ name: 'intltest' });
  await fixture(async ({ store, request, cookie }) => {
    assert.equal((await request('/api/billing/checkout', { method: 'POST', body: { productId: 'family-30d', region: 'intl', currency: 'RUB' }, cookie })).response.status, 400);
    assert.equal((await request('/api/billing/checkout', { method: 'POST', body: { productId: 'family-30d', region: 'mars' }, cookie })).response.status, 400);
    const { data } = await request('/api/billing/checkout', { method: 'POST', body: { productId: 'family-30d', region: 'intl', currency: 'EUR' }, cookie });
    const order = store.getOrder(data.orderId);
    assert.equal(order.currency, 'EUR');
    assert.equal(order.amountKop, 1500);
    assert.equal(order.provider, 'intltest');
    assert.ok(Number.isSafeInteger(order.invoiceNo));
    intl.settle(order.providerPaymentId, { status: 'succeeded', paid: true });
    // The Russian provider's endpoint does not know this payment.
    await request('/api/billing/webhook/test', { method: 'POST', body: { event: 'payment.succeeded', object: { id: order.providerPaymentId } } });
    assert.equal(store.getOrder(order.id).status, 'pending');
    await request('/api/billing/webhook/intltest', { method: 'POST', body: { event: 'payment.succeeded', object: { id: order.providerPaymentId } } });
    assert.equal(store.getOrder(order.id).status, 'paid');
    assert.equal((await request('/api/billing/subscription', { cookie })).data.orders[0].currency, 'EUR');
  }, { ru, intl });
});

test('a region without a configured provider says so', async () => fixture(async ({ request, cookie }) => {
  const reply = await request('/api/billing/checkout', { method: 'POST', body: { productId: 'individual-30d', region: 'intl' }, cookie });
  assert.equal(reply.response.status, 503);
}, { ru: createTestProvider() }));

test('renewal charges the same provider and currency as the first payment', async () => {
  const ru = createTestProvider();
  const intl = createTestProvider({ name: 'intltest' });
  const store = createStore(':memory:');
  let clock = Date.now();
  try {
    const billing = createBilling({ store, providers: { ru, intl }, publicUrl: 'https://anna.example', now: () => clock });
    const user = store.createUser('renew-abroad@example.com', 'scrypt:x:y');
    const { orderId } = await billing.checkout(user, 'individual-30d', { autoRenew: true, region: 'intl', currency: 'USD' });
    const first = store.getOrder(orderId);
    intl.settle(first.providerPaymentId, { status: 'succeeded', paid: true });
    assert.equal(await billing.handleNotification('payment.succeeded', first.providerPaymentId, 'intltest'), 'paid');
    clock += 29.5 * 86_400_000;
    const [renewal] = await billing.renewDue();
    const renewed = store.getOrder(renewal.orderId);
    assert.equal(renewed.provider, 'intltest');
    assert.equal(renewed.currency, 'USD');
    assert.equal(renewed.amountKop, 900);
  } finally { store.close(); }
});

test('Robokassa: signed link, signed callback, OK answer and state re-read', async () => {
  const calls = [];
  const robokassa = createRobokassa({ merchantLogin: 'anna', password1: 'p1', password2: 'p2', fetchImpl: async (url) => {
    calls.push(String(url));
    return { ok: true, async text() {
      return `<OperationStateResponse><Result><Code>0</Code></Result><State><Code>100</Code></State>
        <Info><OutSum>1234.50</OutSum></Info><UserField><Field><Name>Shp_order</Name><Value>order-uuid</Value></Field></UserField></OperationStateResponse>`;
    } };
  } });
  const order = { id: 'order-uuid', invoiceNo: 42, amountKop: 1300, currency: 'USD' };
  const payment = await robokassa.createPayment({ order, description: 'Партнёрский, 30 дней', email: 'a@example.com', savePaymentMethod: true });
  const link = new URL(payment.confirmationUrl);
  assert.equal(link.origin + link.pathname, 'https://auth.robokassa.ru/Merchant/Index.aspx');
  assert.equal(link.searchParams.get('OutSum'), '13.00');
  assert.equal(link.searchParams.get('OutSumCurrency'), 'USD');
  assert.equal(link.searchParams.get('Recurring'), 'true');
  assert.equal(link.searchParams.get('SignatureValue'), sha('anna:13.00:42:USD:p1:Shp_order=order-uuid'));
  assert.equal(payment.id, '42');

  const good = new URLSearchParams({ OutSum: '1234.50', InvId: '42', Shp_order: 'order-uuid', SignatureValue: sha('1234.50:42:p2:Shp_order=order-uuid').toLowerCase() });
  assert.deepEqual(robokassa.parseNotification({ rawBody: good.toString() }), { ok: true, event: 'payment.succeeded', paymentId: '42' });
  const forged = new URLSearchParams({ OutSum: '1234.50', InvId: '42', Shp_order: 'order-uuid', SignatureValue: sha('1234.50:42:wrong:Shp_order=order-uuid') });
  assert.equal(robokassa.parseNotification({ rawBody: forged.toString() }).status, 403);
  assert.equal(robokassa.parseNotification({ rawBody: 'InvId=abc' }).status, 400);
  assert.equal(robokassa.acknowledge('42').body, 'OK42');

  const state = await robokassa.getPayment('42');
  assert.match(calls[0], /OpStateExt\?MerchantLogin=anna&InvoiceID=42&Signature=/);
  assert.equal(new URL(calls[0]).searchParams.get('Signature'), sha('anna:42:p2'));
  assert.deepEqual({ status: state.status, paid: state.paid, orderId: state.orderId, currency: state.currency }, { status: 'succeeded', paid: true, orderId: 'order-uuid', currency: 'RUB' });
  assert.equal(createRobokassa({ merchantLogin: '', password1: '', password2: '' }), null);
});

test('Robokassa callback on the webhook route gets the plain OK answer', async () => {
  const robokassa = createRobokassa({ merchantLogin: 'anna', password1: 'p1', password2: 'p2', fetchImpl: async () => ({ ok: true,
    async text() { return '<OperationStateResponse><Result><Code>0</Code></Result><State><Code>5</Code></State></OperationStateResponse>'; } }) });
  await fixture(async ({ store, request, cookie }) => {
    const { data } = await request('/api/billing/checkout', { method: 'POST', body: { productId: 'individual-30d', region: 'intl', currency: 'USD' }, cookie });
    const order = store.getOrder(data.orderId);
    const body = new URLSearchParams({ OutSum: '850.00', InvId: String(order.invoiceNo), Shp_order: order.id,
      SignatureValue: sha(`850.00:${order.invoiceNo}:p2:Shp_order=${order.id}`) }).toString();
    const reply = await request('/api/billing/webhook/robokassa', { method: 'POST', raw: body, type: 'application/x-www-form-urlencoded' });
    assert.equal(reply.response.status, 200);
    assert.equal(reply.data, `OK${order.invoiceNo}`);
    // State 5 (created) does not grant access.
    assert.equal(store.getOrder(order.id).status, 'pending');
    const forged = await request('/api/billing/webhook/robokassa', { method: 'POST', raw: body.replace('850.00', '1.00'), type: 'application/x-www-form-urlencoded' });
    assert.equal(forged.response.status, 403);
  }, { ru: createTestProvider(), intl: robokassa });
});

test('mail router keeps Russian mailboxes in Russia and falls back for foreign ones', async () => {
  const sent = [];
  const make = (name, fail = false) => ({ name, async sendCode(message) { if (fail) throw new Error('down'); sent.push([name, message.to]); } });
  assert.equal(isRussianMailbox('a@mail.ru'), true);
  assert.equal(isRussianMailbox('a@yandex.com'), true);
  assert.equal(isRussianMailbox('a@школа.рф'), true);
  assert.equal(isRussianMailbox('a@gmail.com'), false);
  const router = createMailRouter({ ru: make('ru'), intl: make('intl') });
  await router.sendCode({ to: 'a@mail.ru' });
  await router.sendCode({ to: 'b@gmail.com' });
  assert.deepEqual(sent, [['ru', 'a@mail.ru'], ['intl', 'b@gmail.com']]);
  const brokenAbroad = createMailRouter({ ru: make('ru'), intl: make('intl', true) });
  await brokenAbroad.sendCode({ to: 'c@outlook.com' });
  assert.deepEqual(sent.at(-1), ['ru', 'c@outlook.com']);
  const brokenRu = createMailRouter({ ru: make('ru', true), intl: make('intl') });
  await assert.rejects(brokenRu.sendCode({ to: 'd@bk.ru' }), /down/);
  assert.equal(createMailRouter({ ru: null, intl: null }), null);
});

test('a provider outage on the first notification does not swallow the retry, and the daily job catches lost ones', async () => {
  const provider = createTestProvider();
  const store = createStore(':memory:');
  let clock = Date.now();
  try {
    const billing = createBilling({ store, provider, publicUrl: 'https://anna.example', now: () => clock });
    const user = store.createUser('outage@example.com', 'scrypt:x:y');
    const first = store.getOrder((await billing.checkout(user, 'individual-30d')).orderId);
    provider.settle(first.providerPaymentId, { status: 'succeeded', paid: true });
    const getPayment = provider.getPayment;
    provider.getPayment = async () => { throw new Error('provider timeout'); };
    await assert.rejects(billing.handleNotification('payment.succeeded', first.providerPaymentId), /timeout/);
    provider.getPayment = getPayment;
    assert.equal(await billing.handleNotification('payment.succeeded', first.providerPaymentId), 'paid');
    assert.equal(await billing.handleNotification('payment.succeeded', first.providerPaymentId), 'noop');

    // A still-pending answer is not final either; the reconciliation job applies the payment later.
    const second = store.getOrder((await billing.checkout(user, 'family-30d')).orderId);
    assert.equal(await billing.handleNotification('payment.succeeded', second.providerPaymentId), 'pending');
    provider.settle(second.providerPaymentId, { status: 'succeeded', paid: true });
    assert.deepEqual(await billing.reconcilePending(), []);
    clock += 20 * 60_000;
    assert.deepEqual(await billing.reconcilePending(), [{ orderId: second.id, outcome: 'paid' }]);
    assert.equal(store.planState(user.id, clock).plan, 'family');
  } finally { store.close(); }
});

test('a Robokassa state without the signed order id is not trusted', async () => {
  const robokassa = createRobokassa({ merchantLogin: 'anna', password1: 'p1', password2: 'p2', fetchImpl: async () => ({ ok: true,
    async text() { return '<OperationStateResponse><Result><Code>0</Code></Result><State><Code>100</Code></State></OperationStateResponse>'; } }) });
  const store = createStore(':memory:');
  try {
    const billing = createBilling({ store, providers: { ru: createTestProvider(), intl: robokassa }, publicUrl: 'https://anna.example' });
    const user = store.createUser('noshp@example.com', 'scrypt:x:y');
    const order = store.getOrder((await billing.checkout(user, 'individual-30d', { region: 'intl', currency: 'USD' })).orderId);
    assert.equal(await billing.handleNotification('payment.succeeded', order.providerPaymentId, 'robokassa'), 'mismatch');
    assert.equal(store.getOrder(order.id).status, 'pending');
  } finally { store.close(); }
});
