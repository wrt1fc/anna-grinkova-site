import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from '../server/http.js';
import { createStore } from '../server/store.js';
import { createTrafficLimiter } from '../server/traffic.js';
import { createMetrics } from '../server/metrics.js';
import { hashPassword } from '../server/auth.js';
import { forecastForDate, moscowDate, tarotForDate } from '../server/daily-forecast.js';
import { PLANS, publicPlan } from '../server/plans.js';
import { CRISIS_ANSWER } from '../server/crisis.js';
import { SAFE_FALLBACK_ANSWER } from '../server/chat-safety.js';

const PASSWORD = 'Very-long-password1!';
const ANSWER = 'Карта показывает, что в ближайшее время важно заметить свой выбор. Подумайте, что вы готовы изменить сейчас.';

async function fixture(run, { chatWriter } = {}) {
  const store = await createStore('pglite:memory');
  const metrics = createMetrics(store, { day: () => moscowDate() });
  const server = createServer({ store, chatWriter, metrics, mailDailyLimit: 100, codeSecret: 'test-secret-with-at-least-thirty-two-characters',
    chatLimiter: createTrafficLimiter({ perIpLimit: 50, globalLimit: 100 }), trafficLimiter: createTrafficLimiter({ perIpLimit: 500, globalLimit: 1000 }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const raw = (path, { method = 'GET', body, cookie } = {}) => fetch(base + path, { method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  const request = async (path, options) => { const response = await raw(path, options); return { response, data: await response.json() }; };
  async function signIn(email = 'owner@example.com') {
    await store.createUser(email, await hashPassword(PASSWORD), Date.now(), Date.now());
    const login = await raw('/api/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
    return { cookie: login.headers.get('set-cookie').split(';')[0], userId: await store.findUserIdByEmail(email) };
  }
  try { await run({ store, request, signIn }); }
  finally { await new Promise((resolve) => server.close(resolve)); await store.close(); }
}

const steadyWriter = (seen = []) => ({ async answer(input) { seen.push(input); return { answer: ANSWER }; } });
const fiveFor = (day, userId) => Array.from({ length: 5 }, (_, position) => tarotForDate(day, userId, position).number);

test('every account gets its own five cards for the day, stable and distinct', () => {
  const day = '2026-10-07';
  const first = Array.from({ length: 5 }, (_, p) => forecastForDate(day, p, 11).tarot.number);
  assert.deepEqual(first, fiveFor(day, 11));
  assert.equal(new Set(first).size, 5);
  assert.notDeepEqual(first, Array.from({ length: 5 }, (_, p) => forecastForDate(day, p, 12).tarot.number));
  assert.notDeepEqual(first, fiveFor('2026-10-08', 11));
  // Guests keep the shared set.
  assert.equal(forecastForDate(day, 2).tarot.number, forecastForDate(day, 2, null).tarot.number);
});

test('a signed-in account without birth data sees its own cards on the draw endpoints', async () => fixture(async ({ request, signIn }) => {
  const { cookie, userId } = await signIn();
  const day = moscowDate();
  const shown = [];
  for (let draw = 0; draw < 5; draw++) {
    const card = await request(`/api/forecast/card?draw=${draw}`, { cookie });
    const full = await request(`/api/forecast/day?draw=${draw}`, { cookie });
    assert.equal(card.data.tarot.number, tarotForDate(day, userId, draw).number);
    assert.equal(full.data.tarot.number, card.data.tarot.number);
    shown.push(card.data.tarot.number);
  }
  assert.equal(new Set(shown).size, 5);
  const guest = await request('/api/forecast/card?draw=0');
  assert.equal(guest.data.tarot.number, forecastForDate(day, 0).tarot.number);
}));

test('every plan has its own daily limit of card readings', () => {
  for (const [id, plan] of Object.entries(PLANS)) {
    assert.ok(Number.isInteger(plan.dailyTarotReadings) && plan.dailyTarotReadings > 0, id);
    assert.equal(publicPlan(id).dailyTarotReadings, plan.dailyTarotReadings);
  }
  assert.ok(PLANS.family.dailyTarotReadings >= PLANS.individual.dailyTarotReadings);
});

test('a reading needs an account and a valid question and card number', async () => fixture(async ({ request, signIn }) => {
  const guest = await request('/api/tarot/reading', { method: 'POST', body: { question: 'Что меня ждёт?', draw: 0 } });
  assert.equal(guest.response.status, 401);
  assert.equal(guest.data.error, 'login_required');
  const { cookie } = await signIn();
  for (const body of [{ draw: 0 }, { question: '   ', draw: 0 }, { question: 'a'.repeat(301), draw: 0 },
    { question: 'Что меня ждёт?', draw: 5 }, { question: 'Что меня ждёт?', draw: -1 }, { question: 'Что меня ждёт?', draw: '1' }, { question: 'Что меня ждёт?' }]) {
    const bad = await request('/api/tarot/reading', { method: 'POST', body, cookie });
    assert.equal(bad.response.status, 400, JSON.stringify(body));
    assert.equal(bad.data.error, 'invalid_tarot_reading');
  }
}, { chatWriter: steadyWriter() }));

test('a reading interprets the question together with the account\'s own card', async () => {
  const seen = [];
  await fixture(async ({ request, signIn }) => {
    const { cookie, userId } = await signIn();
    const card = tarotForDate(moscowDate(), userId, 3);
    const reply = await request('/api/tarot/reading', { method: 'POST', body: { question: 'Стоит ли мне менять работу?', draw: 3 }, cookie });
    assert.equal(reply.response.status, 200);
    assert.equal(reply.data.answer, ANSWER);
    assert.equal(reply.data.filtered, false);
    assert.deepEqual(reply.data.card, { number: card.number, name: card.name, position: 4 });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].mode, 'tarot');
    assert.equal(seen[0].message, 'Стоит ли мне менять работу?');
    assert.equal(seen[0].forecast.card.name, card.name);
    assert.equal(seen[0].forecast.card.theme, card.focus);
  }, { chatWriter: steadyWriter(seen) });
});

test('readings have their own daily limit and do not use up chat messages', async () => fixture(async ({ request, signIn }) => {
  const { cookie } = await signIn();
  const limit = PLANS.free.dailyTarotReadings;
  for (let i = 0; i < limit; i++) {
    assert.equal((await request('/api/tarot/reading', { method: 'POST', body: { question: 'Вопрос', draw: i % 5 }, cookie })).response.status, 200);
  }
  const limited = await request('/api/tarot/reading', { method: 'POST', body: { question: 'Ещё вопрос', draw: 0 }, cookie });
  assert.equal(limited.response.status, 429);
  assert.equal(limited.data.error, 'tarot_daily_limit');
  assert.equal((await request('/api/chat', { method: 'POST', body: { message: 'Обычный вопрос' }, cookie })).response.status, 200);
}, { chatWriter: steadyWriter() }));

test('a crisis question gets the help lines at once, without the model or the limit', async () => {
  let calls = 0;
  await fixture(async ({ request, signIn }) => {
    const { cookie } = await signIn();
    const reply = await request('/api/tarot/reading', { method: 'POST', body: { question: 'Я больше не хочу жить', draw: 0 }, cookie });
    assert.equal(reply.response.status, 200);
    assert.equal(reply.data.crisis, true);
    assert.equal(reply.data.answer, CRISIS_ANSWER);
    assert.equal(calls, 0);
    for (let i = 0; i < PLANS.free.dailyTarotReadings; i++) {
      assert.equal((await request('/api/tarot/reading', { method: 'POST', body: { question: 'Вопрос', draw: 0 }, cookie })).response.status, 200);
    }
  }, { chatWriter: { async answer() { calls++; return { answer: ANSWER }; } } });
});

test('a model failure gives the reading back and an unsafe answer is replaced', async () => {
  let fail = true;
  const writer = { async answer() { if (fail) throw new Error('model down'); return { answer: 'Я Анна, консультация стоит 5000 рублей.' }; } };
  await fixture(async ({ request, signIn }) => {
    const { cookie } = await signIn();
    const down = await request('/api/tarot/reading', { method: 'POST', body: { question: 'Вопрос', draw: 0 }, cookie });
    assert.equal(down.response.status, 503);
    assert.equal(down.data.error, 'tarot_unavailable');
    fail = false;
    for (let i = 0; i < PLANS.free.dailyTarotReadings; i++) {
      const safe = await request('/api/tarot/reading', { method: 'POST', body: { question: 'Вопрос', draw: 0 }, cookie });
      assert.equal(safe.response.status, 200);
      assert.equal(safe.data.filtered, true);
      assert.equal(safe.data.answer, SAFE_FALLBACK_ANSWER);
    }
  }, { chatWriter: writer });
});
