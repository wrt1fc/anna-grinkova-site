import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chartAt, dailySkyEvents, natalTransitAspects } from '../server/astro-personal.js';

test('natal chart uses exact birth instant and geocentric tropical positions', () => {
  const earlier = chartAt(new Date('1990-03-10T07:45:00Z'));
  const later = chartAt(new Date('1990-03-11T07:45:00Z'));
  assert.ok(earlier.sun.longitude > 340 && earlier.sun.longitude < 360);
  assert.ok(later.sun.longitude > earlier.sun.longitude);
  assert.equal(earlier.sun.sign, 'Рыбы');
  for (const planet of ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']) {
    assert.ok(earlier[planet].longitude >= 0 && earlier[planet].longitude < 360);
  }
});

test('daily sky events locate Moon sign changes within Moscow calendar day', () => {
  const events = dailySkyEvents('2026-10-03');
  assert.equal(events.start, '2026-10-02T21:00:00.000Z');
  assert.equal(events.end, '2026-10-03T21:00:00.000Z');
  for (const ingress of events.moonIngresses) {
    assert.ok(ingress.at >= events.start && ingress.at < events.end);
    assert.notEqual(ingress.from, ingress.to);
  }
  const next = dailySkyEvents('2026-10-05');
  assert.equal(next.moonIngresses[0].from, 'Рак');
  assert.equal(next.moonIngresses[0].to, 'Лев');
  assert.ok(next.moonIngresses[0].at.startsWith('2026-10-04T22:54:'));
  assert.ok(events.exactAspects.some((item) => item.first === 'moon' && item.second === 'sun' && item.aspect === 'square'));
});

test('transit aspects are calculated from natal and current positions', () => {
  const natal = chartAt(new Date('1990-03-10T07:45:00Z'));
  const current = chartAt(new Date('2026-10-03T09:00:00Z'));
  const aspects = natalTransitAspects(natal, current);
  assert.ok(aspects.length > 0);
  assert.ok(aspects.every((a) => a.orb <= 3 && a.orb >= 0));
  assert.ok(aspects.every((a) => ['conjunction', 'sextile', 'square', 'trine', 'opposition'].includes(a.aspect)));
  const wrap = natalTransitAspects({ sun: { longitude: 359 } }, { moon: { longitude: 1 } });
  assert.deepEqual(wrap[0], { transit: 'moon', natal: 'sun', aspect: 'conjunction', orb: 2, angle: 0 });
});
