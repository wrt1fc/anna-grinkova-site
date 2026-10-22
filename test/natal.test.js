import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from '../server/http.js';
import { createStore } from '../server/store.js';
import { createTrafficLimiter } from '../server/traffic.js';
import { publicNatal } from '../server/natal-public.js';
import texts from '../config/natal-texts.json' with { type: 'json' };

const MOSCOW = 524901;
const BIRTH = { birthDate: '1990-05-17', birthTime: '11:30', birthCityId: MOSCOW };

async function fixture(run) {
  const store = await createStore('pglite:memory');
  const server = createServer({ store, publicUrl: 'https://anna.example', codeSecret: 'test-secret-with-at-least-thirty-two-characters',
    trafficLimiter: createTrafficLimiter({ perIpLimit: 500, globalLimit: 1000 }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  try { await run({ post, get: (path) => fetch(`${base}${path}`) }); }
  finally { await new Promise((resolve) => server.close(resolve)); await store.close(); }
}

test('every sign has a text for each planet and each text is a plain sentence without a promise', () => {
  for (const [key, entry] of Object.entries(texts.sections)) {
    assert.equal(entry.signs.length, 12, key);
    for (const text of entry.signs) {
      assert.ok(text.length > 60 && text.length < 320, `${key}: ${text}`);
      assert.doesNotMatch(text, /обязательно|наверняка|точно произойд|\bИИ\b|нейросет/i, `${key}: ${text}`);
    }
  }
});

test('publicNatal gives the planets, angles, houses, aspects and a text for each section', () => {
  const natal = publicNatal({ birthUtc: '1990-05-17T07:30:00.000Z', latitude: 55.75, longitude: 37.62 });
  assert.equal(natal.timeKnown, true);
  assert.equal(natal.planets.length, 11);
  assert.equal(natal.cusps.length, 12);
  assert.ok(natal.angles.asc.sign && natal.angles.mc.sign);
  assert.deepEqual(natal.sections.map((item) => item.key), ['sun', 'moon', 'asc', 'venus', 'mars', 'mc']);
  assert.ok(natal.sections.every((item) => item.text.length > 60));
  assert.ok(natal.aspects.length > 0 && natal.aspects.length <= 10);
  assert.ok(natal.aspects.every((item) => item.meaning && item.typeName));
  assert.ok(natal.money.strategy);
});

test('without a birth time there are no houses, angles or money block', () => {
  const natal = publicNatal({ birthUtc: '1990-05-17T09:00:00.000Z', latitude: 55.75, longitude: 37.62, timeKnown: false });
  assert.equal(natal.timeKnown, false);
  assert.equal(natal.angles, null);
  assert.equal(natal.cusps, null);
  assert.equal(natal.money, null);
  assert.deepEqual(natal.sections.map((item) => item.key), ['sun', 'moon', 'venus', 'mars']);
});

test('POST /api/natal works for a guest, with and without the birth time, and rejects wrong data', async () => {
  await fixture(async ({ post }) => {
    const ok = await post('/api/natal', BIRTH);
    assert.equal(ok.status, 200);
    const { natal } = await ok.json();
    assert.equal(natal.timeKnown, true);
    assert.equal(natal.sections.length, 6);
    const noTime = await post('/api/natal', { birthDate: '1990-05-17', birthCityId: MOSCOW, timeUnknown: true });
    assert.equal(noTime.status, 200);
    assert.equal((await noTime.json()).natal.timeKnown, false);
    assert.equal((await post('/api/natal', { ...BIRTH, birthDate: '3000-01-01' })).status, 400);
    assert.equal((await post('/api/natal', { ...BIRTH, birthCityId: 1 })).status, 400);
    assert.equal((await post('/api/natal', {})).status, 400);
  });
});

test('GET /api/natal/me needs a signed-in account', async () => {
  await fixture(async ({ get }) => {
    assert.equal((await get('/api/natal/me')).status, 401);
  });
});
