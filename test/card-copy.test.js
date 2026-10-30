import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARD_NAMES } from '../server/daily-forecast.js';
import { CARD_COPY, cardCopy } from '../prototype/miniapp/card-copy.js';

test('illustrated card descriptions stay aligned with the server deck and every card has its own meaning', () => {
  assert.deepEqual(CARD_COPY.map(([name]) => name), CARD_NAMES);
  assert.equal(new Set(CARD_COPY.map(([, , body]) => body)).size, CARD_NAMES.length);
  for (const [number, name] of CARD_NAMES.entries()) {
    const copy = cardCopy({ number, name });
    assert.ok(copy.title.startsWith(`${name}: `));
    assert.ok(copy.body.length >= 100);
  }
  assert.equal(cardCopy({ number: 0, name: 'Другая', focus: 'новая тема' }).body, 'Новая тема.');
});
