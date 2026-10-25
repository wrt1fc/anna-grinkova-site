import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from '../server/http.js';
import { createStore } from '../server/store.js';
import { createTrafficLimiter } from '../server/traffic.js';
import { createMetrics } from '../server/metrics.js';
import { hashPassword } from '../server/auth.js';
import { forecastForDate, moscowDate, readingCardKey, tarotForDate, tarotForReading } from '../server/daily-forecast.js';
import { PLANS, publicPlan } from '../server/plans.js';
import { CRISIS_ANSWER } from '../server/crisis.js';
import { SAFE_FALLBACK_ANSWER } from '../server/chat-safety.js';

const PASSWORD = 'Very-long-password1!';
// A model reply that names the drawn card, as the guard of the route requires.
const answerFor = (name) => `Карта «${name}» в связи с вашим вопросом может говорить о выборе. Подумайте, что вы готовы изменить сейчас.`;
const ANSWER = answerFor('Суд');
const CODE_SECRET = 'test-secret-with-at-least-thirty-two-characters';
const readingCard = (userId, round, position) => tarotForReading(readingCardKey(CODE_SECRET), { userId, day: moscowDate(), round, position });

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
  try { await run({ store, request, signIn, base }); }
  finally { await new Promise((resolve) => server.close(resolve)); await store.close(); }
}

const steadyWriter = (seen = []) => ({ async answer(input) { seen.push(input); return { answer: answerFor(input.forecast?.card?.name ?? 'Суд') }; } });
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
  for (const body of [{ draw: 0 }, { question: '   ', draw: 0 }, { question: 'Что ждёт?', draw: 0 }, { question: 'a'.repeat(301), draw: 0 },
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
    const card = readingCard(userId, 0, 3);
    const reply = await request('/api/tarot/reading', { method: 'POST', body: { question: 'Стоит ли мне менять работу?', draw: 3 }, cookie });
    assert.equal(reply.response.status, 200);
    assert.equal(reply.data.answer, answerFor(card.name));
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
    assert.equal((await request('/api/tarot/reading', { method: 'POST', body: { question: 'Вопрос о работе', draw: i % 5 }, cookie })).response.status, 200);
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
      assert.equal((await request('/api/tarot/reading', { method: 'POST', body: { question: 'Вопрос о работе', draw: 0 }, cookie })).response.status, 200);
    }
  }, { chatWriter: { async answer() { calls++; return { answer: ANSWER }; } } });
});

test('a model failure gives the reading back and an unsafe answer is replaced', async () => {
  let fail = true;
  const writer = { async answer({ forecast }) { if (fail) throw new Error('model down'); return { answer: `Карта «${forecast.card.name}»: я Анна, консультация стоит 5000 рублей.` }; } };
  await fixture(async ({ request, signIn }) => {
    const { cookie } = await signIn();
    const down = await request('/api/tarot/reading', { method: 'POST', body: { question: 'Вопрос о работе', draw: 0 }, cookie });
    assert.equal(down.response.status, 503);
    assert.equal(down.data.error, 'tarot_unavailable');
    fail = false;
    for (let i = 0; i < PLANS.free.dailyTarotReadings; i++) {
      const safe = await request('/api/tarot/reading', { method: 'POST', body: { question: 'Вопрос о работе', draw: 0 }, cookie });
      assert.equal(safe.response.status, 200);
      assert.equal(safe.data.filtered, true);
      assert.equal(safe.data.answer, SAFE_FALLBACK_ANSWER);
    }
  }, { chatWriter: writer });
});

const otherCard = (name) => (name === 'Нить' ? 'Маяк' : 'Нить');
const parseSse = (text) => text.trim().split('\n\n').map((block) => ({ event: /^event: (.+)$/m.exec(block)[1], data: JSON.parse(/^data: (.+)$/m.exec(block)[1]) }));

test('an answer about another card is asked for once more, and the second one is used', async () => {
  let calls = 0;
  const writer = { async answer({ forecast }) {
    calls++;
    return { answer: answerFor(calls === 1 ? otherCard(forecast.card.name) : forecast.card.name) };
  } };
  await fixture(async ({ request, signIn }) => {
    const { cookie, userId } = await signIn();
    const card = readingCard(userId, 0, 1);
    const reply = await request('/api/tarot/reading', { method: 'POST', body: { question: 'Что меня ждёт?', draw: 1 }, cookie });
    assert.equal(reply.response.status, 200);
    assert.equal(reply.data.answer, answerFor(card.name));
    assert.equal(calls, 2);
  }, { chatWriter: writer });
});

test('when the model keeps naming another card, the person gets a calculated reading of the drawn card', async () => {
  let calls = 0;
  const writer = { async answer({ forecast }) { calls++; return { answer: answerFor(otherCard(forecast.card.name)) }; } };
  await fixture(async ({ request, signIn }) => {
    const { cookie, userId } = await signIn();
    const card = readingCard(userId, 0, 2);
    const reply = await request('/api/tarot/reading', { method: 'POST', body: { question: 'Что меня ждёт?', draw: 2 }, cookie });
    assert.equal(reply.response.status, 200);
    assert.equal(calls, 2, 'one try and one retry, no more');
    assert.equal(reply.data.filtered, false);
    assert.ok(reply.data.answer.includes(`«${card.name}»`));
    assert.ok(reply.data.answer.includes(card.question));
    assert.equal(reply.data.answer.includes(`«${otherCard(card.name)}»`), false);
    assert.deepEqual(reply.data.card, { number: card.number, name: card.name, position: 3 });
  }, { chatWriter: writer });
});

test('a reading is sent whole after the check, never streamed piece by piece', async () => fixture(async ({ signIn, base }) => {
  const { cookie } = await signIn();
  const response = await fetch(`${base}/api/tarot/reading`, { method: 'POST', body: JSON.stringify({ question: 'Вопрос о работе', draw: 0 }),
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Cookie: cookie } });
  const events = parseSse(await response.text());
  assert.equal(events.filter((event) => event.event === 'delta').length, 0);
  assert.equal(events.at(-1).event, 'done');
  assert.ok(events.at(-1).data.answer.includes('«'));
}, { chatWriter: { async answer({ forecast, onDelta }) { const text = answerFor(forecast.card.name); onDelta?.(text, text); return { answer: text }; } } }));

test('reading cards cannot be worked out in advance: secret key, new spread for every reading', () => {
  const key = readingCardKey(CODE_SECRET);
  const day = '2026-10-07';
  const spread = (round, secret = key) => Array.from({ length: 5 }, (_, position) => tarotForReading(secret, { userId: 11, day, round, position }).number);
  assert.equal(new Set(spread(0)).size, 5);
  assert.deepEqual(spread(0), spread(0), 'stable within one reading');
  assert.notDeepEqual(spread(0), fiveFor(day, 11), 'the cards of the day do not reveal the reading');
  assert.notDeepEqual(spread(0), spread(1), 'the next reading gets a new spread');
  assert.notDeepEqual(spread(0), spread(0, readingCardKey('another-secret-with-at-least-thirty-two-chars')), 'depends on the server key');
});

test('the second reading of the day is dealt from a new spread; a failed one deals the same unseen cards again', async () => {
  let fail = true;
  await fixture(async ({ request, signIn }) => {
    const { cookie, userId } = await signIn();
    assert.equal((await request('/api/tarot/reading', { method: 'POST', body: { question: 'Вопрос о работе', draw: 2 }, cookie })).response.status, 503);
    fail = false;
    const first = await request('/api/tarot/reading', { method: 'POST', body: { question: 'Вопрос о работе', draw: 2 }, cookie });
    assert.equal(first.data.card.number, readingCard(userId, 0, 2).number);
  }, { chatWriter: { async answer(input) { if (fail) throw new Error('model down'); return { answer: answerFor(input.forecast.card.name) }; } } });
  await fixture(async ({ request, signIn, store }) => {
    const { cookie, userId } = await signIn();
    await store.setPlan(userId, 'individual');
    for (let round = 0; round < 3; round++) {
      const reply = await request('/api/tarot/reading', { method: 'POST', body: { question: `Вопрос о работе ${round}`, draw: 0 }, cookie });
      assert.equal(reply.response.status, 200);
      assert.equal(reply.data.card.number, readingCard(userId, round, 0).number);
    }
  }, { chatWriter: steadyWriter() });
});
