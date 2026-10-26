import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copiesMaterials } from '../server/chat-safety.js';

const MATERIALS = [{ text: 'Созависимость — это адаптационная стратегия, а не личностный дефект. Она формируется как способ сохранить привязанность и избежать одиночества.' }];

test('an answer that repeats a run of words from a private material is caught', () => {
  assert.equal(copiesMaterials('Вот что сказано: созависимость это адаптационная стратегия а не личностный дефект она формируется как способ.', MATERIALS), true);
  assert.equal(copiesMaterials('Она формируется как способ сохранить привязанность и избежать одиночества, пишут в лекции.', MATERIALS), true);
});

test('an answer in its own words, short phrases and an empty set of materials are not caught', () => {
  assert.equal(copiesMaterials('Смотрите, такой способ часто возникает, когда близость в детстве была нестабильной, и человек держится за партнёра.', MATERIALS), false);
  assert.equal(copiesMaterials('Адаптационная стратегия — это нормально.', MATERIALS), false);
  assert.equal(copiesMaterials('Она формируется как способ сохранить привязанность и избежать одиночества.', []), false);
});
