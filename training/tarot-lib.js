// Shared by the tooling for card-reading examples: which cards go with which question, and the quality filter
// a reading must pass to become a training example. Drafts are written by the model and approved by Anna.
import { createHash } from 'node:crypto';
import tarotReading from '../config/tarot-reading.json' with { type: 'json' };
import { unsafeChatAnswer } from '../server/chat-safety.js';

export const READINGS_PER_QUESTION = 3;
const DECK_SIZE = 22;
const EVAL_SHARE = 0.12;
// The answer size of a reading (config/tarot-reading.json).
export const MIN_CHARS = tarotReading.answer.minChars;
export const MAX_CHARS = tarotReading.answer.maxChars;

const digest = (text) => createHash('sha256').update(text).digest();
const share = (text) => digest(text).readUInt32BE(0) / 0x1_0000_0000;
const fold = (text) => text.toLowerCase().replaceAll('ё', 'е');

// Three different cards for every question, the same every time; all of a question's readings go to the same side,
// so a question used for the check never leaks into training.
export function pairsFromBank(bank, { perQuestion = READINGS_PER_QUESTION, evalShare = EVAL_SHARE } = {}) {
  return bank.questions.flatMap((item) => {
    const split = share(`tarot-split:${item.id}`) < evalShare ? 'eval' : 'train';
    const numbers = [];
    for (let attempt = 0; numbers.length < perQuestion; attempt++) {
      const number = digest(`tarot-card:${item.id}:${attempt}`).readUInt32BE(0) % DECK_SIZE;
      if (!numbers.includes(number)) numbers.push(number);
    }
    return numbers.map((cardNumber, index) => ({
      id: `${item.id}-${index + 1}`, topic: item.topic, question: item.question, sensitive: item.sensitive === true, split,
      cardNumber, position: index,
      // Spread over a year of real days so the examples do not share one date.
      day: new Date(Date.UTC(2026, 0, 1) + (digest(`tarot-day:${item.id}:${index}`).readUInt32BE(0) % 365) * 86_400_000).toISOString().slice(0, 10),
    }));
  });
}

const PROMISE = /(обязательно|непременно|гарантир\p{L}*|точно\s+(случится|произойд\p{L}*|будет)|несомненно|наверняка|100\s?%)/iu;
const TIMEFRAME = /(через\s+\d+|в\s+течение\s+\d+|\d+\s+(дн\p{L}*|недел\p{L}*|месяц\p{L}*|год\p{L}*)|до\s+конца\s+(года|месяца|недели)|в\s+(этом|следующем)\s+(году|месяце))/iu;
const MARKUP = /(^|\n)\s*([-*•]|\d+[.)])\s|\*\*|^#|`/u;
const AI_WORDS = /(?<!\p{L})(ии|нейросет\p{L}*|искусственн\p{L}* интеллект\p{L}*|языков\p{L}* модел\p{L}*)(?!\p{L})/iu;
const POSSIBILITY = /(может|могут|скорее|возможн\p{L}*|вероятно|похоже|стоит присмотреться)/iu;
const STEP = /(шаг|попробуйте|присмотритесь|задайте себе|спросите себя|заметьте|подумайте|запишите|обратите внимание|\?)/iu;
const SPECIALIST = /(специалист|врач|юрист|консультант|психолог)/iu;

// Problems that keep a reading out of the training set; an empty list means it may become a draft for Anna.
export function tarotReadingProblems(answer, { name, sensitive = false }) {
  const problems = [];
  if (typeof answer !== 'string' || answer.length < MIN_CHARS || answer.length > MAX_CHARS) {
    problems.push(`длина ${answer?.length ?? 0} вне ${MIN_CHARS}–${MAX_CHARS}`);
    if (typeof answer !== 'string') return problems;
  }
  const folded = fold(answer);
  const stem = fold(name).slice(0, Math.max(3, fold(name).length - 2));
  if (!folded.includes(stem)) problems.push(`не называет карту «${name}»`);
  if (unsafeChatAnswer(answer, '2026-10-07')) problems.push('не проходит проверку безопасности чата');
  if (PROMISE.test(answer)) problems.push('обещание исхода');
  if (TIMEFRAME.test(answer)) problems.push('срок или дата события');
  if (MARKUP.test(answer)) problems.push('разметка или список');
  // The page shows paragraphs apart, so a reading comes as two or three of them.
  if (answer.trim().split(/\n\s*\n/).length < 2) problems.push('нет абзацев (нужно два-три, через пустую строку)');
  if (/[A-Za-z]{3,}/.test(answer)) problems.push('латиница в тексте');
  if (AI_WORDS.test(answer)) problems.push('называет себя ИИ');
  if (!POSSIBILITY.test(answer)) problems.push('нет оговорок о возможном («может», «скорее»)');
  // The step may be followed by a note about a specialist, so the last two sentences are checked.
  const ending = answer.trim().split(/(?<=[.!?…])\s+/).slice(-2).join(' ');
  if (!STEP.test(ending)) problems.push('в конце нет шага или вопроса к себе');
  if (sensitive && !SPECIALIST.test(answer)) problems.push('для чувствительной темы нет совета обратиться к специалисту');
  return problems;
}
