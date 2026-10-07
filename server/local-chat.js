import chatContext from '../config/chat-context.json' with { type: 'json' };

const ENDPOINT = 'http://127.0.0.1:11434/api/generate';
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
  additionalProperties: false,
};

export function chatForecastContext(forecast) {
  const sky = forecast.astronomy;
  return {
    date: forecast.date,
    scope: forecast.scope,
    card: { name: forecast.tarot.name, theme: forecast.tarot.focus,
      position: forecast.tarot.position + 1 },
    sky: forecast.scope === 'personal'
      ? { sunSign: sky.transit.sun.sign, moonSign: sky.transit.moon.sign, moonPhase: sky.moonPhase }
      : { sunSign: sky.sun.sign, moonSign: sky.moon.sign, moonPhase: sky.moonPhase },
    reading: { body: forecast.reading.body, action: forecast.reading.action,
      question: forecast.reading.question },
  };
}

export const ANSWER_LENGTHS = chatContext.answerLengths;
export const DEFAULT_ANSWER_LENGTH = chatContext.defaultAnswerLength;
const MAX_ANSWER_CHARS = Math.max(...Object.values(ANSWER_LENGTHS).map((item) => item.maxChars));

// The same prompt shape is used for training examples, so the tuned model learns to follow length.
export function chatPrompt({ message, history, forecast, length = DEFAULT_ANSWER_LENGTH }) {
  return JSON.stringify({ facts: chatContext.facts, forecast, history, length,
    lengthInstruction: ANSWER_LENGTHS[length].instruction, question: message });
}

export { MAX_ANSWER_CHARS };

export function createLocalChat({ model, fetchImpl = fetch }) {
  if (typeof model !== 'string' || !/^[\w./:-]{2,80}$/.test(model)) throw new Error('Invalid local model name');
  return {
    async answer({ message, history, forecast, signal, length = DEFAULT_ANSWER_LENGTH }) {
      const size = ANSWER_LENGTHS[length];
      if (!size) throw new Error('Unknown answer length');
      const response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          format: OUTPUT_SCHEMA,
          // Fixed context size: Ollama reloads the model whenever num_ctx changes between requests.
          options: { temperature: 0.25, num_predict: size.numPredict, num_ctx: 8192 },
          system: chatContext.systemInstructions.join(' '),
          prompt: chatPrompt({ message, history, forecast, length }),
        }),
        // Also stops generation when the visitor presses Stop or leaves the page.
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(`Local chat HTTP ${response.status}`);
      const result = await response.json();
      if (typeof result.response !== 'string' || (result.done_reason && result.done_reason !== 'stop')) {
        throw new Error('Local chat returned an incomplete response');
      }
      const output = JSON.parse(result.response);
      const answer = output.answer?.trim();
      if (typeof answer !== 'string' || answer.length < 15 || answer.length > size.maxChars) {
        throw new Error('Local chat returned an invalid answer');
      }
      return { answer, model, length, contextVersion: chatContext.version };
    },
  };
}
