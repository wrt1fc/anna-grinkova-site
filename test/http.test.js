import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from '../server/http.js';
import { createStore } from '../server/store.js';
import { createTrafficLimiter } from '../server/traffic.js';

async function fixture(run, { mailEnabled = true, mailDailyLimit = 100, trafficLimiter, forecastWriter, sotisVerifier } = {}) {
  const store = createStore(':memory:');
  const sent = [];
  const mailer = mailEnabled ? { async sendCode(message) { sent.push(message); } } : null;
  const server = createServer({ store, mailer, mailDailyLimit, trafficLimiter, forecastWriter, sotisVerifier,
    codeSecret: 'test-secret-with-at-least-thirty-two-characters' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, method = 'GET', body, cookie) {
    const response = await fetch(base + path, {
      method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { response, data: await response.json() };
  }
  try { await run({ store, sent, request }); }
  finally { await new Promise((resolve) => server.close(resolve)); store.close(); }
}

const signup = { email: 'anna@example.com', password: 'Very-long-password1!', confirmPassword: 'Very-long-password1!' };

test('registration requires matching passwords and an emailed one-time code', async () => fixture(async ({ store, sent, request }) => {
  assert.equal((await request('/api/auth/register', 'POST', { ...signup, confirmPassword: 'different-password' })).response.status, 400);
  assert.equal((await request('/api/auth/register', 'POST', { ...signup, password: 'verylong1!', confirmPassword: 'verylong1!' })).response.status, 400);
  assert.equal((await request('/api/auth/register', 'POST', { ...signup, password: 'Verylong!', confirmPassword: 'Verylong!' })).response.status, 400);
  assert.equal((await request('/api/auth/register', 'POST', { ...signup, password: 'Verylong1', confirmPassword: 'Verylong1' })).response.status, 400);
  assert.equal(sent.length, 0);
  const pending = await request('/api/auth/register', 'POST', signup);
  assert.equal(pending.response.status, 202);
  assert.equal(store.findUserByEmail(signup.email), null);
  assert.equal((await request('/api/auth/register/verify', 'POST', { challenge: pending.data.challenge, code: '000000' })).response.status, 400);
  const confirmed = await request('/api/auth/register/verify', 'POST', { challenge: pending.data.challenge, code: sent[0].code });
  assert.equal(confirmed.response.status, 201);
  assert.equal(confirmed.data.user.emailVerified, true);
  const cookie = confirmed.response.headers.get('set-cookie').split(';')[0];
  assert.match(confirmed.response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.equal((await request('/api/me', 'GET', null, cookie)).data.user.email, signup.email);
  assert.equal((await request('/api/auth/register/verify', 'POST', { challenge: pending.data.challenge, code: sent[0].code })).response.status, 400);
}));

test('password reset uses a code and invalidates previous sessions', async () => fixture(async ({ sent, request }) => {
  const pending = await request('/api/auth/register', 'POST', signup);
  const registered = await request('/api/auth/register/verify', 'POST', { challenge: pending.data.challenge, code: sent.at(-1).code });
  const cookie = registered.response.headers.get('set-cookie').split(';')[0];
  const requested = await request('/api/auth/reset/request', 'POST', { email: signup.email });
  assert.equal(requested.response.status, 202);
  const reset = { challenge: requested.data.challenge, code: sent.at(-1).code, password: 'Another-long-password2!', confirmPassword: 'Another-long-password2!' };
  assert.equal((await request('/api/auth/reset/confirm', 'POST', { ...reset, confirmPassword: 'mismatch-password' })).response.status, 400);
  assert.equal((await request('/api/auth/reset/confirm', 'POST', { ...reset, password: 'Anotherlong2', confirmPassword: 'Anotherlong2' })).response.status, 400);
  assert.equal((await request('/api/auth/reset/confirm', 'POST', { ...reset, code: '000000' })).response.status, 400);
  assert.equal((await request('/api/auth/reset/confirm', 'POST', reset)).response.status, 200);
  assert.equal((await request('/api/me', 'GET', null, cookie)).response.status, 401);
  assert.equal((await request('/api/auth/login', 'POST', { email: signup.email, password: signup.password })).response.status, 401);
  assert.equal((await request('/api/auth/login', 'POST', { email: signup.email, password: reset.password })).response.status, 200);
}));

test('profile belongs to its account and stays protected', async () => fixture(async ({ sent, request }) => {
  const pending = await request('/api/auth/register', 'POST', signup);
  const registered = await request('/api/auth/register/verify', 'POST', { challenge: pending.data.challenge, code: sent.at(-1).code });
  const cookie = registered.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/profile', 'PUT', { birthDate: '1990-03-10', birthTime: '10:45', birthPlace: 'Москва' })).response.status, 401);
  assert.equal((await request('/api/profile', 'PUT', { birthDate: '1990-02-30', birthTime: '10:45', birthPlace: 'Москва' }, cookie)).response.status, 400);
  assert.equal((await request('/api/profile', 'PUT', { birthDate: '1990-03-10', birthTime: '10:45', birthPlace: 'Москва' }, cookie)).response.status, 200);
  assert.deepEqual((await request('/api/me', 'GET', null, cookie)).data.birthProfile, { birthDate: '1990-03-10', birthTime: '10:45', birthPlace: 'Москва' });
  const forecast = await request('/api/forecast/day');
  assert.equal(forecast.response.status, 200);
  assert.equal(forecast.data.scope, 'general');
  assert.equal((await request('/api/forecast/week')).response.status, 501);
}));

test('registration does not create an unverified account without a mail service', async () => fixture(async ({ store, request }) => {
  const result = await request('/api/auth/register', 'POST', signup);
  assert.equal(result.response.status, 503);
  assert.equal(store.findUserByEmail(signup.email), null);
}, { mailEnabled: false }));

test('reset request does not reveal whether an email is registered', async () => fixture(async ({ sent, request }) => {
  const first = await request('/api/auth/reset/request', 'POST', { email: 'unknown@example.com' });
  const second = await request('/api/auth/reset/request', 'POST', { email: 'unknown@example.com' });
  assert.equal(first.response.status, 202);
  assert.equal(second.response.status, 429);
  assert.equal(sent.length, 0);
  assert.equal((await request('/api/auth/reset/confirm', 'POST', {
    challenge: first.data.challenge, code: '000000', password: 'Another-long-password2!', confirmPassword: 'Another-long-password2!',
  })).response.status, 400);
}));

test('a previously created account can confirm its email without changing its password', async () => fixture(async ({ store, sent, request }) => {
  store.createUser('old@example.com', (await import('../server/auth.js')).hashPassword('old-long-password'));
  const login = await request('/api/auth/login', 'POST', { email: 'old@example.com', password: 'old-long-password' });
  const cookie = login.response.headers.get('set-cookie').split(';')[0];
  assert.equal(login.data.user.emailVerified, false);
  const issued = await request('/api/auth/email/request', 'POST', {}, cookie);
  assert.equal(issued.response.status, 202);
  assert.equal((await request('/api/auth/email/verify', 'POST', { challenge: issued.data.challenge, code: sent[0].code }, cookie)).response.status, 200);
  assert.equal((await request('/api/me', 'GET', null, cookie)).data.user.emailVerified, true);
}));

test('the server rejects API traffic above its per-address cap', async () => fixture(async ({ request }) => {
  assert.equal((await request('/api/forecast/day')).response.status, 200);
  assert.equal((await request('/api/forecast/day')).response.status, 200);
  const limited = await request('/api/forecast/day');
  assert.equal(limited.response.status, 429);
  assert.ok(Number(limited.response.headers.get('retry-after')) > 0);
}, { trafficLimiter: createTrafficLimiter({ perIpLimit: 2, globalLimit: 10 }) }));

test('mail delivery stops at a durable daily quota', async () => fixture(async ({ request, sent }) => {
  assert.equal((await request('/api/auth/register', 'POST', signup)).response.status, 202);
  assert.equal((await request('/api/auth/register', 'POST', { ...signup, email: 'second@example.com' })).response.status, 429);
  assert.equal(sent.length, 1);
}, { mailDailyLimit: 1 }));

test('mail delivery is disabled when its explicit daily quota is zero', async () => fixture(async ({ request, sent }) => {
  assert.equal((await request('/api/auth/register', 'POST', signup)).response.status, 429);
  assert.equal(sent.length, 0);
}, { mailDailyLimit: 0 }));

test('daily generation is cached and falls back to calculated text when local writer fails', async () => {
  let calls = 0;
  await fixture(async ({ request }) => {
    const first = await request('/api/forecast/day');
    const second = await request('/api/forecast/day');
    assert.equal(first.response.status, 200);
    assert.deepEqual(first.data, second.data);
    assert.equal(first.data.generation.kind, 'rules');
    assert.equal(calls, 1);
  }, { forecastWriter: { async refine() { calls++; throw new Error('local model unavailable'); } } });
});

test('Sotis is contacted once for the daily result and its values are recorded', async () => {
  let calls = 0;
  await fixture(async ({ request }) => {
    const first = await request('/api/forecast/day');
    const second = await request('/api/forecast/day');
    assert.equal(first.response.status, 200);
    assert.deepEqual(first.data, second.data);
    assert.equal(first.data.astronomy.sotis.status, 'matched');
    assert.equal(calls, 1);
  }, { sotisVerifier: { async verify(_day, positions) { calls++; return positions; } } });
});
