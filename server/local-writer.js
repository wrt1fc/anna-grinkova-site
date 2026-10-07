import forecastStyle from '../config/forecast-style.json' with { type: 'json' };

const ENDPOINT = 'http://127.0.0.1:11434/api/generate';

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    interpretation: { type: 'string' },
  },
  required: ['interpretation'],
  additionalProperties: false,
};

function validInterpretation(value) {
  return typeof value === 'string' && value.length >= 80 && value.length <= 320
    && !/[\d?<>]/u.test(value)
    && !/(Солнц|Лун|Меркур|Венер|Марс|Юпитер|Сатурн|Уран|Нептун|Плутон|аспект|новолун|полнолун|градус|зодиак|таро|аркан|гарантир|неизбежн|вы заметите|это поможет|произойдёт|случится)/iu.test(value);
}

export function createLocalForecastWriter({ model, fetchImpl = fetch }) {
  if (typeof model !== 'string' || !/^[\w./:-]{2,80}$/.test(model)) throw new Error('Invalid local model name');
  return {
    async refine(forecast) {
      if (forecast?.scope !== 'general') throw new Error('Local writer only accepts a general forecast');
      const response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          format: OUTPUT_SCHEMA,
          options: { temperature: 0, num_predict: 190, num_ctx: 1024 },
          system: forecastStyle.systemInstructions.join(' '),
          prompt: JSON.stringify({ theme: forecast.tarot.focus, action: forecast.reading.action }),
        }),
        signal: AbortSignal.timeout(75_000),
      });
      if (!response.ok) throw new Error(`Local model HTTP ${response.status}`);
      const result = await response.json();
      if (typeof result.response !== 'string') throw new Error('Local model returned no text');
      if (result.done_reason && result.done_reason !== 'stop') throw new Error('Local model response was incomplete');
      const output = JSON.parse(result.response);
      if (!validInterpretation(output.interpretation)) throw new Error('Local model returned an unsafe interpretation');
      return {
        ...forecast,
        reading: { ...forecast.reading, body: `${forecast.reading.body} ${output.interpretation.trim()}` },
        generation: { kind: 'local-llm', model },
      };
    },
  };
}
