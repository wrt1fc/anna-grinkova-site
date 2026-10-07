import { BillingError } from '../billing/service.js';
import { publicPlan } from '../plans.js';
import { clientAddress } from '../traffic.js';

const ORDER_PATH = /^\/api\/billing\/orders\/([0-9a-f-]{36})$/;
const WEBHOOK_PATH = /^\/api\/billing\/webhook\/([a-z]+)$/;

const publicOrder = ({ id, productId, plan, periodDays, amountKop, status, autoRenew, renewal, createdAt, paidAt }) =>
  ({ id, productId, plan, periodDays, amountRub: amountKop / 100, status, autoRenew, renewal, createdAt, paidAt });

export function createBillingRoutes({ store, billing, provider, trustProxy, metrics }) {
  async function webhook({ req, res, json, readJson }, providerName) {
    if (!provider || providerName !== provider.name) return json(res, 404, { error: 'not_found' });
    // Notifications have no signature: only the provider's own networks may call this endpoint.
    if (!provider.isTrustedSender(clientAddress(req, trustProxy))) {
      metrics.count('billing_webhook_rejected');
      return json(res, 403, { error: 'forbidden' });
    }
    const body = await readJson(req, 64_000);
    const paymentId = body.event?.startsWith('refund.') ? body.object?.payment_id : body.object?.id;
    try {
      const outcome = await billing.handleNotification(body.event, paymentId);
      metrics.count(`billing_${outcome}`);
      return json(res, 200, { ok: true });
    } catch (error) {
      // A non-200 answer makes the provider retry later, which is what we want on a temporary failure.
      console.error('Billing notification failed:', error.message);
      return json(res, 500, { error: 'retry_later' });
    }
  }

  return async function handleBillingRoutes(ctx) {
    const { req, res, path, user, json, readJson } = ctx;
    if (!path.startsWith('/api/billing/')) return false;
    if (path === '/api/billing/products' && req.method === 'GET') return json(res, 200, { products: billing.products() }), true;
    const hook = WEBHOOK_PATH.exec(path);
    if (hook && req.method === 'POST') return await webhook(ctx, hook[1]), true;
    if (!user) return json(res, 401, { error: 'login_required' }), true;
    if (path === '/api/billing/checkout' && req.method === 'POST') {
      const body = await readJson(req);
      if (typeof body.productId !== 'string' || (body.autoRenew !== undefined && typeof body.autoRenew !== 'boolean')) {
        return json(res, 400, { error: 'invalid_request' }), true;
      }
      try {
        return json(res, 201, await billing.checkout(user, body.productId, { autoRenew: body.autoRenew === true })), true;
      } catch (error) {
        if (error instanceof BillingError) return json(res, error.status, { error: error.code, message: error.message }), true;
        throw error;
      }
    }
    if (path === '/api/billing/subscription' && req.method === 'GET') {
      const state = store.planState(user.id);
      return json(res, 200, { plan: { ...publicPlan(state.plan), expiresAt: state.expiresAt, autoRenew: state.autoRenew },
        orders: store.listOrders(user.id).map(publicOrder) }), true;
    }
    if (path === '/api/billing/autorenew' && req.method === 'DELETE') {
      store.setAutoRenewMethod(user.id, null);
      return json(res, 200, { autoRenew: false }), true;
    }
    const match = ORDER_PATH.exec(path);
    if (match && req.method === 'GET') {
      const order = store.getOrder(match[1]);
      return (order && order.userId === user.id ? json(res, 200, { order: publicOrder(order) }) : json(res, 404, { error: 'not_found' })), true;
    }
    return false;
  };
}
