import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chatSuggestions } from '../server/chat-suggestions.js';
import { natalChart, POINT_NAMES } from '../server/astro-chart.js';
import { SIGN_PREPOSITIONAL } from '../server/anna-method.js';
import { moscowDate, tarotForDate } from '../server/daily-forecast.js';
import { createServer } from '../server/http.js';
import { createStore } from '../server/store.js';
import { hashPassword } from '../server/auth.js';
import { createTrafficLimiter } from '../server/traffic.js';

const profile = { birthDate: '1990-05-15', birthTime: '12:30', birthPlace: 'Москва', birthUtc: '1990-05-15T09:30:00Z', birthLatitude: 55.75, birthLongitude: 37.62 };

test('daily chat questions are stable per account and rotate at Moscow midnight', () => {
  const before = new Date('2026-10-30T20:59:59Z');
  const a = chatSuggestions({ userId: 1, now: before });
  const b = chatSuggestions({ userId: 2, now: before });
  assert.equal(a.date, '2026-10-30');
  assert.notEqual(a.dailyQuestion.id, b.dailyQuestion.id);
  assert.equal(a.dailyQuestion.text, chatSuggestions({ userId: 1, now: new Date('2026-10-30T01:00Z') }).dailyQuestion.text);
  assert.equal(a.refreshAfterMs, 2000);
  const after = chatSuggestions({ userId: 1, now: new Date('2026-10-30T21:00Z') });
  assert.equal(after.date, '2026-10-31');
  assert.notEqual(a.dailyQuestion.id, after.dailyQuestion.id);
  assert.equal(new Set(Array.from({ length: 32 }, (_, n) => chatSuggestions({ userId: 1,
    now: new Date(Date.parse('2026-10-30T12:00Z') + n * 86_400_000) }).dailyQuestion.id)).size, 32);
});

test('personal prompts use calculated signs, selected cards and the selected profile', () => {
  const natal = natalChart({ birthUtc: profile.birthUtc, latitude: profile.birthLatitude, longitude: profile.birthLongitude });
  for (let n = 0; n < 32; n++) {
    const now = new Date(Date.parse('2026-10-30T12:00Z') + n * 86_400_000);
    const data = chatSuggestions({ userId: 1, profile, now, draw: 4 });
    assert.equal(data.dailyQuestion.personalization, 'natal');
    const planet = data.dailyQuestion.id.split('-')[0];
    if (planet !== 'general') assert.ok(data.dailyQuestion.text.startsWith(`В моей натальной карте ${POINT_NAMES[planet]} в ${SIGN_PREPOSITIONAL[natal.planets[planet].sign]}.`));
    const missing = chatSuggestions({ userId: 1, now });
    assert.equal(missing.dailyQuestion.personalization, 'account');
    assert.doesNotMatch(missing.dailyQuestion.text, /в моей натальной карте в /);
    const card = tarotForDate(data.date, 1, 4);
    assert.equal(data.card.name, card.name);
    assert.ok(data.groups[1].questions.every((q) => q.includes(card.name)));
    const other = chatSuggestions({ userId: 1, profileId: 3, profile, now });
    assert.doesNotMatch(JSON.stringify(other.groups) + other.dailyQuestion.text, /моей|моя|для меня|мне |Как я /u);
    assert.equal(other.card.name, tarotForDate(other.date, 1_000_000_003, 0).name);
  }
});

test('suggestions require auth, enforce profile access and never call the model or consume a question', async () => {
  const store = await createStore('pglite:memory');
  let called = 0;
  const server = createServer({ store, codeSecret: 'suggestion-tests-secret-32-characters',
    trafficLimiter: createTrafficLimiter({ perIpLimit: 1000, globalLimit: 10000 }),
    chatWriter: { async answer() { called++; throw new Error('must not call'); } } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, cookie) => {
    const r = await fetch(base + path, { headers: cookie ? { Cookie: cookie } : {} });
    return { status: r.status, data: await r.json(), cache: r.headers.get('cache-control') };
  };
  try {
    assert.equal((await request('/api/chat/suggestions')).status, 401);
    const password = 'Local-suggestions-only1!';
    const hash = await hashPassword(password);
    const owner = await store.createUser('suggestions@example.test', hash, Date.now(), Date.now());
    const other = await store.createUser('other-suggestions@example.test', hash, Date.now(), Date.now());
    async function login(email) {
      const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      return res.headers.get('set-cookie').split(';')[0];
    }
    const cookie = await login(owner.email), otherCookie = await login(other.email);
    const first = await request('/api/chat/suggestions?draw=4', cookie);
    const repeat = await request('/api/chat/suggestions?draw=4', cookie);
    assert.equal(first.status, 200); assert.match(first.cache, /no-store/);
    assert.equal(first.data.dailyQuestion.text, repeat.data.dailyQuestion.text);
    assert.notEqual(first.data.dailyQuestion.id, (await request('/api/chat/suggestions', otherCookie)).data.dailyQuestion.id);
    const actualCard = await request('/api/forecast/card?draw=4', cookie);
    assert.equal(first.data.card.name, actualCard.data.card.name);
    for (const query of ['draw=5', 'draw=-1', 'draw=1.5', 'draw=0&draw=1', 'profileId=0', 'profileId=3&profileId=4', 'profileId=9007199254740992']) {
      assert.equal((await request('/api/chat/suggestions?' + query, cookie)).status, 400, query);
    }
    await store.saveBirthProfile(owner.id, profile);
    assert.equal((await request('/api/chat/suggestions', cookie)).data.dailyQuestion.personalization, 'natal');
    await store.setPlan(owner.id, 'partner');
    const person = await store.createChartProfile(owner.id, { ...profile, birthDate: '1990-05-15', birthTime: '12:30', birthPlace: 'Москва', relation: 'partner', label: 'Близкий' }, 1);
    assert.equal((await request(`/api/chat/suggestions?profileId=${person.id}`, cookie)).status, 200);
    assert.equal((await request(`/api/chat/suggestions?profileId=${person.id}`, otherCookie)).status, 404);
    await store.setPlan(owner.id, 'free');
    assert.equal((await request(`/api/chat/suggestions?profileId=${person.id}`, cookie)).status, 403);
    assert.equal(await store.dailyQuotaUsed(`chat:${owner.id}`, moscowDate()), 0);
    assert.equal(called, 0);
    assert.doesNotMatch(JSON.stringify(first.data), /birthUtc|latitude|longitude|email/);
  } finally { await new Promise((resolve) => server.close(resolve)); await store.close(); }
});
