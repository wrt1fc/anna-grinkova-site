import assert from 'node:assert/strict';
import { test } from 'node:test';
import { personalForecastForDate } from '../server/personal-forecast.js';
import { tarotForDate } from '../server/daily-forecast.js';

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

test('personal reading changes from natal facts, while the card stays independent', () => {
  const first = personalForecastForDate('2026-11-11', profile, 1);
  const otherDate = personalForecastForDate('2026-11-11', { ...profile, birthUtc: '1984-07-21T16:10:00Z' }, 1);
  assert.deepEqual(first.tarot, otherDate.tarot);
  assert.notEqual(first.reading.body, otherDate.reading.body);
  assert.notDeepEqual([first.reading.action, first.reading.question], [otherDate.reading.action, otherDate.reading.question]);
  assert.deepEqual(first.personalReading, first.reading);
  assert.ok(first.personalThemes.every(theme => first.astronomy.transitAspects.some(a => a.transit === theme.basis.transit && a.natal === theme.basis.natal && a.aspect === theme.basis.aspect)));
  assert.equal(first.tarot.action, tarotForDate('2026-11-11', 1, 0).action);
  assert.equal(first.tarot.question, tarotForDate('2026-11-11', 1, 0).question);
});

test('same UTC preserves planetary positions but place and time change houses and reading', () => {
  const first = personalForecastForDate('2026-11-11', profile, 1);
  const moved = personalForecastForDate('2026-11-11', { ...profile, birthLatitude: 40.7, birthLongitude: -74 }, 1);
  assert.deepEqual(first.astronomy.natal, moved.astronomy.natal);
  assert.deepEqual(first.astronomy.transitAspects, moved.astronomy.transitAspects);
  assert.notDeepEqual(first.astronomy.natalHouses, moved.astronomy.natalHouses);
  assert.notDeepEqual(first.astronomy.transitHouses, moved.astronomy.transitHouses);
  assert.notEqual(first.reading.body, moved.reading.body);
  const later = personalForecastForDate('2026-11-11', { ...profile, birthUtc: '1990-03-10T17:45:00Z' }, 1);
  assert.notDeepEqual(first.astronomy.natalHouses, later.astronomy.natalHouses);
  assert.notEqual(first.reading.body, later.reading.body);
  for (const changed of [{ timeUnknown: true }, { timeKnown: false }, { birthTime: null }, { birthLatitude: 70 }]) {
    const day = personalForecastForDate('2026-11-11', { ...profile, ...changed }, 1);
    assert.equal(day.astronomy.natalHouses, null);
    assert.equal(day.astronomy.transitHouses, null);
    assert.ok(day.astronomy.housesUnavailable);
  }
});

test('sky is shared and readings are independent of account and card draw', () => {
  const first = personalForecastForDate('2026-11-11', profile, 1);
  const sameFacts = personalForecastForDate('2026-11-11', profile, 2, null, 3);
  assert.deepEqual(first.reading, sameFacts.reading);
  const changed = personalForecastForDate('2026-11-11', { ...profile, birthUtc: '1984-07-21T16:10:00Z' }, 1);
  assert.deepEqual(first.astronomy.transit, changed.astronomy.transit);
  assert.deepEqual(first.astronomy.exactAspects, changed.astronomy.exactAspects);
  assert.notDeepEqual(first.personalThemes.map(t => t.basis), changed.personalThemes.map(t => t.basis));
  const tomorrow = personalForecastForDate('2026-11-12', profile, 1);
  assert.notDeepEqual(first.astronomy.transit, tomorrow.astronomy.transit);
  assert.notDeepEqual(first.personalThemes.map(t => t.basis), tomorrow.personalThemes.map(t => t.basis));
});

test('personal prose starts with meaning and leaves technical detail in traced themes', () => {
  const forecast = personalForecastForDate('2026-11-11', profile, 1);
  assert.match(forecast.reading.body, /^Фокус дня/);
  assert.doesNotMatch(forecast.reading.body, /орб|°/);
  assert.ok(forecast.reading.body.length < 850);
  assert.ok(forecast.personalThemes.every(theme => theme.fact.includes('орб')));
  assert.ok(!forecast.reading.body.includes(forecast.reading.action));
});
