// Orders, provider notifications and plan periods. Money is stored in minor units (kopecks, cents) to avoid float rounding;
// the amount_kop column keeps its name from the rouble-only first version. The schema is in schema.js.
import { randomUUID } from 'node:crypto';

export const ORDER_STATUSES = ['pending', 'paid', 'canceled', 'failed', 'refunded'];

const ORDER_COLUMNS = `id, user_id AS "userId", product_id AS "productId", plan, period_days AS "periodDays", amount_kop AS "amountKop",
  currency, status, provider, provider_payment_id AS "providerPaymentId", invoice_no AS "invoiceNo", auto_renew AS "autoRenew", renewal,
  created_at AS "createdAt", updated_at AS "updatedAt", paid_at AS "paidAt"`;

export function createBillingStore(q, { defaultPlan }) {
  async function planState(userId, now = Date.now()) {
    const row = await q.one('SELECT plan, plan_expires_at AS "expiresAt", autorenew_method_id AS method FROM users WHERE id = $1', [userId]);
    if (!row) return { plan: defaultPlan, expiresAt: null, autoRenew: false };
    // A paid period that has ended falls back to the free plan; an operator grant without an end date stays.
    const expired = row.expiresAt != null && row.expiresAt <= now;
    return { plan: expired ? defaultPlan : row.plan, expiresAt: expired ? null : row.expiresAt, autoRenew: !expired && row.method != null };
  }
  async function setPlanPeriod(userId, plan, expiresAt = null) {
    await q.run('UPDATE users SET plan = $1, plan_expires_at = $2 WHERE id = $3', [plan, expiresAt, userId]);
  }
  // A saved method belongs to one provider and one currency; renewals charge the same pair.
  async function setAutoRenewMethod(userId, methodId, provider = null, currency = null) {
    await q.run('UPDATE users SET autorenew_method_id = $1, autorenew_provider = $2, autorenew_currency = $3 WHERE id = $4',
      [methodId, methodId ? provider : null, methodId ? currency : null, userId]);
  }
  async function autoRenewMethod(userId) {
    return (await q.one('SELECT autorenew_method_id AS method FROM users WHERE id = $1', [userId]))?.method ?? null;
  }
  async function dueRenewals(before, now = Date.now()) {
    return q.query(`SELECT id AS "userId", plan, plan_expires_at AS "expiresAt", autorenew_method_id AS method,
      autorenew_provider AS provider, autorenew_currency AS currency FROM users
      WHERE autorenew_method_id IS NOT NULL AND plan_expires_at IS NOT NULL AND plan_expires_at > $1 AND plan_expires_at <= $2`, [now, before]);
  }

  async function createOrder({ userId, productId, plan, periodDays, amountKop, currency = 'RUB', provider, autoRenew = false, renewal = false }, now = Date.now()) {
    const id = randomUUID();
    await q.run(`INSERT INTO orders (id, user_id, product_id, plan, period_days, amount_kop, currency, status, provider,
      auto_renew, renewal, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, $11, $12)`,
    [id, userId, productId, plan, periodDays, amountKop, currency, provider, autoRenew, renewal, now, now]);
    return getOrder(id);
  }
  async function getOrder(id) { return q.one(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = $1`, [id]); }
  async function getOrderByProviderId(providerPaymentId) {
    return q.one(`SELECT ${ORDER_COLUMNS} FROM orders WHERE provider_payment_id = $1`, [providerPaymentId]);
  }
  async function listOrders(userId, limit = 20) {
    return q.query(`SELECT ${ORDER_COLUMNS} FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`, [userId, limit]);
  }
  async function setOrderProviderId(id, providerPaymentId, now = Date.now()) {
    await q.run('UPDATE orders SET provider_payment_id = $1, updated_at = $2 WHERE id = $3', [providerPaymentId, now, id]);
  }
  // Moves an order only from the expected status, so a replayed or late notification cannot apply twice.
  async function transitionOrder(id, from, to, now = Date.now()) {
    const paidAt = to === 'paid' ? now : null;
    return (await q.run('UPDATE orders SET status = $1, updated_at = $2, paid_at = COALESCE($3, paid_at) WHERE id = $4 AND status = $5',
      [to, now, paidAt, id, from])) === 1;
  }
  async function pendingOrders(after, before) {
    return q.query(`SELECT ${ORDER_COLUMNS} FROM orders WHERE status = 'pending' AND provider_payment_id IS NOT NULL
      AND created_at >= $1 AND created_at <= $2 ORDER BY created_at LIMIT 500`, [after, before]);
  }
  async function countRecentPending(userId, since) {
    return (await q.one(`SELECT COUNT(*) AS count FROM orders WHERE user_id = $1 AND status = 'pending' AND created_at >= $2`, [userId, since])).count;
  }
  async function hasPaidProduct(userId, productId) {
    return (await q.one(`SELECT 1 AS found FROM orders WHERE user_id = $1 AND product_id = $2 AND status IN ('paid', 'refunded') LIMIT 1`,
      [userId, productId])) != null;
  }
  // Returns false when this provider event was already handled.
  async function recordPaymentEvent(provider, eventKey, now = Date.now()) {
    return (await q.run('INSERT INTO payment_events (provider, event_key, received_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [provider, eventKey, now])) === 1;
  }

  return { planState, setPlanPeriod, setAutoRenewMethod, autoRenewMethod, dueRenewals, createOrder, getOrder, getOrderByProviderId,
    listOrders, setOrderProviderId, transitionOrder, pendingOrders, countRecentPending, hasPaidProduct, recordPaymentEvent };
}
