import { BillingError } from '../billing/service.js';
import { publicPlan } from '../plans.js';
import { clientAddress } from '../traffic.js';

const ORDER_PATH = /^\/api\/billing\/orders\/([0-9a-f-]{36})$/;
const WEBHOOK_PATH = /^\/api\/billing\/webhook\/([a-z]+)$/;
const MAX_WEBHOOK_BYTES = 64_000;
const CURRENCY = /^[A-Z]{3}$/;

const publicOrder = ({ id, productId, plan, periodDays, amountKop, currency, status, autoRenew, renewal, createdAt, paidAt }) =>
  ({ id, productId, plan, periodDays, amount: amountKop / 100, currency, status, autoRenew, renewal, createdAt, paidAt });

// Providers send JSON (ЮKassa) or a form (Robokassa ResultURL), so the adapter parses the raw body itself.
async function readRaw(req, maxBytes = MAX_WEBHOOK_BYTES) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function invalidCheckout(body) {
  return typeof body.productId !== 'string' || (body.autoRenew !== undefined && typeof body.autoRenew !== 'boolean')
    || (body.region !== undefined && typeof body.region !== 'string')
    || (body.currency !== undefined && !(typeof body.currency === 'string' && CURRENCY.test(body.currency)));
}

export function createBillingRoutes({ store, billing, trustProxy, metrics }) {
  async function webhook({ req, res, json }, providerName) {
    const provider = billing.providerByName(providerName);
    if (!provider) return json(res, 404, { error: 'not_found' });
    const note = provider.parseNotification({ rawBody: await readRaw(req), contentType: req.headers['content-type'] ?? '',
      ip: clientAddress(req, trustProxy) });
    if (!note.ok) {
      metrics.count('billing_webhook_rejected');
      return json(res, note.status, { error: note.status === 403 ? 'forbidden' : 'invalid_notification' });
    }
    try {
      const outcome = await billing.handleNotification(note.event, note.paymentId, provider.name);
      metrics.count(`billing_${outcome}`);
      const ack = provider.acknowledge?.(note.paymentId);
      if (!ack) return json(res, 200, { ok: true });
      res.writeHead(ack.status, { 'Content-Type': ack.contentType, 'Cache-Control': 'no-store' });
      return res.end(ack.body);
    } catch (error) {
      // A non-200 answer makes the provider retry later, which is what we want on a temporary failure.
      console.error('Billing notification failed:', error.message);
      return json(res, 500, { error: 'retry_later' });
    }
  }

  return async function handleBillingRoutes(ctx) {
    const { req, res, path, user, json, readJson } = ctx;
    if (!path.startsWith('/api/billing/')) return false;
    if (path === '/api/billing/products' && req.method === 'GET') {
      return json(res, 200, { products: billing.products(), regions: billing.regions() }), true;
    }
    const hook = WEBHOOK_PATH.exec(path);
    if (hook && req.method === 'POST') return await webhook(ctx, hook[1]), true;
    if (!user) return json(res, 401, { error: 'login_required' }), true;
    if (path === '/api/billing/checkout' && req.method === 'POST') {
      const body = await readJson(req);
      if (invalidCheckout(body)) return json(res, 400, { error: 'invalid_request' }), true;
      try {
        return json(res, 201, await billing.checkout(user, body.productId, { autoRenew: body.autoRenew === true,
          region: body.region ?? 'ru', currency: body.currency })), true;
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
