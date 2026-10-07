import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createKnowledge, loadKnowledge, tokenize } from '../server/knowledge.js';

test('tokenizer folds case, ё and common Russian endings', () => {
  assert.deepEqual(tokenize('Отношения с партнёром'), tokenize('отношений партнером'));
  assert.deepEqual(tokenize('и в на'), []);
});

test('search returns the relevant material and nothing for an unrelated question', () => {
  const knowledge = createKnowledge([
    { text: 'Луна показывает, через что человек чувствует заботу в отношениях.', source: 'moon' },
    { text: 'Седьмой дом отвечает за партнёрство и брак.', source: 'house' },
    { text: 'Угодничество — первый признак созависимых отношений.', source: 'codependency' },
  ]);
  assert.equal(knowledge.search('Как Луна влияет на заботу?')[0].source, 'moon');
  assert.equal(knowledge.search('признаки созависимых отношений')[0].source, 'codependency');
  assert.deepEqual(knowledge.search('рецепт борща'), []);
});

test('only approved cards and Markdown materials are indexed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'knowledge-'));
  try {
    writeFileSync(join(dir, 'cards.jsonl'), [
      JSON.stringify({ id: 'a', status: 'approved', question: 'Что такое Луна?', answer: 'Луна показывает заботу.' }),
      JSON.stringify({ id: 'b', status: 'draft', question: 'Черновик про Венеру', answer: 'Не одобрено.' }),
    ].join('\n'));
    writeFileSync(join(dir, 'method.md'), '# Метод\n\nСначала показатель, затем пример из жизни.');
    writeFileSync(join(dir, 'raw.txt'), 'Сырая расшифровка с именами участниц.');
    const knowledge = loadKnowledge(dir);
    assert.equal(knowledge.size, 2);
    assert.deepEqual(knowledge.search('Венера черновик'), []);
    assert.equal(knowledge.search('Луна забота')[0].source, 'cards.jsonl#a');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
