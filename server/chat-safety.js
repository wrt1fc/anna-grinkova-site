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
  // A promise of an outcome; an honest negation ("не гарантирует") is fine.
  /(?<!не\s{1,3})гарантир|(?<!не\s{1,3})непременно\s+(?:случится|произойд)|(?<!не\s{1,3})обязательно\s+(?:случится|произойд|сбудет)/iu,
];

// Model-agnostic check before an answer is shown: no impersonation, prices, links, invented dates or promises.
export function unsafeChatAnswer(answer, forecastDate) {
  if (UNSAFE_PATTERNS.some((pattern) => pattern.test(answer))) return true;
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

export const SAFE_FALLBACK_ANSWER = 'По имеющимся данным я не могу ответить на это точно. Спросите, пожалуйста, о карте дня или о том, как пользоваться сайтом.';
