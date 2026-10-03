import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forecastForDate, moscowDate, planetPositionsAt } from '../server/daily-forecast.js';

test('Moscow calendar date is used at UTC day boundaries', () => {
  assert.equal(moscowDate(new Date('2026-10-02T20:59:59Z')), '2026-10-02');
  assert.equal(moscowDate(new Date('2026-10-02T21:00:00Z')), '2026-10-03');
});

test('day forecast has traceable astronomy and a stable tarot card', () => {
  const first = forecastForDate('2026-10-03');
  const second = forecastForDate('2026-10-03');
  assert.deepEqual(first, second);
  assert.equal(first.date, '2026-10-03');
  assert.equal(first.scope, 'general');
  assert.equal(first.calculatedFor, '2026-10-03T12:00:00+03:00');
  for (const body of [first.astronomy.sun, first.astronomy.moon]) {
    assert.ok(body.longitude >= 0 && body.longitude < 360);
    assert.ok(body.sign.length > 0);
  }
  assert.ok(first.tarot.name.length > 0);
  assert.ok(first.reading.title.includes(first.tarot.name));
  assert.ok(first.reading.body.includes(first.astronomy.moon.sign));
  assert.ok(first.reading.action.length > 0);
  assert.ok(first.reading.question.length > 0);
});

test('tarot rotation varies across dates and invalid days are rejected', () => {
  const cards = new Set();
  for (let day = 1; day <= 12; day++) cards.add(forecastForDate(`2026-10-${String(day).padStart(2, '0')}`).tarot.name);
  assert.ok(cards.size >= 5);
  assert.throws(() => forecastForDate('2026-02-30'));
});

test('Sun and Moon longitudes agree with a Sotis reference chart', () => {
  // Sotis chart: 28.09.2026 10:41:54 +03:00, Sun 5°12′30″ Libra, Moon 25°56′07″ Aries.
  const positions = planetPositionsAt(new Date('2026-09-28T07:41:54Z'));
  assert.ok(Math.abs(positions.sun.longitude - (180 + 5 + 12 / 60 + 30 / 3600)) < 0.02);
  assert.ok(Math.abs(positions.moon.longitude - (25 + 56 / 60 + 7 / 3600)) < 0.02);
  assert.equal(positions.sun.sign, 'Весы');
  assert.equal(positions.moon.sign, 'Овен');
});
