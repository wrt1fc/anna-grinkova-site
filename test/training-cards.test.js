import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardProblems } from '../training/cards.js';

const base = {
  id: 'test-card', status: 'draft', split: 'train', question: 'Как Луна влияет на отношения?',
  answer: 'Смотрите, Луна показывает, через что человек чувствует заботу и что он нужен. Поэтому одному важны слова, а другому поступки. Подумайте, что для вас по-настоящему звучит как любовь.',
};

test('a clean card in Anna\'s manner has no problems', () => {
  assert.deepEqual(cardProblems(base), []);
});

test('cards with participant data, impersonation or prices are flagged', () => {
  const cases = [
    [{ answer: `${base.answer} Позвоните +7 912 345-67-89.` }, /телефон/],
    [{ answer: `${base.answer} Родилась 16.08.1986 в Петербурге.` }, /точная дата/],
    [{ answer: `${base.answer} Марина, вам стоит подумать.` }, /имя участника: Марина/],
    [{ answer: `Я Анна, и консультация стоит 5000 рублей. ${base.answer}` }, /правила чата/],
    [{ status: 'approved?' }, /status/],
    [{ answer: 'Коротко.' }, /ответ \(medium\)/],
    [{ length: 'detailed' }, /ответ \(detailed\)/],
    [{ length: 'huge' }, /length должен быть/],
  ];
  for (const [change, expected] of cases) {
    const problems = cardProblems({ ...base, ...change }, { forbiddenNames: ['Марина'] });
    assert.ok(problems.some((problem) => expected.test(problem)), `${JSON.stringify(change)} → ${problems.join('; ')}`);
  }
});
