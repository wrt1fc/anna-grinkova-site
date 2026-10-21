import { createHmac, timingSafeEqual } from 'node:crypto';
import catalog from '../../config/prodamus.json' with { type: 'json' };
import { normalizeEmail } from '../auth.js';

const DAY_MS = 86_400_000;
export const PRODAMUS_PLAN = catalog.plan;
export const PRODAMUS_PRODUCTS = catalog.products.map((product) => ({ ...product, amountKop: Math.round(product.priceRub * 100) }));

// Form fields like products[0][name] become nested objects/arrays.
export function parseForm(raw) {
  const root = {};
  for (const [key, value] of new URLSearchParams(raw)) {
    const path = key.split(/\]\[|\[|\]/).filter((part) => part !== '');
    let node = root;
    path.forEach((part, index) => {
      if (index === path.length - 1) { node[part] = value; return; }
      node[part] ??= {};
      node = node[part];
    });
  }
  return root;
}

// Prodamus signs the payload as JSON with sorted keys, every scalar turned into a string and "/" escaped.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return String(value ?? '');
}
export function signPayload(payload, secretKey) {
  const text = JSON.stringify(canonical(payload)).replaceAll('/', '\/');
  return createHmac('sha256', secretKey).update(text, 'utf8').digest('hex');
}
function sameSign(expected, received) {
  const a = Buffer.from(expected), b = Buffer.from(String(received ?? '').toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

// Payment link with the buyer's email filled in, so the notification names the account.
export function payLink(product, email) {
  const url = new URL(product.payUrl);
  if (email) url.searchParams.set('customer_email', email);
  url.searchParams.set('order_num', `${product.id}`);
  return url.toString();
}

// Link payments: the buyer pays on the Prodamus page, Prodamus calls us, and the plan period is granted by email.
export function createProdamus({ store, secretKey, now = Date.now }) {
  if (!secretKey) return null;

  // Returns the outcome: paid, duplicate, ignored, unknown_amount, unknown_user or bad_signature.
  async function handle(rawBody, signHeader) {
    const payload = parseForm(rawBody);
    if (!sameSign(signPayload(payload, secretKey), signHeader)) return 'bad_signature';
    if (payload.payment_status !== 'success') return 'ignored';
    const paymentId = String(payload.order_id ?? payload.payment_id ?? '');
    const product = PRODAMUS_PRODUCTS.find((item) => Math.round(Number(payload.sum) * 100) === item.amountKop);
    if (!paymentId) return 'ignored';
    if (!product) return 'unknown_amount';
    const email = normalizeEmail(payload.customer_email);
    const user = email ? await store.findUserByEmail(email) : null;
    if (!user) return 'unknown_user';
    return store.inTransaction(async (tx) => {
      await tx.lockUser(user.id);
      if (!(await tx.recordPaymentEvent('prodamus', `payment:${paymentId}`, now()))) return 'duplicate';
      const order = await tx.createOrder({ userId: user.id, productId: product.id, plan: PRODAMUS_PLAN, periodDays: product.periodDays,
        amountKop: product.amountKop, currency: 'RUB', provider: 'prodamus' }, now());
      await tx.setOrderProviderId(order.id, `prodamus:${paymentId}`, now());
      await tx.transitionOrder(order.id, 'pending', 'paid', now());
      const state = await tx.planState(user.id, now());
      const start = state.plan === PRODAMUS_PLAN && state.expiresAt ? state.expiresAt : now();
      await tx.setPlanPeriod(user.id, PRODAMUS_PLAN, start + product.periodDays * DAY_MS);
      return 'paid';
    });
  }

  return { handle, links: (email) => PRODAMUS_PRODUCTS.map((product) => ({ id: product.id, label: product.label, periodDays: product.periodDays,
    priceRub: product.priceRub, payUrl: payLink(product, email) })) };
}
