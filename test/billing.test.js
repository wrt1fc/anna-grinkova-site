import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStore } from '../server/store.js';

const HOUR = 60 * 60 * 1000;

test('a pending order grants no access; payment grants only its plan features', () => {
  const store = createStore(':memory:');
  const user = store.createUser('anna@example.com', 'hash');
  const order = store.createOrder(user.id, 'day', 99000, 1000);

  assert.equal(store.hasAccess(user.id, 'day', 1000), false);
  store.confirmPayment(order.id, 'provider-payment-1', 2000);
  assert.equal(store.hasAccess(user.id, 'day', 2000), true);
  assert.equal(store.hasAccess(user.id, 'week', 2000), false);
  assert.equal(store.hasAccess(user.id, 'day', 2000 + 24 * HOUR), false);
  store.close();
});

test('repeated payment notification is idempotent and conflicting notification is rejected', () => {
  const store = createStore(':memory:');
  const user = store.createUser('anna@example.com', 'hash');
  const order = store.createOrder(user.id, 'week', 249000, 1000);

  store.confirmPayment(order.id, 'provider-payment-2', 2000);
  store.confirmPayment(order.id, 'provider-payment-2', 3000);
  assert.equal(store.listEntitlements(user.id).length, 2);
  assert.throws(() => store.confirmPayment(order.id, 'different-payment', 3000));
  assert.equal(store.hasAccess(user.id, 'day', 2000 + 7 * 24 * HOUR - 1), true);
  assert.equal(store.hasAccess(user.id, 'week', 2000 + 7 * 24 * HOUR), false);
  store.close();
});

test('refunded payment revokes every feature granted by its order', () => {
  const store = createStore(':memory:');
  const user = store.createUser('anna@example.com', 'hash');
  const order = store.createOrder(user.id, 'week', 249000, 1000);

  store.confirmPayment(order.id, 'provider-payment-3', 2000);
  store.refundPayment(order.id, 'provider-payment-3');
  assert.equal(store.hasAccess(user.id, 'day', 3000), false);
  assert.equal(store.hasAccess(user.id, 'week', 3000), false);
  store.close();
});
