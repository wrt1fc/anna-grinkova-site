import test from 'node:test';
import assert from 'node:assert/strict';
import { asksAboutCompatibility, chartContext } from '../server/chat-grounding.js';

const owner = { birthUtc: '1990-03-10T07:45:00Z', birthLatitude: 55.75, birthLongitude: 37.62 };
const partner = { birthUtc: '1988-04-12T04:30:00Z', birthLatitude: 55.75, birthLongitude: 37.62, label: 'Сергей', gender: 'male' };

test('compatibility questions are recognised', () => {
  assert.ok(asksAboutCompatibility('Подходим ли мы с Сергеем друг другу?'));
  assert.ok(asksAboutCompatibility('Какая у нас совместимость?'));
  assert.ok(asksAboutCompatibility('Как нам с ним уживаться?'));
  assert.equal(asksAboutCompatibility('Почему деньги сразу уходят?'), false);
});

test('a compatibility question gets both charts and a sign-by-sign comparison of the personal planets', () => {
  const { chart } = chartContext(owner, 'Подходим ли мы друг другу?', new Date('2026-10-27T09:00:00Z'), { partner });
  assert.ok(chart.planets.length > 0);
  assert.equal(chart.partner.label, 'Сергей');
  assert.equal(chart.partner.gender, 'male');
  assert.equal(JSON.stringify(chart.partner).includes('1988'), false);
  assert.deepEqual(chart.partner.compare.map((line) => line.split(':')[0]), ['Солнце', 'Луна', 'Венера', 'Марс']);
  assert.match(chart.partner.compare[1], /^Луна: у тебя в [А-Яа-я]+ \((огонь|земля|воздух|вода)\), у партнёра в [А-Яа-я]+ \((огонь|земля|воздух|вода)\) — (одна стихия|стихии разные)/);
});

test('without a partner chart the compatibility question says what to add', () => {
  const { chart } = chartContext(owner, 'Какая у нас совместимость?', new Date('2026-10-27T09:00:00Z'));
  assert.match(chart.partnerMissing, /Близкие/);
});
