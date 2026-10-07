import chatContext from '../config/chat-context.json' with { type: 'json' };

const ENDPOINT = 'http://127.0.0.1:11434/api/generate';
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

// The same prompt shape is used for training examples, so the tuned model learns to follow length.
export function chatPrompt({ message, history, forecast, length = DEFAULT_ANSWER_LENGTH, materials = [] }) {
  return JSON.stringify({ facts: chatContext.facts, materials, forecast, history, length,
    lengthInstruction: ANSWER_LENGTHS[length].instruction, question: message });
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

export function createLocalChat({ model, fetchImpl = fetch }) {
  if (typeof model !== 'string' || !/^[\w./:-]{2,80}$/.test(model)) throw new Error('Invalid local model name');
  return {
    async answer({ message, history, forecast, signal, length = DEFAULT_ANSWER_LENGTH, materials = [], onDelta = null }) {
      const size = ANSWER_LENGTHS[length];
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
          options: { temperature: 0.25, num_predict: size.numPredict, num_ctx: 8192 },
          system: chatContext.systemInstructions.join(' '),
          prompt: chatPrompt({ message, history, forecast, length, materials }),
        }),
        // Also stops generation when the visitor presses Stop or leaves the page.
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!response.ok) throw new Error(`Local chat HTTP ${response.status}`);
      let text = '';
      let doneReason = null;
      for await (const event of ndjson(response.body)) {
        if (event.error) throw new Error(`Local chat error: ${event.error}`);
        if (typeof event.response === 'string' && event.response) {
          text += event.response;
          if (text.length > size.maxChars) { doneReason = 'length'; break; }
          onDelta?.(event.response, text);
        }
        if (event.done) doneReason = event.done_reason ?? 'stop';
      }
      const truncated = doneReason === 'length';
      if (!truncated && doneReason !== 'stop') throw new Error('Local chat returned an incomplete response');
      const answer = truncated ? lastFullSentence(text.slice(0, size.maxChars)) : text.trim();
      if (answer.length < MIN_ANSWER_CHARS) throw new Error('Local chat returned an invalid answer');
      return { answer, model, length, truncated, contextVersion: chatContext.version };
    },
  };
}
