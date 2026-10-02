import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { PLANS } from './catalog.js';

export function createStore(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS birth_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      birth_date TEXT NOT NULL, birth_time TEXT NOT NULL, birth_place TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), plan_id TEXT NOT NULL,
      price_kopeks INTEGER NOT NULL CHECK(price_kopeks > 0), status TEXT NOT NULL,
      provider_payment_id TEXT UNIQUE, created_at INTEGER NOT NULL, paid_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS entitlements (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      order_id TEXT NOT NULL REFERENCES orders(id), feature TEXT NOT NULL,
      starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
      UNIQUE(order_id, feature)
    );
    CREATE INDEX IF NOT EXISTS entitlements_lookup ON entitlements(user_id, feature, ends_at);
  `);

  function createUser(email, passwordHash, now = Date.now()) {
    const result = db.prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)')
      .run(email, passwordHash, now);
    return { id: Number(result.lastInsertRowid), email };
  }

  function findUserByEmail(email) {
    return db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(email) ?? null;
  }

  function findUserById(id) {
    return db.prepare('SELECT id, email FROM users WHERE id = ?').get(id) ?? null;
  }

  function saveSession(tokenHash, userId, expiresAt) {
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(tokenHash, userId, expiresAt);
  }

  function userForSession(tokenHash, now = Date.now()) {
    return db.prepare(`SELECT users.id, users.email FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(tokenHash, now) ?? null;
  }

  function deleteSession(tokenHash) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  function getBirthProfile(userId) {
    const row = db.prepare('SELECT birth_date AS birthDate, birth_time AS birthTime, birth_place AS birthPlace FROM birth_profiles WHERE user_id = ?').get(userId);
    return row ?? null;
  }

  function saveBirthProfile(userId, profile, now = Date.now()) {
    db.prepare(`INSERT INTO birth_profiles (user_id, birth_date, birth_time, birth_place, updated_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
      birth_date = excluded.birth_date, birth_time = excluded.birth_time,
      birth_place = excluded.birth_place, updated_at = excluded.updated_at`)
      .run(userId, profile.birthDate, profile.birthTime, profile.birthPlace, now);
    return getBirthProfile(userId);
  }

  function createOrder(userId, planId, priceKopeks, now = Date.now()) {
    if (!PLANS[planId]) throw new Error('Unknown plan');
    if (!Number.isSafeInteger(priceKopeks) || priceKopeks <= 0) throw new Error('Invalid price');
    const order = { id: randomUUID(), userId, planId, priceKopeks, status: 'pending' };
    db.prepare(`INSERT INTO orders (id, user_id, plan_id, price_kopeks, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(order.id, userId, planId, priceKopeks, order.status, now);
    return order;
  }

  function getOrder(id) {
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(id) ?? null;
  }

  function confirmPayment(orderId, providerPaymentId, now = Date.now()) {
    if (typeof providerPaymentId !== 'string' || !providerPaymentId.trim()) throw new Error('Missing provider payment id');
    db.exec('BEGIN IMMEDIATE');
    try {
      const order = getOrder(orderId);
      if (!order) throw new Error('Unknown order');
      if (order.status === 'paid' && order.provider_payment_id === providerPaymentId) {
        db.exec('COMMIT');
        return;
      }
      if (order.status !== 'pending') throw new Error('Order cannot be paid');
      const plan = PLANS[order.plan_id];
      if (!plan) throw new Error('Unknown plan');
      db.prepare(`UPDATE orders SET status = 'paid', provider_payment_id = ?, paid_at = ? WHERE id = ?`)
        .run(providerPaymentId, now, orderId);
      const insert = db.prepare(`INSERT INTO entitlements (user_id, order_id, feature, starts_at, ends_at)
        VALUES (?, ?, ?, ?, ?)`);
      for (const feature of plan.features) insert.run(order.user_id, orderId, feature, now, now + plan.durationMs);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function refundPayment(orderId, providerPaymentId) {
    const result = db.prepare(`UPDATE orders SET status = 'refunded'
      WHERE id = ? AND status = 'paid' AND provider_payment_id = ?`).run(orderId, providerPaymentId);
    if (result.changes !== 1) throw new Error('Paid order not found');
  }

  function hasAccess(userId, feature, now = Date.now()) {
    return !!db.prepare(`SELECT 1 FROM entitlements e JOIN orders o ON o.id = e.order_id
      WHERE e.user_id = ? AND e.feature = ? AND e.starts_at <= ? AND e.ends_at > ?
      AND o.status = 'paid' LIMIT 1`).get(userId, feature, now, now);
  }

  function listEntitlements(userId) {
    return db.prepare(`SELECT e.feature, e.starts_at AS startsAt, e.ends_at AS endsAt,
      o.status, o.plan_id AS planId FROM entitlements e JOIN orders o ON o.id = e.order_id
      WHERE e.user_id = ? ORDER BY e.ends_at DESC`).all(userId);
  }

  return {
    createUser, findUserByEmail, findUserById, saveSession, userForSession,
    getBirthProfile, saveBirthProfile,
    deleteSession, createOrder, getOrder, confirmPayment, refundPayment,
    hasAccess, listEntitlements, close: () => db.close(),
  };
}
