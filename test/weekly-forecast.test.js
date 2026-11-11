import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculatedDay, validForecastDate, weekDates, weeklyForecast } from '../server/weekly-forecast.js';
import { moscowDate } from '../server/daily-forecast.js';
import { createStore } from '../server/store.js';
import { createServer } from '../server/http.js';
import { hashPassword } from '../server/auth.js';
import { createTrafficLimiter } from '../server/traffic.js';

const profile = { birthDate: '1990-03-10', birthTime: '10:45', birthPlace: 'Москва', birthCityId: 524901,
  birthLatitude: 55.75222, birthLongitude: 37.61556, birthTimeZone: 'Europe/Moscow',
  birthUtc: '1990-03-10T07:45:00.000Z' };

test('weeks start on Monday, including year boundaries and the Moscow Sunday night rollover', () => {
  assert.deepEqual(weekDates('2026-11-15'), weekDates('2026-11-09'));
  assert.equal(weekDates('2026-11-16')[0], '2026-11-16');
  assert.equal(weekDates('2027-01-01')[0], '2026-12-28');
  assert.equal(weekDates('2027-01-01')[6], '2027-01-03');
  assert.equal(weekDates(moscowDate(new Date('2026-11-15T20:59:59Z')))[0], '2026-11-09');
  assert.equal(weekDates(moscowDate(new Date('2026-11-15T21:00:00Z')))[0], '2026-11-16');
  for (const date of ['2026-02-30', '2026-13-01', 'garbage', '', null]) assert.equal(validForecastDate(date), false);
});

test('weekly text uses seven real dated forecasts and stays stable within a week', () => {
  const first = weeklyForecast('2026-11-11');
  const second = weeklyForecast('2026-11-15');
  assert.deepEqual(first, second);
  assert.equal(first.days.length, 7);
  assert.equal(first.scope, 'general');
  assert.equal(first.updatedFor, '2026-11-09T00:00:00+03:00');
  assert.equal(first.generation.kind, 'rules');
  for (const day of first.days) assert.equal(day.date, day.calculatedFor.slice(0, 10));
  for (const period of first.reading.recommendations) {
    assert.ok(period.text.length > 30);
    const dates = first.days.filter(day => day.date >= period.start && day.date <= period.end);
    assert.ok(dates.every(day => day.astronomy.moon.sign === period.sign));
  }
  assert.notDeepEqual(first, weeklyForecast('2026-11-16'));
});

test('personal week and date endpoints preserve the same account-specific cards', () => {
  const week = weeklyForecast('2026-11-11', { userId: 1, profile });
  assert.equal(week.scope, 'personal');
  assert.ok(week.days.every(day => day.scope === 'personal'));
  for (const day of week.days) assert.deepEqual(day, calculatedDay(day.date, { userId: 1, profile }));
  const other = weeklyForecast('2026-11-11', { userId: 2, profile });
  assert.notDeepEqual(week.days.map(d => d.tarot.number), other.days.map(d => d.tarot.number));
  assert.match(week.reading.personalNote, /данные рождения/);
});

test('forecast APIs validate dates, expose a complete week, and do not mix personal cache entries', async () => {
  const store = await createStore('pglite:memory');
  const server = createServer({ store, codeSecret: 'test-secret-with-at-least-thirty-two-characters',
    trafficLimiter: createTrafficLimiter({ perIpLimit: 500, globalLimit: 1000 }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (path, cookie) => {
    const res = await fetch(base + path, { headers: cookie ? { Cookie: cookie } : {} });
    return { status: res.status, data: await res.json() };
  };
  try {
    const guest = await get('/api/forecast/week');
    assert.equal(guest.status, 200);
    const { days } = guest.data;
    for (const day of days) {
      const reply = await get(`/api/forecast/day?date=${day.date}`);
      assert.equal(reply.status, 200);
      assert.deepEqual(reply.data, day);
    }
    for (const query of ['date=2026-02-30', 'date=2000-01-01', 'date=', `date=${days[0].date}&date=${days[0].date}`, `date=${days[0].date}&draw=7`]) {
      assert.equal((await get(`/api/forecast/day?${query}`)).status, 400);
    }
    const password = 'Very-long-password1!';
    const user = await store.createUser('weekly@example.com', await hashPassword(password), Date.now(), Date.now());
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    await store.saveBirthProfile(user.id, profile);
    const personal = await get('/api/forecast/week', cookie);
    assert.equal(personal.data.scope, 'personal');
    assert.equal((await get('/api/forecast/week')).data.scope, 'general');
    const selected = await get(`/api/forecast/day?date=${days[2].date}`, cookie);
    assert.deepEqual(selected.data, personal.data.days[2]);
    await store.saveBirthProfile(user.id, { ...profile, birthUtc: '1991-03-10T07:45:00.000Z', birthDate: '1991-03-10' });
    const updated = await get('/api/forecast/week', cookie);
    assert.notDeepEqual(updated.data.days[0].astronomy.natal, personal.data.days[0].astronomy.natal);
  } finally { await new Promise(resolve => server.close(resolve)); await store.close(); }
});
