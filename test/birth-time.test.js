import assert from 'node:assert/strict';
import { test } from 'node:test';
import { birthInstant } from '../server/birth-time.js';

test('birth time uses the historical IANA offset for its date', () => {
  const result = birthInstant({ birthDate: '2026-10-03', birthTime: '10:45', timeZone: 'Europe/Moscow' });
  assert.equal(result.utc, '2026-10-03T07:45:00.000Z');
  assert.equal(result.offsetMinutes, 180);
});

test('missing and repeated local hours require an explicit correction', () => {
  assert.throws(() => birthInstant({ birthDate: '2023-03-26', birthTime: '02:30', timeZone: 'Europe/Berlin' }), /birth_time_ambiguous/);
  assert.throws(() => birthInstant({ birthDate: '2023-10-29', birthTime: '02:30', timeZone: 'Europe/Berlin' }), /birth_time_ambiguous/);
  assert.equal(birthInstant({ birthDate: '2023-10-29', birthTime: '02:30', timeZone: 'Europe/Berlin', utcOffsetMinutes: 60 }).utc,
    '2023-10-29T01:30:00.000Z');
  assert.equal(birthInstant({ birthDate: '2023-10-29', birthTime: '02:30', timeZone: 'Europe/Berlin', utcOffsetMinutes: 120 }).utc,
    '2023-10-29T00:30:00.000Z');
  assert.throws(() => birthInstant({ birthDate: '2023-10-29', birthTime: '02:30', timeZone: 'Europe/Berlin', utcOffsetMinutes: 180 }), /invalid_birth_offset/);
});

test('birth time rejects impossible calendar values and unknown zones', () => {
  assert.throws(() => birthInstant({ birthDate: '1990-02-30', birthTime: '10:00', timeZone: 'Europe/Moscow' }));
  assert.throws(() => birthInstant({ birthDate: '1990-02-10', birthTime: '24:00', timeZone: 'Europe/Moscow' }));
  assert.throws(() => birthInstant({ birthDate: '1990-02-10', birthTime: '10:00', timeZone: 'Earth/Unknown' }));
});
