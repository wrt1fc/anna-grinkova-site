import catalog from '../../config/products.json' with { type: 'json' };
import { planFor } from '../plans.js';

const DAY_MS = 86_400_000;
export const PRODUCTS = catalog.products.map((product) => ({ ...product, amountKop: Math.round(product.priceRub * 100) }));
const productById = new Map(PRODUCTS.map((product) => [product.id, product]));

export function publicProduct(product) {
  const { id, label, plan, periodDays, priceRub, oncePerUser = false, autoRenewable = false } = product;
  return { id, label, plan, planLabel: planFor(plan).label, maxPeople: planFor(plan).maxPeople, periodDays, priceRub, oncePerUser, autoRenewable };
}

class BillingError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

// Payment flow: order → provider payment → notification → re-read from provider → plan period.
// Access is granted only from the provider's confirmed state, never from the return redirect.
export function createBilling({ store, provider, publicUrl, now = Date.now }) {
  // Same plan extends the current period; a different plan starts a new period now.
  function activate(order, savedMethodId) {
    const state = store.planState(order.userId, now());
    const start = state.plan === order.plan && state.expiresAt ? state.expiresAt : now();
    store.setPlanPeriod(order.userId, order.plan, start + order.periodDays * DAY_MS);
    if (order.autoRenew && savedMethodId) store.setAutoRenewMethod(order.userId, savedMethodId);
  }

  async function checkout(user, productId, { autoRenew = false } = {}) {
    if (!provider) throw new BillingError(503, 'billing_unavailable', 'Оплата пока не подключена.');
    const product = productById.get(productId);
    if (!product) throw new BillingError(404, 'product_not_found', 'Такого тарифа нет.');
    if (product.oncePerUser && store.hasPaidProduct(user.id, product.id)) {
      throw new BillingError(409, 'already_used', 'Тест-драйв можно оформить один раз.');
    }
    const order = store.createOrder({ userId: user.id, productId: product.id, plan: product.plan, periodDays: product.periodDays,
      amountKop: product.amountKop, provider: provider.name, autoRenew: autoRenew && product.autoRenewable }, now());
    try {
      const payment = await provider.createPayment({ order, description: product.label, email: user.email,
        returnUrl: `${publicUrl}/#account?payment=${order.id}`, savePaymentMethod: order.autoRenew });
      store.setOrderProviderId(order.id, payment.id, now());
      return { orderId: order.id, confirmationUrl: payment.confirmationUrl };
    } catch (error) {
      store.transitionOrder(order.id, 'pending', 'failed', now());
      console.error('Payment creation failed:', error.message);
      throw new BillingError(502, 'payment_failed', 'Не удалось создать платёж. Попробуйте позже.');
    }
  }

  // Applies a provider notification. The body only tells us which payment to look at; the facts come from the provider API.
  async function handleNotification(event, paymentId) {
    if (!/^(payment|refund)\.[a-z_]+$/.test(event) || typeof paymentId !== 'string' || !paymentId) return 'ignored';
    if (!store.recordPaymentEvent(provider.name, `${event}:${paymentId}`, now())) return 'duplicate';
    const order = store.getOrderByProviderId(paymentId);
    if (!order) return 'unknown_order';
    const payment = await provider.getPayment(paymentId);
    if (payment.orderId && payment.orderId !== order.id) return 'mismatch';
    if (payment.amountKop !== order.amountKop) {
      console.error(`Payment ${paymentId}: amount ${payment.amountKop} does not match order ${order.amountKop}`);
      return 'mismatch';
    }
    if (payment.status === 'succeeded' && payment.paid) {
      if (payment.refundedKop >= order.amountKop) {
        return store.inTransaction(() => {
          if (!store.transitionOrder(order.id, 'paid', 'refunded', now())) return 'noop';
          // A full refund ends the paid period at once.
          const state = store.planState(order.userId, now());
          if (state.plan === order.plan) store.setPlanPeriod(order.userId, order.plan, now());
          store.setAutoRenewMethod(order.userId, null);
          return 'refunded';
        });
      }
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

  // Charges saved cards for periods ending before `horizon`. Run from a daily job.
  async function renewDue(horizon = now() + DAY_MS) {
    if (!provider) return [];
    const results = [];
    for (const due of store.dueRenewals(horizon, now())) {
      const product = PRODUCTS.find((item) => item.plan === due.plan && item.autoRenewable);
      if (!product) { store.setAutoRenewMethod(due.userId, null); continue; }
      const order = store.createOrder({ userId: due.userId, productId: product.id, plan: product.plan, periodDays: product.periodDays,
        amountKop: product.amountKop, provider: provider.name, autoRenew: true, renewal: true }, now());
      try {
        const payment = await provider.createPayment({ order, description: `${product.label} (продление)`, email: store.findUserById(due.userId)?.email,
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

  return { checkout, handleNotification, renewDue, products: () => PRODUCTS.map(publicProduct) };
}

export { BillingError };
