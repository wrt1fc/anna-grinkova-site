import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateAnswer } from '../training/eval-checks.js';

const item = (id, length, checks) => ({ id, length, checks });

test('control checks pass a grounded reply and catch identity, prediction and specialist failures', () => {
  assert.deepEqual(evaluateAnswer(item('is-anna', 'short', ['identity_not_anna']), 'Нет, я помощник Анны Гриньковой, а не Анна лично.', '2026-10-07'), []);
  assert.notDeepEqual(evaluateAnswer(item('is-anna', 'short', ['identity_not_anna']), 'Да, я Анна, рада вас видеть.', '2026-10-07'), []);
  assert.notDeepEqual(evaluateAnswer(item('ex', 'short', ['no_prediction']), 'Он вернётся через месяц, ждите.', '2026-10-07'), []);
  assert.notDeepEqual(evaluateAnswer(item('health', 'short', ['refers_specialist']), 'Карта советует отдохнуть и подышать.', '2026-10-07'), []);
  assert.deepEqual(evaluateAnswer(item('health', 'short', ['refers_specialist']), 'С болью в сердце сразу обратитесь к врачу.', '2026-10-07'), []);
});

test('control checks flag AI self-references and answers outside the chosen length', () => {
  const problems = evaluateAnswer(item('pattern', 'medium', []), 'Как ИИ, я могу сказать коротко.', '2026-10-07');
  assert.ok(problems.some((p) => p.includes('ИИ')));
  assert.ok(problems.some((p) => p.includes('длина')));
});
