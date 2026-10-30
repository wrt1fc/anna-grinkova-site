import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import bank from '../training/tarot-bank.json' with { type: 'json' };
import { pairsFromBank, tarotReadingProblems } from '../training/tarot-lib.js';
import { cardProblems } from '../training/cards.js';
import { tarotCardByNumber } from '../server/daily-forecast.js';

const GOOD = 'Карта «Часы» в связи с твоим вопросом может говорить о моменте, когда прошлый опыт просит подвести итог. Скорее всего, стоит присмотреться к тому, что ты уже понимаешь, но откладываешь.\n\n'
  + 'Возможная линия — пересмотреть, чем ты занимаешься, не как оценку себя, а как честный взгляд на привычное.\n\n'
  + 'Шаг на сегодня: назвать вслух одно решение, которое ты давно откладываешь.';
const ok = (answer, extra = {}) => tarotReadingProblems(answer, { name: 'Часы', ...extra });

test('a reading that follows the rules passes the quality filter', () => {
  assert.deepEqual(ok(GOOD), []);
  assert.deepEqual(ok(GOOD.replace(/Шаг на сегодня.*$/, 'Попробуй назвать одно решение, которое ты давно откладываешь.')), []);
});

test('the filter rejects readings that break the rules of a reading', () => {
  const has = (problems, word) => problems.some((problem) => problem.includes(word));
  assert.ok(has(ok(GOOD.replaceAll('Часы', 'Дом')), 'карт'), 'не называет карту');
  assert.ok(has(ok(`${GOOD} Это обязательно случится.`), 'обещ'), 'обещание');
  assert.ok(has(ok(`${GOOD} Всё произойдёт через 3 месяца.`), 'срок'), 'срок');
  assert.ok(has(ok(`1. ${GOOD}`), 'разметк'), 'список');
  assert.ok(has(ok(`**${GOOD}**`), 'разметк'), 'жирный');
  assert.ok(has(ok(`${GOOD} Это как tarot reading.`), 'латин'), 'латиница');
  assert.ok(has(ok(`Как нейросеть, я вижу: ${GOOD}`), 'ИИ'), 'ИИ');
  assert.ok(has(ok('Карта «Часы» может говорить о выборе. Присмотритесь к нему.'), 'длин'), 'коротко');
  assert.ok(has(ok(`${GOOD} ${GOOD} ${GOOD}`), 'длин'), 'длинно');
  assert.ok(has(ok(GOOD.replaceAll('\n\n', ' ')), 'абзац'), 'один сплошной абзац');
  assert.ok(has(ok(GOOD.replace('может говорить', 'говорит').replace('Скорее всего, стоит', 'Нужно').replace('Возможная линия', 'Линия')), 'возможн'), 'нет оговорок');
  assert.ok(has(ok(GOOD.replace(/Шаг на сегодня.*$/, 'Всё это очень важно для вашей жизни.')), 'шаг'), 'нет шага');
  assert.ok(has(ok('Я Анна, и консультация стоит 5000 рублей. ' + GOOD), 'безопас'), 'правила чата');
});

test('a reading about money, health or a big decision must point to a calm step and a specialist', () => {
  assert.ok(ok(GOOD, { sensitive: true }).some((problem) => problem.includes('специалист')));
  assert.deepEqual(ok(`${GOOD} Для крупного решения лучше обсудить его со специалистом.`, { sensitive: true }), []);
});

test('the question bank is clean and every question gets three different cards', () => {
  const ids = bank.questions.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(bank.questions.length >= 90);
  for (const item of bank.questions) {
    assert.ok(item.question.length >= 10 && item.question.length <= 300, item.id);
    assert.deepEqual(cardProblems({ id: item.id, status: 'draft', question: item.question, answer: GOOD, length: 'medium' }), [], item.id);
  }
  const pairs = pairsFromBank(bank);
  assert.equal(pairs.length, bank.questions.length * 3);
  for (const item of bank.questions) {
    const own = pairs.filter((pair) => pair.id.startsWith(`${item.id}-`));
    assert.equal(own.length, 3);
    assert.equal(new Set(own.map((pair) => pair.cardNumber)).size, 3);
    assert.equal(new Set(own.map((pair) => pair.split)).size, 1, 'все карты вопроса в одной выборке');
  }
  assert.deepEqual(pairsFromBank(bank), pairs);
  const evalQuestions = new Set(pairs.filter((pair) => pair.split === 'eval').map((pair) => pair.question));
  assert.ok(evalQuestions.size >= 6 && evalQuestions.size <= 20, `в контрольной выборке ${evalQuestions.size} вопросов`);
  for (const pair of pairs) assert.match(pair.day, /^\d{4}-\d{2}-\d{2}$/);
});

test('a reading card is checked like any other card, plus the rules of a reading', () => {
  const card = { id: 'tarot-1', status: 'draft', mode: 'tarot', split: 'train', length: 'medium', question: 'Что мне важно понять о работе?',
    card: { number: 20, position: 0 }, answer: GOOD };
  assert.deepEqual(cardProblems(card), []);
  assert.ok(cardProblems({ ...card, card: { number: 22, position: 0 } }).length > 0);
  assert.ok(cardProblems({ ...card, card: undefined }).length > 0);
  assert.ok(cardProblems({ ...card, answer: `${GOOD} Это обязательно случится.` }).length > 0);
  assert.equal(tarotCardByNumber(20).name, 'Часы');
  assert.throws(() => tarotCardByNumber(22));
});

test('the dataset builder turns a reading card into the live reading prompt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tarot-build-'));
  const cards = join(dir, 'cards.jsonl');
  writeFileSync(cards, `${JSON.stringify({ id: 'tarot-1', status: 'approved', mode: 'tarot', split: 'train', length: 'medium', topic: 'Работа',
    question: 'Что мне важно понять о работе?', card: { number: 20, position: 2 }, forecastDate: '2026-10-07', answer: GOOD })}\n`);
  execFileSync(process.execPath, ['training/build-dataset.js', cards, join(dir, 'out')], { cwd: new URL('..', import.meta.url), stdio: 'pipe' });
  const rows = readFileSync(join(dir, 'out', 'train.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(rows.length, 1);
  const [system, user] = rows[0].prompt;
  assert.match(system.content, /Метафорическая карта/);
  const prompt = JSON.parse(user.content);
  assert.equal(prompt.mode, 'tarot');
  assert.equal(prompt.question, 'Что мне важно понять о работе?');
  assert.equal(prompt.forecast.card.name, 'Часы');
  assert.equal(prompt.forecast.card.position, 3);
  assert.deepEqual(prompt.history, []);
  assert.equal(rows[0].completion[0].content, GOOD);
});

test('the draft generator writes only drafts that pass the filter and carries on where it stopped', async () => {
  const { createServer } = await import('node:http');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { readCards } = await import('../training/cards.js');
  // A stand-in for Ollama that answers with a reading naming the card from the prompt.
  const model = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const prompt = JSON.parse(JSON.parse(body).prompt);
      const text = GOOD.replace('Часы', prompt.forecast.card.name);
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      res.end(`${JSON.stringify({ response: text, done: false })}\n${JSON.stringify({ response: '', done: true, done_reason: 'stop' })}\n`);
    });
  });
  await new Promise((resolve) => model.listen(0, '127.0.0.1', resolve));
  const dir = mkdtempSync(join(tmpdir(), 'tarot-draft-'));
  const out = join(dir, 'cards-tarot.jsonl');
  const run = () => promisify(execFile)(process.execPath, ['training/draft-tarot.js', out, '--model', 'fake', '--limit', '2'],
    { cwd: new URL('..', import.meta.url), env: { ...process.env, OLLAMA_URL: `http://127.0.0.1:${model.address().port}` } });
  try {
    await run();
    assert.equal(readCards(out).length, 2);
    await run();
    const cards = readCards(out);
    assert.equal(cards.length, 4);
    assert.equal(new Set(cards.map((card) => card.id)).size, 4);
    for (const card of cards) {
      assert.equal(card.status, 'draft');
      assert.equal(card.mode, 'tarot');
      assert.deepEqual(cardProblems(card), [], card.id);
    }
  } finally {
    await new Promise((resolve) => model.close(resolve));
  }
});

test('hand-written drafts are matched with their pairs, checked and written as drafts', async () => {
  const { spawnSync } = await import('node:child_process');
  const { readCards } = await import('../training/cards.js');
  const dir = mkdtempSync(join(tmpdir(), 'tarot-import-'));
  const [first] = pairsFromBank(bank).filter((pair) => pair.split === 'train');
  const name = tarotCardByNumber(first.cardNumber).name;
  const reading = `Карта «${name}» в связи с вашим вопросом может говорить о важном повороте, и это стоит заметить спокойно, без спешки и лишних выводов.\n\n`
    + 'Скорее всего, возможная линия связана с тем, что вы уже давно чувствуете, но пока не называете вслух. Это не приговор, а повод присмотреться к своим решениям.\n\n'
    + 'Шаг на сегодня: запишите одну мысль по этому вопросу и вернитесь к ней вечером.';
  writeFileSync(join(dir, 'drafts.txt'), `=== ${first.id} | тема\n${reading}\n\n=== ${first.id.replace(/-1$/, '-9')}\n${reading}\n\n=== no-such-pair-1\n${reading}\n`);
  const out = join(dir, 'cards-tarot.jsonl');
  const run = () => spawnSync(process.execPath, ['training/import-drafts.js', join(dir, 'drafts.txt'), out, '--author', 'тест'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  const first_run = run();
  assert.equal(first_run.status, 1, 'unknown pairs are reported');
  const cards = readCards(out);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].id, first.id);
  assert.equal(cards[0].status, 'draft');
  assert.match(cards[0].note, /написал тест/);
  assert.deepEqual(cardProblems(cards[0]), []);
  assert.match(run().stdout, /уже есть, пропущено/);
  assert.equal(readCards(out).length, 1, 'a second run does not duplicate cards');
});
