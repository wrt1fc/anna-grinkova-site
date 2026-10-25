import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CARD_NAMES, tarotCardByNumber, forecastForDate } from '../server/daily-forecast.js';

test('every metaphorical card has a matching local illustration and a distinct image name', () => {
  assert.equal(CARD_NAMES.length, 22);
  assert.equal(new Set(CARD_NAMES).size, 22);
  assert.deepEqual(CARD_NAMES.slice(0, 3), ['Маяк', 'Мост', 'Ключ']);
  CARD_NAMES.forEach((name, index) => {
    assert.equal(tarotCardByNumber(index).name, name);
    const art = readFileSync(new URL(`../prototype/assets/cards/${String(index).padStart(2, '0')}.svg`, import.meta.url), 'utf8');
    assert.match(art, /<svg[^>]+viewBox="0 0 238 368"/);
    assert.doesNotMatch(art, /https?:\/\/(?!www\.w3\.org)/);
  });
});

test('the day card and five-card spread use the same metaphorical deck', () => {
  const spread = Array.from({ length: 5 }, (_, position) => forecastForDate('2026-10-25', position));
  assert.equal(new Set(spread.map((item) => item.tarot.number)).size, 5);
  for (const item of spread) {
    assert.equal(item.tarot.name, CARD_NAMES[item.tarot.number]);
    assert.ok(item.reading.body.includes(item.tarot.name));
  }
  const app = readFileSync(new URL('../prototype/app.js', import.meta.url), 'utf8');
  assert.match(app, /assets\/cards\//);
  assert.doesNotMatch(app, /assets\/tarot\//);
});
