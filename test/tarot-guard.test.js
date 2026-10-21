import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fallbackReading, wrongCard } from '../server/tarot-guard.js';
import { tarotCardByNumber } from '../server/daily-forecast.js';

const card = tarotCardByNumber(8, 0);   // Сила
const wheel = tarotCardByNumber(10, 1); // Колесо Фортуны

test('an answer must name the drawn card and no other card of the deck', () => {
  assert.equal(wrongCard('Карта «Сила» говорит о мягкой твёрдости. Она может подсказать спокойный тон.', card), null);
  assert.equal(wrongCard('Сила — карта о спокойной уверенности, и она может помочь.', card), null);
  assert.equal(wrongCard('Колесо Фортуны напоминает, что всё меняется.', wheel), null);
  assert.ok(wrongCard('Карта «Звезда» говорит о надежде.', card));
  assert.ok(wrongCard('Карта «Сила» и карта «Звезда» вместе говорят о надежде.', card));
  assert.ok(wrongCard('Карта «Сила» говорит о выборе.', wheel));
  assert.ok(wrongCard('Это про выбор и спокойствие, без названия карты.', card));
  // Ordinary words that are also card names are fine when the quoted card is the right one.
  assert.equal(wrongCard('Карта «Сила» напоминает, что сила не в громкости, а в спокойствии.', card), null);
});

test('the calculated reading is made of the drawn card\'s own data and stays in paragraphs', () => {
  const text = fallbackReading(wheel);
  assert.ok(text.includes('«Колесо Фортуны»'));
  assert.ok(text.includes(wheel.question));
  assert.ok(text.split(/\n\s*\n/).length >= 2);
  assert.equal(wrongCard(text, wheel), null);
  assert.equal(/обязательно|гарантир/iu.test(text), false);
  assert.match(text, /может|скорее|возможн/iu);
});
