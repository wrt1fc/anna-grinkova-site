import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from '../server/http.js';
import { createStore } from '../server/store.js';

async function fixture(run) {
  const store = createStore(':memory:');
  const server = createServer({ store, root: new URL('../prototype/', import.meta.url) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, method = 'GET', body, cookie) {
    const response = await fetch(base + path, {
      method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { response, data: await response.json() };
  }
  try { await run({ store, request }); }
  finally { await new Promise((resolve) => server.close(resolve)); store.close(); }
}

test('registration creates a session and protected routes require it', async () => fixture(async ({ request }) => {
  assert.equal((await request('/api/me')).response.status, 401);
  const registered = await request('/api/auth/register', 'POST', { email: '  ANNA@example.com ', password: 'very-long-password' });
  assert.equal(registered.response.status, 201);
  assert.equal(registered.data.user.email, 'anna@example.com');
  const cookie = registered.response.headers.get('set-cookie').split(';')[0];
  assert.match(registered.response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.equal((await request('/api/me', 'GET', null, cookie)).data.user.email, 'anna@example.com');
  assert.equal((await request('/api/forecast/day', 'GET', null, cookie)).response.status, 403);
  assert.equal((await request('/api/auth/logout', 'POST', {}, cookie)).response.status, 200);
  assert.equal((await request('/api/me', 'GET', null, cookie)).response.status, 401);
}));

test('login rejects wrong password, and only paid entitlements pass the forecast gate', async () => fixture(async ({ store, request }) => {
  const registered = await request('/api/auth/register', 'POST', { email: 'anna@example.com', password: 'very-long-password' });
  const cookie = registered.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/auth/login', 'POST', { email: 'anna@example.com', password: 'wrong-password' })).response.status, 401);
  const order = store.createOrder(registered.data.user.id, 'day', 10000);
  assert.equal((await request('/api/forecast/day', 'GET', null, cookie)).response.status, 403);
  store.confirmPayment(order.id, 'trusted-provider-id');
  assert.equal((await request('/api/forecast/day', 'GET', null, cookie)).response.status, 501);
  assert.equal((await request('/api/forecast/week', 'GET', null, cookie)).response.status, 403);
  assert.equal((await request('/api/orders', 'POST', { planId: 'day' }, cookie)).response.status, 503);
}));

test('birth profile is private, validated, and belongs to the signed-in user', async () => fixture(async ({ request }) => {
  const first = await request('/api/auth/register', 'POST', { email: 'one@example.com', password: 'very-long-password' });
  const second = await request('/api/auth/register', 'POST', { email: 'two@example.com', password: 'very-long-password' });
  const cookie = first.response.headers.get('set-cookie').split(';')[0];
  const otherCookie = second.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/profile', 'PUT', { birthDate: '1990-03-10', birthTime: '10:45', birthPlace: 'Москва' })).response.status, 401);
  assert.equal((await request('/api/profile', 'PUT', { birthDate: '1990-02-30', birthTime: '10:45', birthPlace: 'Москва' }, cookie)).response.status, 400);
  assert.equal((await request('/api/profile', 'PUT', { birthDate: '1990-03-10', birthTime: '10:45', birthPlace: 'Москва' }, cookie)).response.status, 200);
  assert.deepEqual((await request('/api/me', 'GET', null, cookie)).data.birthProfile, { birthDate: '1990-03-10', birthTime: '10:45', birthPlace: 'Москва' });
  assert.equal((await request('/api/me', 'GET', null, otherCookie)).data.birthProfile, null);
}));
