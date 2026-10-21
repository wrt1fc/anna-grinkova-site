import { readFileSync } from 'node:fs';
import { unsafeChatAnswer } from '../server/chat-safety.js';
import { ANSWER_LENGTHS, DEFAULT_ANSWER_LENGTH } from '../server/local-chat.js';
import { tarotCardByNumber } from '../server/daily-forecast.js';
import { tarotReadingProblems } from './tarot-lib.js';

export const STATUSES = new Set(['draft', 'approved', 'rejected']);
export const SPLITS = new Set(['train', 'eval']);
// Lower bounds keep each mode distinct: a "detailed" card must really be detailed.
const MIN_CHARS = { short: 40, medium: 180, detailed: 450 };

// Personal details that must never reach a training set: contacts, exact birth data, self-introductions.
const PERSONAL_PATTERNS = [
  [/[\w.+-]+@[\w-]+\.[\w.]+/u, 'email'],
  [/(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/u, 'телефон'],
  [/(?<!\d)\d{1,2}[./]\d{1,2}[./](?:19|20)?\d{2}(?!\d)/u, 'точная дата'],
  [/меня\s+зовут|моя\s+клиентка|мой\s+клиент\s+\p{Lu}/iu, 'личная история'],
];

export function readCards(path) {
  return readFileSync(path, 'utf8').split(/\r?\n/).map((line, index) => [line.trim(), index + 1])
    .filter(([line]) => line && !line.startsWith('//'))
    .map(([line, lineNumber]) => {
      try { return { ...JSON.parse(line), lineNumber }; }
      catch { return { lineNumber, parseError: true }; }
    });
}

export function cardProblems(card, { forbiddenNames = [] } = {}) {
  if (card.parseError) return ['строка не является JSON'];
  const problems = [];
  if (typeof card.id !== 'string' || !/^[\w-]{3,40}$/.test(card.id)) problems.push('нет корректного id');
  if (!STATUSES.has(card.status)) problems.push(`status должен быть одним из: ${[...STATUSES].join(', ')}`);
  if (card.split !== undefined && !SPLITS.has(card.split)) problems.push('split должен быть train или eval');
  if (typeof card.question !== 'string' || card.question.trim().length < 5 || card.question.length > 600) problems.push('вопрос: 5–600 символов');
  const length = card.length ?? DEFAULT_ANSWER_LENGTH;
  if (!Object.hasOwn(ANSWER_LENGTHS, length)) problems.push(`length должен быть одним из: ${Object.keys(ANSWER_LENGTHS).join(', ')}`);
  else if (typeof card.answer !== 'string' || card.answer.trim().length < MIN_CHARS[length] || card.answer.length > ANSWER_LENGTHS[length].maxChars) {
    problems.push(`ответ (${length}): ${MIN_CHARS[length]}–${ANSWER_LENGTHS[length].maxChars} символов`);
  }
  if (problems.length) return problems;
  const text = `${card.question}\n${card.answer}`;
  for (const [pattern, label] of PERSONAL_PATTERNS) if (pattern.test(text)) problems.push(`персональные данные: ${label}`);
  for (const name of forbiddenNames) {
    if (new RegExp(`(?<!\\p{L})${name}(?!\\p{L})`, 'iu').test(text)) problems.push(`имя участника: ${name}`);
  }
  // The same rules the live chat applies; a card that would be filtered must not teach the model.
  if (unsafeChatAnswer(card.answer, card.forecastDate || '2000-01-01')) problems.push('ответ нарушает правила чата (Анна от первого лица, цены, ссылки, даты, гарантии)');
  // A card reading (mode: tarot) also names its card and must keep to the rules of a reading.
  if (card.mode !== undefined && card.mode !== 'tarot') problems.push('mode может быть только tarot');
  if (card.mode === 'tarot') {
    const pick = card.card;
    if (!pick || !Number.isInteger(pick.number) || pick.number < 0 || pick.number > 21 || !Number.isInteger(pick.position) || pick.position < 0 || pick.position > 4) {
      problems.push('расклад: нужна card {number 0–21, position 0–4}');
    } else {
      for (const problem of tarotReadingProblems(card.answer, { name: tarotCardByNumber(pick.number).name, sensitive: card.sensitive === true })) problems.push(`расклад: ${problem}`);
    }
  }
  return problems;
}
