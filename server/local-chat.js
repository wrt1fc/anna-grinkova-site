import chatContext from '../config/chat-context.json' with { type: 'json' };
import tarotReading from '../config/tarot-reading.json' with { type: 'json' };
import { ollamaGenerateUrl } from './ollama.js';

const ENDPOINT = ollamaGenerateUrl();
const MODEL_TIMEOUT_MS = 45_000;
const MIN_ANSWER_CHARS = 15;

export function chatForecastContext(forecast, subject = null) {
  const sky = forecast.astronomy;
  return {
    date: forecast.date,
    scope: forecast.scope,
    // Who the question is about when a partner or family profile is selected; null means the account owner.
    subject,
    card: { name: forecast.tarot.name, theme: forecast.tarot.focus,
      position: forecast.tarot.position + 1 },
    sky: forecast.scope === 'personal'
      ? { sunSign: sky.transit.sun.sign, moonSign: sky.transit.moon.sign, moonPhase: sky.moonPhase }
      : { sunSign: sky.sun.sign, moonSign: sky.moon.sign, moonPhase: sky.moonPhase },
    reading: { body: forecast.reading.body, action: forecast.reading.action,
      question: forecast.reading.question },
  };
}

// The day's card and reading go to the model only when the question is about the day; otherwise the model
// kept steering every answer back to the card.
const DAY_TOPIC = /(карт\p{L}*|сегодн\p{L}*|(?<!\p{L})(день|дня|дню|днём)(?!\p{L})|прогноз\p{L}*|расклад\p{L}*|аркан\p{L}*|луна\s+сейчас|завтра|недел\p{L}*|расч[её]т\p{L}*)/iu;
export function asksAboutDay(message) { return DAY_TOPIC.test(message); }
export function forecastForQuestion(context, message) {
  return asksAboutDay(message) ? context : { date: context.date, scope: context.scope, subject: context.subject };
}

export const ANSWER_LENGTHS = chatContext.answerLengths;
export const DEFAULT_ANSWER_LENGTH = chatContext.defaultAnswerLength;
export const MAX_ANSWER_CHARS = Math.max(...Object.values(ANSWER_LENGTHS).map((item) => item.maxChars));

export const TAROT_MODE = 'tarot';
export const TAROT_QUESTION_MAX_CHARS = 300;
export const TAROT_QUESTION_MIN_CHARS = 10;
// A reading has its own answer size (three short paragraphs) instead of the chat lengths.
export const TAROT_ANSWER = tarotReading.answer;
const answerSize = (mode, length) => (mode === TAROT_MODE ? TAROT_ANSWER : ANSWER_LENGTHS[length]);

// Context for one drawn card: only what the reading may rely on, no sky or birth data.
export function tarotReadingContext(day, card) {
  return { date: day, scope: 'tarot', subject: null,
    card: { name: card.name, theme: card.focus, position: card.position + 1 },
    reading: { action: card.action, question: card.question } };
}

// The same prompt shape is used for training examples, so the tuned model learns to follow length.
export function chatPrompt({ message, history, forecast, visitorName = null, length = DEFAULT_ANSWER_LENGTH, materials = [], chart = null, mode = null }) {
  // The natal chart block is sent only for chart questions, so ordinary answers keep the trained prompt shape.
  return JSON.stringify({ facts: chatContext.facts, materials, forecast, ...(chart ? { chart } : {}), ...(mode ? { mode } : {}), history, visitorName, length,
    lengthInstruction: answerSize(mode, length).instruction, question: message });
}

export function systemFor(mode) {
  return (mode === TAROT_MODE ? [...chatContext.systemInstructions, ...tarotReading.systemInstructions] : chatContext.systemInstructions).join(' ');
}

// Ollama streams one JSON object per line.
async function* ndjson(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line);
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer);
}

// A reply cut by the length budget ends at its last full sentence instead of being thrown away.
function lastFullSentence(text) {
  const end = Math.max(text.lastIndexOf('.'), text.lastIndexOf('!'), text.lastIndexOf('?'), text.lastIndexOf('…'));
  return end > 0 ? text.slice(0, end + 1).trim() : '';
}

// Only remove repeated full sentences, never an unfinished streaming fragment.
// Short replies such as "Да." may legitimately repeat in quoted dialogue.
export function cleanRepeatedSentences(text, completeOnly = false) {
  const seen = new Set();
  let result = '';
  for (const match of text.matchAll(/[^.!?…]*[.!?…]+|[^.!?…]+$/gu)) {
    const sentence = match[0];
    if (completeOnly && !/[.!?…]$/u.test(sentence)) continue;
    const key = sentence.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('ru');
    if (key.length >= 40 && seen.has(key)) continue;
    if (key.length >= 40) seen.add(key);
    result += sentence;
  }
  return result;
}

const SIGN_FORMS = [['Овен', 'Овне'], ['Телец', 'Тельце'], ['Близнецы', 'Близнецах'], ['Рак', 'Раке'], ['Лев', 'Льве'], ['Дева', 'Деве'], ['Весы', 'Весах'], ['Скорпион', 'Скорпионе'], ['Стрелец', 'Стрельце'], ['Козерог', 'Козероге'], ['Водолей', 'Водолее'], ['Рыбы', 'Рыбах']];
export function wrongPlanetSign(answer, chart) {
  for (const line of chart?.planets ?? []) {
    const name = /^(Солнце|Луна|Меркурий|Венера|Марс|Юпитер|Сатурн|Уран|Нептун|Плутон)\s/u.exec(line)?.[1];
    if (!name) continue;
    const expected = SIGN_FORMS.find(([sign]) => line.includes(` ${sign},`))?.[1];
    if (!expected) continue;
    const claims = new RegExp(`${name}(?: у вас| стоит| находится)? (?:в|во) (${SIGN_FORMS.map(([, form]) => form).join('|')})(?![а-яё])`, 'giu');
    for (const claim of answer.matchAll(claims)) {
      if (claim[1].toLowerCase() !== expected.toLowerCase()) return true;
    }
  }
  return false;
}

export function createLocalChat({ model, fetchImpl = fetch }) {
  if (typeof model !== 'string' || !/^[\w./:-]{2,80}$/.test(model)) throw new Error('Invalid local model name');
  return {
    async answer({ message, history, forecast, visitorName = null, signal, length = DEFAULT_ANSWER_LENGTH, materials = [], chart = null, mode = null, onDelta = null, temperature = 0.25, qualityRetry = false }) {
      const size = answerSize(mode, length);
      if (!size) throw new Error('Unknown answer length');
      const timeout = AbortSignal.timeout(MODEL_TIMEOUT_MS);
      const response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: true,
          think: false,
          // Fixed context size: Ollama reloads the model whenever num_ctx changes between requests.
          options: { temperature, num_predict: size.numPredict, num_ctx: 8192 },
          system: systemFor(mode) + (qualityRetry
            ? '\nПовторная проверка ответа: не повторяйте предложения. Положения планет в поле chart — уже рассчитанные факты; не исправляйте их и не добавляйте другие положения. Возьмите одно положение из chart и объясните его простыми словами, затем предложите один небольшой практический шаг.'
            : ''),
          prompt: chatPrompt({ message, history, forecast, visitorName, length, materials, chart, mode }),
        }),
        // Also stops generation when the visitor presses Stop or leaves the page.
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!response.ok) throw new Error(`Local chat HTTP ${response.status}`);
      let text = '';
      let emitted = '';
      let doneReason = null;
      for await (const event of ndjson(response.body)) {
        if (event.error) throw new Error(`Local chat error: ${event.error}`);
        if (typeof event.response === 'string' && event.response) {
          text += event.response;
          if (text.length > size.maxChars) { doneReason = 'length'; break; }
          const clean = cleanRepeatedSentences(text, true);
          if (!chart && clean.length > emitted.length) {
            onDelta?.(clean.slice(emitted.length), clean);
            emitted = clean;
          }
        }
        if (event.done) doneReason = event.done_reason ?? 'stop';
      }
      const truncated = doneReason === 'length';
      if (!truncated && doneReason !== 'stop') throw new Error('Local chat returned an incomplete response');
      const answer = cleanRepeatedSentences(truncated ? lastFullSentence(text.slice(0, size.maxChars)) : text).trim();
      if (answer.length < MIN_ANSWER_CHARS) throw new Error('Local chat returned an invalid answer');
      const repeated = cleanRepeatedSentences(text).trim() !== text.trim();
      if (wrongPlanetSign(answer, chart) || (chart && repeated && !qualityRetry)) {
        if (qualityRetry) throw new Error('Local chat contradicted the calculated chart');
        return createLocalChat({ model, fetchImpl }).answer({ message, history, forecast, visitorName, signal,
          length, materials, chart, mode, onDelta, temperature: 0.1, qualityRetry: true });
      }
      if (answer.length > emitted.length) onDelta?.(answer.slice(emitted.length), answer);
      return { answer, model, length, truncated, contextVersion: chatContext.version };
    },
  };
}
