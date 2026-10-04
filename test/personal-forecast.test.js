import assert from 'node:assert/strict';
import { test } from 'node:test';
import { personalForecastForDate } from '../server/personal-forecast.js';

const profile = { birthDate: '1990-03-10', birthTime: '10:45', birthPlace: 'Moscow', birthCityId: 524901,
  birthLatitude: 55.75222, birthLongitude: 37.61556, birthTimeZone: 'Europe/Moscow',
  birthUtc: '1990-03-10T07:45:00.000Z' };

test('personal forecast includes natal and transit facts with account-specific tarot', () => {
  const first = personalForecastForDate('2026-10-03', profile, 1);
  const again = personalForecastForDate('2026-10-03', profile, 1);
  const other = personalForecastForDate('2026-10-03', profile, 2);
  assert.equal(first.scope, 'personal');
  assert.deepEqual(first, again);
  assert.equal(first.astronomy.natal.sun.sign, 'Рыбы');
  assert.ok(Array.isArray(first.astronomy.transitAspects));
  assert.ok(Array.isArray(first.astronomy.moonIngresses));
  assert.notEqual(first.tarot.number, other.tarot.number);
  assert.match(first.reading.body, /карте рождения/);
});

test('unresolved legacy profile cannot create a personal calculation', () => {
  assert.throws(() => personalForecastForDate('2026-10-03', { birthDate: '1990-03-10' }, 1), /unresolved_birth_profile/);
});
