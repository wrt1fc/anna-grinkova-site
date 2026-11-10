import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { chartContext } from '../server/chat-grounding.js';
import { questionGuidance } from '../server/local-chat.js';
import { createServer } from '../server/http.js';
import { createStore } from '../server/store.js';
import { hashPassword } from '../server/auth.js';
import { createTrafficLimiter } from '../server/traffic.js';

const profile = { birthUtc: '1990-05-15T09:30:00Z', birthTime: '12:30', birthLatitude: 55.75, birthLongitude: 37.62 };
const now = new Date('2026-11-02T09:00:00Z');
const theory = ['Объясни куспид 1 дома', 'Объясни мне понятие управителя 2 дома', 'Объясни мне понятие Венеры',
  'Объясни моей подруге понятие аспекта',
  'Что такое натальная карта?', 'Как определить управителя первого дома?',
  'Как по натальной карте найти управителя дома?',
  'В условной задаче в этом расчёте Солнце сдвинулось на 20 градусов. Что означает солнечная дуга?',
  'Что такое отношения в натальной карте?',
  'Чем отличаются транзиты от дирекций?', 'Расскажи про аспекты в натальной карте',
  'В условной задаче знак начала денежного дома — Телец. Сколько управителей брать?',
  'Изучаю карту: лунные узлы являются планетами?',
  'Для возраста 39 лет какой момент выбирают во вторичных прогрессиях?',
  'Что такое аспекты? Не используй мою карту.',
  'Без моей натальной карты объясни понятие куспида',
  'Солнечный знак и асцендент — это одно и то же?',
  'Скопление планет и обитель — разные понятия?',
  'Как понимать допуск вокруг точного аспекта?',
  'Записываю точные углы пяти основных аспектов. Подскажи числа.'];
const personal = ['Хочу научиться читать мою натальную карту. Объясни моего управителя 1 дома',
  'Объясни управителя 2 дома в моей карте', 'Что означает мой асцендент?',
  'Как найти управителя в своей натальной карте?', 'Хочу изучить, почему у меня Венера в 7 доме',
  'Расскажи про мою совместимость с мужем по натальной карте.',
  'Объясни, как мои отношения связаны с Венерой.',
  'Объясни, как Луна влияет на мои эмоции.',
  'Что означает Луна в Раке у меня?',
  'Расскажи по натальной карте, почему я вечно опаздываю. Давай посмеёмся',
  'Какую профессию выбрать по натальной карте?',
  'Расскажи по натальной карте, как лучше зарабатывать?',
  'Подскажи по натальной карте, какой партнёр подходит?',
  'Какую работу выбрать по гороскопу?',
  'Как по натальной карте выбрать подходящую профессию?',
  'Как мой расчёт связывает тему дохода с обычными занятиями? Назови все рассчитанные управители.',
  'Какие рабочие занятия связаны с доходом в этом расчёте и какие планеты это показывают?',
  'Объясни мои рассчитанные показатели дохода и управителей.',
  'Как доход связан с работой по рассчитанной карте?',
  'Какие занятия связаны с доходом по карте?',
  'Опиши по карте возможные темы заработка, пояснив каждую связанную с ними планету.'];

test('general astrology never receives an existing personal chart, regardless of course refusal', () => {
  for (const message of theory) for (const prefix of ['', 'Без обучения: ', 'Не предлагай курсы. ']) {
    assert.deepEqual(chartContext(profile, prefix + message, now), { chart: null, queries: [] }, prefix + message);
  }
});

test('personal astrology study and everyday presets retain their calculated chart', () => {
  for (const message of [...personal, 'Какая работа мне подходит?', 'Как мне увеличить доход?',
    'Почему я ревную?', 'Какие у меня сильные стороны?', 'Где у меня стоит планета, связанная с доходом?',
    'Объясни мой подход к деньгам через натальную карту',
    'Объясни, почему я ревную, по натальной карте']) {
    for (const prefix of ['', 'Без обучения: ']) assert.ok(chartContext(profile, prefix + message, now).chart?.calculated, prefix + message);
  }
});

test('personal compatibility study keeps the supplied partner comparison', () => {
  const question = 'Расскажи про мою совместимость с мужем по натальной карте.';
  const partner = { ...profile, birthUtc: '1988-04-12T05:30:00Z', label: 'Партнёр' };
  const { chart } = chartContext(profile, question, now, { partner });
  assert.equal(chart.partner.label, 'Партнёр');
  assert.ok(chart.partner.compare.length);
});

test('dependent follow-ups inherit general or personal grounding, complete questions reset scope', () => {
  for (const message of ['А подробнее?', 'Объясни проще', 'Можно пример?']) {
    for (const original of [theory[0], 'Без обучения: ' + theory[0]]) {
      assert.equal(chartContext(profile, message, now, { history: [{ role: 'user', content: original }] }).chart, null);
    }
    assert.ok(chartContext(profile, message, now, { history: [{ role: 'user', content: personal[0] }] }).chart?.calculated);
  }
  assert.ok(chartContext(profile, personal[0], now, { history: [{ role: 'user', content: theory[0] }] }).chart?.calculated);
});

test('ordinary prompt guidance uses grounding scope instead of invitation eligibility', () => {
  assert.match(questionGuidance('Без обучения: ' + theory[0], null, null), /вопрос о понятии/);
  const chart = chartContext(profile, personal[0], now).chart;
  assert.doesNotMatch(questionGuidance(personal[0], chart, null), /Это вопрос о понятии/);
});

test('HTTP chat applies shared scope before writing, independently of invitation classification', async () => {
  const store = await createStore('pglite:memory'), seen = [];
  const server = createServer({ store, codeSecret: 'grounding-scope-fixture-secret-32-chars',
    trafficLimiter: createTrafficLimiter({ perIpLimit: 1000, globalLimit: 10000 }),
    chatLimiter: createTrafficLimiter({ perIpLimit: 1000, globalLimit: 10000 }),
    chatWriter: { async answer(input) { seen.push(input); return { answer: 'Это проверочный ответ о контексте вопроса.' }; } } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const password = 'Grounding-scope-test1!';
    const user = await store.createUser('grounding-scope@example.test', await hashPassword(password), Date.now(), Date.now());
    await store.saveBirthProfile(user.id, { ...profile, birthDate: '1990-05-15', birthPlace: 'Москва' });
    await store.q.run('UPDATE users SET chat_unlimited = TRUE WHERE id = $1', [user.id]);
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    for (const [message, expected, history] of [
      [theory[0], false], ['Без обучения: ' + theory[0], false], [personal[0], true], [personal[5], true], [personal.at(-1), true], [theory.at(-2), false],
      ['Объясни проще', false, [{ role: 'user', content: theory[0] }]],
      ['Объясни проще', true, [{ role: 'user', content: personal[0] }]],
    ]) {
      const response = await fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ message, history: history ?? [] }) });
      assert.equal(response.status, 200, await response.text());
      assert.equal(!!seen.at(-1).chart, expected, message);
    }
  } finally { await new Promise((r) => server.close(r)); await store.close(); }
});

test('dataset prompts depend on grounding scope, while learning labels stay unchanged', () => {
  const root = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'grounding-scope-'));
  try {
    const cards = [false, true].flatMap((learning) => [false, true].map((isPersonal) => ({
      id: `${learning}-${isPersonal}`, family: `${learning}-${isPersonal}`, split: learning ? 'eval' : 'train', learning,
      question: isPersonal ? personal[0] : 'Без обучения: ' + theory[0], answer: 'Это проверочный учебный ответ без личных прогнозов.',
      chartFor: { birthUtc: profile.birthUtc, latitude: profile.birthLatitude, longitude: profile.birthLongitude },
    })));
    const input = join(root, 'cards.jsonl'), output = join(root, 'output');
    writeFileSync(input, cards.map((c) => JSON.stringify(c)).join('\n'));
    execFileSync(process.execPath, [resolve('training/build-learning-set.mjs'), input, output], { stdio: 'pipe' });
    assert.equal(JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8')).groundingScopeRevision, '2026-11-10');
    for (const split of ['train', 'eval']) {
      const rows = readFileSync(join(output, split + '.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
      for (const row of rows) {
        assert.equal(!!JSON.parse(row.prompt[1].content).chart, row.id.endsWith('-true'), row.id);
        assert.match(row.completion[0].content, split === 'eval' ? /\[\[LEARNING_OFFER\]\]/ : /\[\[LEARNING_NONE\]\]/);
      }
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
