import { readFileSync } from 'node:fs';
import { unsafeChatAnswer } from '../server/chat-safety.js';

export const STATUSES = new Set(['draft', 'approved', 'rejected']);
export const SPLITS = new Set(['train', 'eval']);

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
  if (typeof card.answer !== 'string' || card.answer.trim().length < 40 || card.answer.length > 1200) problems.push('ответ: 40–1200 символов');
  if (problems.length) return problems;
  const text = `${card.question}\n${card.answer}`;
  for (const [pattern, label] of PERSONAL_PATTERNS) if (pattern.test(text)) problems.push(`персональные данные: ${label}`);
  for (const name of forbiddenNames) {
    if (new RegExp(`(?<!\\p{L})${name}(?!\\p{L})`, 'iu').test(text)) problems.push(`имя участника: ${name}`);
  }
  // The same rules the live chat applies; a card that would be filtered must not teach the model.
  if (unsafeChatAnswer(card.answer, card.forecastDate || '2000-01-01')) problems.push('ответ нарушает правила чата (Анна от первого лица, цены, ссылки, даты, гарантии)');
  return problems;
}
