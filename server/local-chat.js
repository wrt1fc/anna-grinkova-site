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

export function createLocalChat({ model, fetchImpl = fetch }) {
  if (typeof model !== 'string' || !/^[\w./:-]{2,80}$/.test(model)) throw new Error('Invalid local model name');
  return {
    async answer({ message, history, forecast }) {
      const response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          format: OUTPUT_SCHEMA,
          options: { temperature: 0.25, num_predict: 450, num_ctx: 4096 },
          system: chatContext.systemInstructions.join(' '),
          prompt: JSON.stringify({ facts: chatContext.facts, forecast, history, question: message }),
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(`Local chat HTTP ${response.status}`);
      const result = await response.json();
      if (typeof result.response !== 'string' || (result.done_reason && result.done_reason !== 'stop')) {
        throw new Error('Local chat returned an incomplete response');
      }
      const output = JSON.parse(result.response);
      const answer = output.answer?.trim();
      if (typeof answer !== 'string' || answer.length < 15 || answer.length > 1200) {
        throw new Error('Local chat returned an invalid answer');
      }
      return { answer, model, contextVersion: chatContext.version };
    },
  };
}
