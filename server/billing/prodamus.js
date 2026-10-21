import { createHmac, timingSafeEqual } from 'node:crypto';
import catalog from '../../config/prodamus.json' with { type: 'json' };
import { normalizeEmail } from '../auth.js';

const DAY_MS = 86_400_000;
export const PRODAMUS_PLAN = catalog.plan;
export const PRODAMUS_PRODUCTS = catalog.products.map((product) => ({ ...product, amountKop: Math.round(product.priceRub * 100) }));

// Limits on what an unsigned request may make us build before its signature is checked.
const MAX_FIELDS = 300;
const MAX_DEPTH = 5;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const BRACKETED = /^([^[]+)((?:\[[^\]]+\])+)$/;

// Form fields like products[0][name] become nested objects; numbered levels become lists, as Prodamus builds them for
// its signature. Objects have no prototype and keys like __proto__ are refused: the body is parsed before the signature
// is checked, so anyone could send it. Returns null for a body that does not look like a Prodamus form.
export function parseForm(raw) {
  const fields = [...new URLSearchParams(raw)];
  if (fields.length > MAX_FIELDS) return null;
  const root = Object.create(null);
  for (const [key, value] of fields) {
    const match = BRACKETED.exec(key);
    const path = match ? [match[1], ...[...match[2].matchAll(/\[([^\]]+)\]/g)].map((part) => part[1])] : [key];
    if (path.length > MAX_DEPTH || path.some((part) => FORBIDDEN_KEYS.has(part))) return null;
    let node = root;
    for (const [index, part] of path.entries()) {
      if (index === path.length - 1) { node[part] = value; break; }
      if (typeof node[part] !== 'object') node[part] = Object.create(null);
      node = node[part];
    }
  }
  return toLists(root);
}

function toLists(node) {
  if (typeof node !== 'object') return node;
  const keys = Object.keys(node);
  if (keys.length && keys.every((key) => /^\d{1,3}$/.test(key))) {
    // products[1] without products[0] still makes a list of two, the missing place empty, as on Prodamus' side.
    return Array.from({ length: Math.max(...keys.map(Number)) + 1 }, (_, index) => (String(index) in node ? toLists(node[index]) : {}));
  }
  const result = Object.create(null);
  for (const key of keys) result[key] = toLists(node[key]);
  return result;
}

// Prodamus signs the payload as JSON with sorted keys and every scalar turned into a string.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return String(value ?? '');
}
export function signPayload(payload, secretKey, { escapeSlashes = false } = {}) {
  const json = JSON.stringify(canonical(payload));
  return createHmac('sha256', secretKey).update(escapeSlashes ? json.replaceAll('/', '\\/') : json, 'utf8').digest('hex');
}
function sameSign(expected, received) {
  const a = Buffer.from(expected), b = Buffer.from(String(received ?? '').toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}
// PHP's json_encode writes "/" as "\/" unless told otherwise; both forms are keyed with our secret, so accepting either
// does not let anyone without the key through.
function validSign(payload, secretKey, received) {
  return sameSign(signPayload(payload, secretKey), received) || sameSign(signPayload(payload, secretKey, { escapeSlashes: true }), received);
}

// Payment link with the buyer's email filled in, so the notification names the account.
export function payLink(product, email) {
  const url = new URL(product.payUrl);
  if (email) url.searchParams.set('customer_email', email);
  url.searchParams.set('order_num', `${product.id}`);
  return url.toString();
}

// Link payments: the buyer pays on the Prodamus page, Prodamus calls us, and the plan period is granted by email.
// The 1 RUB test product is accepted only while PRODAMUS_TEST=1: otherwise anyone could buy a day of the plan for a rouble.
export function createProdamus({ store, secretKey, acceptTest = false, now = Date.now }) {
  if (!secretKey) return null;
  const offered = PRODAMUS_PRODUCTS.filter((product) => acceptTest || !product.test);

  // Returns { outcome, paymentId }: paid, duplicate, test_used, ignored, unknown_amount, unknown_user, bad_request or bad_signature.
  async function handle(rawBody, signHeader) {
    const result = await apply(rawBody, signHeader);
    return typeof result === 'string' ? { outcome: result, paymentId: null } : result;
  }

  async function apply(rawBody, signHeader) {
    const payload = parseForm(rawBody);
    if (!payload) return 'bad_request';
    if (!validSign(payload, secretKey, signHeader)) return 'bad_signature';
    if (payload.payment_status !== 'success') return 'ignored';
    const paymentId = String(payload.order_id ?? payload.payment_id ?? '');
    const product = offered.find((item) => Math.round(Number(payload.sum) * 100) === item.amountKop);
    if (!paymentId) return 'ignored';
    if (!product) return { outcome: 'unknown_amount', paymentId };
    const email = normalizeEmail(payload.customer_email);
    const user = email ? await store.findUserByEmail(email) : null;
    if (!user) return { outcome: 'unknown_user', paymentId };
    const outcome = await store.inTransaction(async (tx) => {
      await tx.lockUser(user.id);
      if (!(await tx.recordPaymentEvent('prodamus', `payment:${paymentId}`, now()))) return 'duplicate';
      // The rouble test grants one day once per account, so it cannot be bought again and again instead of the plan.
      if (product.test && await tx.hasPaidProduct(user.id, product.id)) return 'test_used';
      const order = await tx.createOrder({ userId: user.id, productId: product.id, plan: PRODAMUS_PLAN, periodDays: product.periodDays,
        amountKop: product.amountKop, currency: 'RUB', provider: 'prodamus' }, now());
      await tx.setOrderProviderId(order.id, `prodamus:${paymentId}`, now());
      await tx.transitionOrder(order.id, 'pending', 'paid', now());
      const state = await tx.planState(user.id, now());
      const start = state.plan === PRODAMUS_PLAN && state.expiresAt ? state.expiresAt : now();
      await tx.setPlanPeriod(user.id, PRODAMUS_PLAN, start + product.periodDays * DAY_MS);
      return 'paid';
    });
    return { outcome, paymentId };
  }

  return { handle, links: (email) => offered.map((product) => ({ id: product.id, label: product.label, periodDays: product.periodDays,
    priceRub: product.priceRub, payUrl: payLink(product, email) })) };
}
