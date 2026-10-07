// Orders, provider notifications and plan periods. Money is stored in kopecks to avoid float rounding.
import { randomUUID } from 'node:crypto';

export const ORDER_STATUSES = ['pending', 'paid', 'canceled', 'failed', 'refunded'];

export function migrateBilling(db) {
  const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((row) => row.name));
  if (!userColumns.has('plan_expires_at')) db.exec('ALTER TABLE users ADD COLUMN plan_expires_at INTEGER');
  if (!userColumns.has('autorenew_method_id')) db.exec('ALTER TABLE users ADD COLUMN autorenew_method_id TEXT');
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      product_id TEXT NOT NULL, plan TEXT NOT NULL, period_days INTEGER NOT NULL,
      amount_kop INTEGER NOT NULL CHECK(amount_kop > 0), currency TEXT NOT NULL DEFAULT 'RUB',
      status TEXT NOT NULL CHECK(status IN (${ORDER_STATUSES.map((s) => `'${s}'`).join(',')})),
      provider TEXT NOT NULL, provider_payment_id TEXT UNIQUE, auto_renew INTEGER NOT NULL DEFAULT 0,
      renewal INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, paid_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id, created_at);
    CREATE TABLE IF NOT EXISTS payment_events (
      provider TEXT NOT NULL, event_key TEXT NOT NULL, received_at INTEGER NOT NULL, PRIMARY KEY(provider, event_key)
    );
  `);
}

const ORDER_COLUMNS = `id, user_id AS userId, product_id AS productId, plan, period_days AS periodDays, amount_kop AS amountKop,
  currency, status, provider, provider_payment_id AS providerPaymentId, auto_renew AS autoRenew, renewal,
  created_at AS createdAt, updated_at AS updatedAt, paid_at AS paidAt`;

export function createBillingStore(db, { defaultPlan }) {
  const toOrder = (row) => row && { ...row, autoRenew: row.autoRenew === 1, renewal: row.renewal === 1 };

  function planState(userId, now = Date.now()) {
    const row = db.prepare('SELECT plan, plan_expires_at AS expiresAt, autorenew_method_id AS method FROM users WHERE id = ?').get(userId);
    if (!row) return { plan: defaultPlan, expiresAt: null, autoRenew: false };
    // A paid period that has ended falls back to the free plan; an operator grant without an end date stays.
    const expired = row.expiresAt != null && row.expiresAt <= now;
    return { plan: expired ? defaultPlan : row.plan, expiresAt: expired ? null : row.expiresAt, autoRenew: !expired && row.method != null };
  }
  function setPlanPeriod(userId, plan, expiresAt = null) {
    db.prepare('UPDATE users SET plan = ?, plan_expires_at = ? WHERE id = ?').run(plan, expiresAt, userId);
  }
  function setAutoRenewMethod(userId, methodId) {
    db.prepare('UPDATE users SET autorenew_method_id = ? WHERE id = ?').run(methodId, userId);
  }
  function autoRenewMethod(userId) {
    return db.prepare('SELECT autorenew_method_id AS method FROM users WHERE id = ?').get(userId)?.method ?? null;
  }
  function dueRenewals(before, now = Date.now()) {
    return db.prepare(`SELECT id AS userId, plan, plan_expires_at AS expiresAt, autorenew_method_id AS method FROM users
      WHERE autorenew_method_id IS NOT NULL AND plan_expires_at IS NOT NULL AND plan_expires_at > ? AND plan_expires_at <= ?`).all(now, before);
  }

  function createOrder({ userId, productId, plan, periodDays, amountKop, provider, autoRenew = false, renewal = false }, now = Date.now()) {
    const id = randomUUID();
    db.prepare(`INSERT INTO orders (id, user_id, product_id, plan, period_days, amount_kop, status, provider, auto_renew, renewal, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`).run(id, userId, productId, plan, periodDays, amountKop, provider,
      autoRenew ? 1 : 0, renewal ? 1 : 0, now, now);
    return getOrder(id);
  }
  function getOrder(id) { return toOrder(db.prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = ?`).get(id)) ?? null; }
  function getOrderByProviderId(providerPaymentId) {
    return toOrder(db.prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE provider_payment_id = ?`).get(providerPaymentId)) ?? null;
  }
  function listOrders(userId, limit = 20) {
    return db.prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`).all(userId, limit).map(toOrder);
  }
  function setOrderProviderId(id, providerPaymentId, now = Date.now()) {
    db.prepare('UPDATE orders SET provider_payment_id = ?, updated_at = ? WHERE id = ?').run(providerPaymentId, now, id);
  }
  // Moves an order only from the expected status, so a replayed or late notification cannot apply twice.
  function transitionOrder(id, from, to, now = Date.now()) {
    const paidAt = to === 'paid' ? now : null;
    return db.prepare(`UPDATE orders SET status = ?, updated_at = ?, paid_at = COALESCE(?, paid_at) WHERE id = ? AND status = ?`)
      .run(to, now, paidAt, id, from).changes === 1;
  }
  function hasPaidProduct(userId, productId) {
    return db.prepare(`SELECT 1 FROM orders WHERE user_id = ? AND product_id = ? AND status IN ('paid','refunded') LIMIT 1`).get(userId, productId) != null;
  }
  // Returns false when this provider event was already handled.
  function recordPaymentEvent(provider, eventKey, now = Date.now()) {
    return db.prepare('INSERT OR IGNORE INTO payment_events (provider, event_key, received_at) VALUES (?, ?, ?)').run(provider, eventKey, now).changes === 1;
  }
  function inTransaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  return { planState, setPlanPeriod, setAutoRenewMethod, autoRenewMethod, dueRenewals, createOrder, getOrder, getOrderByProviderId,
    listOrders, setOrderProviderId, transitionOrder, hasPaidProduct, recordPaymentEvent, inTransaction };
}
