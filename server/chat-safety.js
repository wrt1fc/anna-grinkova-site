import { createHmac, timingSafeEqual } from 'node:crypto';

// Lets only a fixed number of model calls run at once; the rest get an immediate "busy" answer.
export function createConcurrencyGate(limit = 2) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Concurrency limit must be a positive integer');
  let active = 0;
  return {
    tryAcquire() {
      if (active >= limit) return null;
      active++;
      let released = false;
      return () => { if (!released) { released = true; active--; } };
    },
    get active() { return active; },
    limit,
  };
}

// The browser keeps chat history, so assistant turns are signed to stop forged "earlier replies".
export function createHistorySigner(secret) {
  const key = createHmac('sha256', String(secret)).update('chat-history-v1').digest();
  const sign = (content) => createHmac('sha256', key).update(content).digest('hex');
  return {
    sign,
    verify(content, signature) {
      if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/.test(signature)) return false;
      return timingSafeEqual(Buffer.from(sign(content), 'hex'), Buffer.from(signature, 'hex'));
    },
    // Unsigned or tampered assistant turns are dropped; user turns pass as plain data.
    trusted(history) {
      return history.filter((item) => item.role === 'user' || this.verify(item.content, item.signature))
        .map(({ role, content }) => ({ role, content }));
    },
  };
}

const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма[йя]', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
const DATE_PATTERN = new RegExp(`(\\d{1,2})\\s+(${MONTHS.join('|')})`, 'giu');
const UNSAFE_PATTERNS = [
  /(?<!\p{L})я\s*(?:[—–-]\s*)?анна(?!\p{L})/iu,
  /меня\s+зовут\s+анна/iu,
  /(?<!\p{L})(?:с\s+вами|вам)\s+пишет\s+анна/iu,
  /\d[\d\s]*(?:₽|руб|р\.|\$|€|usd|eur|долл|евро)/iu,
  // A named price, in digits or words; an honest "the price is not known" passes, and so does a chart position
  // ("Венера стоит в 7 доме", "Солнце стоит на 12°").
  /(?<!\p{L})(?:стоимость|цена|стоит|обойд[её]тся)(?![^.!?]{0,40}?\d+(?:-?[а-я]{1,2})?\s*(?:дом|°|градус))[^.!?]{0,40}(?:\d|тысяч|сотен|сотни)/iu,
  /https?:\/\/|www\.|t\.me\/|(?<![\p{L}\d.])@[a-z0-9_]{3,}/iu,
];

// Inspect each promise separately: a denial cannot hide a later affirmative
// promise after a sentence boundary or «но». Only bounded denial forms count.
function promisesOutcome(answer) {
  const claims = /гарантир\p{L}*|непременно\s+(?:случится|произойд\p{L}*)|обязательно\s+(?:случится|произойд\p{L}*|сбудет\p{L}*)/giu;
  for (const claim of answer.matchAll(claims)) {
    const before = answer.slice(Math.max(0,claim.index-160),claim.index)
      .split(/[.!?;\n]|,?\s+(?:но|однако|зато|а)(?!\p{L})/iu).at(-1);
    // «не могу не гарантировать» and «нельзя не гарантировать» assert
    // the outcome. Do not mistake their final «не» for a denial.
    if (/(?<!\p{L})(?:(?:не\s+(?:могу|можем|может|могут|буду|будем)|нельзя|невозможно)\s+(?:\p{L}+\s+){0,2}не|не\s+(?:совсем\s+)?(?:нельзя|невозможно)|не\s+(?:только|просто))\s*(?:(?:заранее|точно|уверенно|обоснованно)\s+){0,2}$/iu.test(before)) return true;
    // A new coordinated first-person predicate is the assistant's own
    // assertion, not part of the preceding «не обещаю, что ...» denial.
    if (/^гарантир(?:ую|уем)$/iu.test(claim[0]) && /(?<!\p{L})(?:и|также)\s+(?:(?:заранее|точно|уверенно|обоснованно)\s+){0,2}$/iu.test(before)) return true;
    const directDenial = /(?<!\p{L})(?:(?:не|нет)\s+(?:\p{L}{1,7}\s+)?|без\s+)$/iu.test(before);
    const inability = /(?<!\p{L})(?:нельзя|невозможно|нет\s+оснований)\s+(?:(?:заранее|точно|уверенно|обоснованно)\s+){0,2}$/iu.test(before);
    const deniedAssertion = /(?<!\p{L})(?:не\s+(?:обещаю|утверждаю)|без\s+вывода),?\s+что\s+(?:(?!(?:не|нельзя|невозможно)(?!\p{L})|гарантир)[\p{L}\d«»—–-]+\s+){0,12}$/iu.test(before);
    if (!directDenial && !inability && !deniedAssertion) return true;
  }
  return false;
}

// Model-agnostic check before an answer is shown: no impersonation, prices, links, invented dates or promises.
// Anna's materials are private: the model sees fragments of them, but a visitor must not get them back word for word
// (for example by asking to "quote the lecture"). An answer that repeats a run of this many words from a fragment is replaced.
const COPY_WORDS = 8;
const wordsOf = (text) => String(text).toLowerCase().replaceAll('ё', 'е').match(/[\p{L}\p{N}]+/gu) ?? [];
export function copiesMaterials(answer, materials = []) {
  if (!materials.length) return false;
  const words = wordsOf(answer);
  if (words.length < COPY_WORDS) return false;
  const runs = new Set();
  for (const material of materials) {
    const source = wordsOf(material.text);
    for (let at = 0; at + COPY_WORDS <= source.length; at++) runs.add(source.slice(at, at + COPY_WORDS).join(' '));
  }
  for (let at = 0; at + COPY_WORDS <= words.length; at++) if (runs.has(words.slice(at, at + COPY_WORDS).join(' '))) return true;
  return false;
}

export function unsafeChatAnswer(answer, forecastDate) {
  if (UNSAFE_PATTERNS.some((pattern) => pattern.test(answer)) || promisesOutcome(answer)) return true;
  const [year, month, day] = String(forecastDate).split('-').map(Number);
  for (const match of answer.matchAll(/(?<!\d)((?:19|20)\d{2})(?!\d)/gu)) {
    if (Number(match[1]) !== year) return true;
  }
  for (const match of answer.matchAll(DATE_PATTERN)) {
    const monthIndex = MONTHS.findIndex((name) => new RegExp(`^${name}`, 'iu').test(match[2]));
    if (Number(match[1]) !== day || monthIndex + 1 !== month) return true;
  }
  return false;
}

export const SAFE_FALLBACK_ANSWER = 'Пока не получается дать точный ответ. Расскажи чуть подробнее, что тебя волнует. Если хочешь разбор по своей натальной карте, добавь дату, время и город рождения в личном кабинете.';
