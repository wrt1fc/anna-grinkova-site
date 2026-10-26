// Requests to the site's own API; a failed network call throws, an error answer comes back as { ok: false }.
export async function api(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(path, { method, credentials: 'same-origin', signal, cache: 'no-store',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null;
  try { data = await response.json(); } catch { /* an empty or non-JSON answer */ }
  return { ok: response.ok, status: response.status, data: data ?? {} };
}

const BOUNDARY = '\n\n';

// Reads the server-sent events of the chat answer: { event, data } pairs.
export async function* readEvents(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf(BOUNDARY)) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + BOUNDARY.length);
      const event = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.+)$/m.exec(block)?.[1];
      if (event && data) yield { event, data: JSON.parse(data) };
    }
  }
}

export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function formatDate(iso) {
  const [year, month, day] = String(iso ?? '').slice(0, 10).split('-');
  return year && month && day ? `${day}.${month}.${year}` : '';
}
