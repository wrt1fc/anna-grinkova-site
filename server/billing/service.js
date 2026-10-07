import catalog from '../../config/products.json' with { type: 'json' };
import { planFor } from '../plans.js';

const DAY_MS = 86_400_000;
const FINAL_OUTCOMES = new Set(['paid', 'canceled', 'refunded', 'mismatch', 'noop']);
// Orders still pending after this long are re-checked with the provider by the daily job.
const RECONCILE_AFTER_MS = 15 * 60_000;
const RECONCILE_WINDOW_MS = 3 * DAY_MS;
// Payment regions: Russian cards (ЮKassa) in roubles, foreign cards (Robokassa) in USD/EUR.
export const REGIONS = catalog.regions;
export const PRODUCTS = catalog.products.map((product) => ({ ...product, amountKop: Math.round(product.priceRub * 100) }));
const productById = new Map(PRODUCTS.map((product) => [product.id, product]));

export function priceMinor(product, currency) {
  const major = currency === 'RUB' ? product.priceRub : product.prices?.[currency];
  return Number.isFinite(major) && major > 0 ? Math.round(major * 100) : null;
}

export function publicProduct(product) {
  const { id, label, plan, periodDays, priceRub, prices = {}, oncePerUser = false, autoRenewable = false } = product;
  return { id, label, plan, planLabel: planFor(plan).label, maxPeople: planFor(plan).maxPeople, periodDays, priceRub,
    prices: { RUB: priceRub, ...prices }, oncePerUser, autoRenewable };
}

class BillingError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

// Payment flow: order → provider payment → notification → re-read from provider → plan period.
// Access is granted only from the provider's confirmed state, never from the return redirect.
// `providers` maps a region id to its adapter; `provider` alone is the Russian region (older callers and tests).
export function createBilling({ store, provider = null, providers = null, publicUrl, now = Date.now }) {
  const byRegion = Object.fromEntries(Object.entries(providers ?? { ru: provider }).filter(([, item]) => item));
  const byName = new Map(Object.values(byRegion).map((item) => [item.name, item]));
  const defaultProvider = byRegion.ru?.name ?? [...byName.keys()][0];

  function regions() {
    return Object.entries(REGIONS).map(([id, region]) => ({ id, label: region.label, currencies: region.currencies, available: Boolean(byRegion[id]) }));
  }

  // Same plan extends the current period; a different plan starts a new period now.
  function activate(order, savedMethodId) {
    const state = store.planState(order.userId, now());
    const start = state.plan === order.plan && state.expiresAt ? state.expiresAt : now();
    store.setPlanPeriod(order.userId, order.plan, start + order.periodDays * DAY_MS);
    if (order.autoRenew && savedMethodId) store.setAutoRenewMethod(order.userId, savedMethodId, order.provider, order.currency);
  }

  function pickRegion(regionId, currency) {
    const region = REGIONS[regionId];
    if (!region) throw new BillingError(400, 'invalid_region', 'Выберите способ оплаты.');
    const chosen = currency ?? region.currencies[0];
    if (!region.currencies.includes(chosen)) throw new BillingError(400, 'invalid_currency', 'Эта валюта недоступна для выбранного способа оплаты.');
    const regionProvider = byRegion[regionId];
    if (!regionProvider) throw new BillingError(503, 'billing_unavailable', 'Этот способ оплаты пока не подключён.');
    return { provider: regionProvider, currency: chosen };
  }

  async function checkout(user, productId, { autoRenew = false, region = 'ru', currency } = {}) {
    if (!byName.size) throw new BillingError(503, 'billing_unavailable', 'Оплата пока не подключена.');
    const product = productById.get(productId);
    if (!product) throw new BillingError(404, 'product_not_found', 'Такого тарифа нет.');
    const picked = pickRegion(region, currency);
    const amountKop = priceMinor(product, picked.currency);
    if (!amountKop) throw new BillingError(400, 'invalid_currency', 'Для этого тарифа нет цены в выбранной валюте.');
    if (product.oncePerUser && store.hasPaidProduct(user.id, product.id)) {
      throw new BillingError(409, 'already_used', 'Тест-драйв можно оформить один раз.');
    }
    const order = store.createOrder({ userId: user.id, productId: product.id, plan: product.plan, periodDays: product.periodDays,
      amountKop, currency: picked.currency, provider: picked.provider.name, autoRenew: autoRenew && product.autoRenewable }, now());
    try {
      const payment = await picked.provider.createPayment({ order, description: product.label, email: user.email,
        returnUrl: `${publicUrl}/#account?payment=${order.id}`, savePaymentMethod: order.autoRenew });
      store.setOrderProviderId(order.id, payment.id, now());
      return { orderId: order.id, confirmationUrl: payment.confirmationUrl };
    } catch (error) {
      store.transitionOrder(order.id, 'pending', 'failed', now());
      console.error('Payment creation failed:', error.message);
      throw new BillingError(502, 'payment_failed', 'Не удалось создать платёж. Попробуйте позже.');
    }
  }

  function refund(order) {
    return store.inTransaction(() => {
      if (!store.transitionOrder(order.id, 'paid', 'refunded', now())) return 'noop';
      // A full refund ends the paid period at once.
      const state = store.planState(order.userId, now());
      if (state.plan === order.plan) store.setPlanPeriod(order.userId, order.plan, now());
      store.setAutoRenewMethod(order.userId, null);
      return 'refunded';
    });
  }

  // Applies a provider notification. The body only tells us which payment to look at; the facts come from the provider API.
  // The event is recorded only after a final outcome: if the provider API fails or still says "pending", the provider's
  // retry (or the reconciliation job) must be able to try again. Order transitions are idempotent, so a repeat is harmless.
  async function handleNotification(event, paymentId, providerName = defaultProvider) {
    const source = byName.get(providerName);
    if (!source || !/^(payment|refund)\.[a-z_]+$/.test(event) || typeof paymentId !== 'string' || !paymentId) return 'ignored';
    const outcome = await applyPayment(source, paymentId);
    if (FINAL_OUTCOMES.has(outcome)) store.recordPaymentEvent(source.name, `${event}:${paymentId}`, now());
    return outcome;
  }

  async function applyPayment(source, paymentId) {
    const order = store.getOrderByProviderId(paymentId);
    if (!order || order.provider !== source.name) return 'unknown_order';
    const payment = await source.getPayment(paymentId);
    if (source.requiresOrderId && payment.orderId == null) return 'mismatch';
    if (payment.orderId && payment.orderId !== order.id) return 'mismatch';
    // Robokassa reports foreign-currency payments in roubles after conversion, so amounts are compared in the same currency only.
    if (payment.amountKop != null && (payment.currency ?? 'RUB') === order.currency && payment.amountKop !== order.amountKop) {
      console.error(`Payment ${paymentId}: amount ${payment.amountKop} does not match order ${order.amountKop}`);
      return 'mismatch';
    }
    if (payment.status === 'succeeded' && payment.paid) {
      if (payment.refunded || payment.refundedKop >= order.amountKop) return refund(order);
      return store.inTransaction(() => {
        if (!store.transitionOrder(order.id, 'pending', 'paid', now())) return 'noop';
        activate(order, payment.savedMethodId);
        return 'paid';
      });
    }
    if (payment.status === 'canceled') {
      if (order.renewal) store.setAutoRenewMethod(order.userId, null);
      return store.transitionOrder(order.id, 'pending', 'canceled', now()) ? 'canceled' : 'noop';
    }
    return 'pending';
  }

  // Charges saved cards for periods ending before `horizon`, through the provider and currency of the first payment.
  async function renewDue(horizon = now() + DAY_MS) {
    const results = [];
    for (const due of store.dueRenewals(horizon, now())) {
      const source = byName.get(due.provider ?? defaultProvider);
      const currency = due.currency ?? 'RUB';
      const product = PRODUCTS.find((item) => item.plan === due.plan && item.autoRenewable);
      const amountKop = product ? priceMinor(product, currency) : null;
      if (!source || !amountKop) { store.setAutoRenewMethod(due.userId, null); continue; }
      const order = store.createOrder({ userId: due.userId, productId: product.id, plan: product.plan, periodDays: product.periodDays,
        amountKop, currency, provider: source.name, autoRenew: true, renewal: true }, now());
      try {
        const payment = await source.createPayment({ order, description: `${product.label} (продление)`, email: store.findUserById(due.userId)?.email,
          paymentMethodId: due.method });
        store.setOrderProviderId(order.id, payment.id, now());
        results.push({ userId: due.userId, orderId: order.id, status: payment.status });
      } catch (error) {
        store.transitionOrder(order.id, 'pending', 'failed', now());
        results.push({ userId: due.userId, orderId: order.id, status: 'failed', error: error.message });
      }
    }
    return results;
  }

  // Re-reads payments that stayed pending (a lost notification, a provider API outage) and applies their final state.
  async function reconcilePending() {
    const results = [];
    for (const order of store.pendingOrders(now() - RECONCILE_WINDOW_MS, now() - RECONCILE_AFTER_MS)) {
      const source = byName.get(order.provider);
      if (!source || !order.providerPaymentId) continue;
      try {
        results.push({ orderId: order.id, outcome: await handleNotification('payment.reconcile', order.providerPaymentId, source.name) });
      } catch (error) {
        results.push({ orderId: order.id, outcome: 'error', error: error.message });
      }
    }
    return results;
  }

  return { checkout, handleNotification, renewDue, reconcilePending, regions, providerByName: (name) => byName.get(name) ?? null,
    products: () => PRODUCTS.map(publicProduct) };
}

export { BillingError };
