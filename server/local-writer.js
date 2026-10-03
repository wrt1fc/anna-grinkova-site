import forecastStyle from '../config/forecast-style.json' with { type: 'json' };

const ENDPOINT = 'http://127.0.0.1:11434/api/generate';

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    body: { type: 'string' },
    action: { type: 'string' },
    question: { type: 'string' },
  },
  required: ['body', 'action', 'question'],
  additionalProperties: false,
};

function validText(value, min, max) {
  return typeof value === 'string' && value.length >= min && value.length <= max && !/[<>]/.test(value);
}

export function createLocalForecastWriter({ model, fetchImpl = fetch }) {
  if (typeof model !== 'string' || !/^[\w./:-]{2,80}$/.test(model)) throw new Error('Invalid local model name');
  return {
    async refine(forecast) {
      const response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          format: OUTPUT_SCHEMA,
          options: { temperature: 0.2, num_predict: 240, num_ctx: 2048 },
          system: forecastStyle.systemInstructions.join(' '),
          prompt: JSON.stringify({ date: forecast.date, astronomy: forecast.astronomy, tarot: forecast.tarot, draft: forecast.reading }),
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(`Local model HTTP ${response.status}`);
      const result = await response.json();
      if (typeof result.response !== 'string') throw new Error('Local model returned no text');
      const output = JSON.parse(result.response);
      const places = forecast.reading.body.match(/Солнце в ([^,;]+), Луна в ([^,;]+);/);
      if (!places) throw new Error('Calculated signs are missing');
      if (!validText(output.body, 80, 900) || !validText(output.action, 10, 180)
        || !validText(output.question, 10, 180)
        || ![`Солнце в ${places[1]}`, `Луна в ${places[2]}`, forecast.astronomy.moonPhase, forecast.tarot.name]
          .every((fact) => output.body.includes(fact))) throw new Error('Local model omitted calculated facts');
      return {
        ...forecast,
        reading: { ...forecast.reading, body: output.body.trim(), action: output.action.trim(), question: output.question.trim() },
        generation: { kind: 'local-llm', model },
      };
    },
  };
}
