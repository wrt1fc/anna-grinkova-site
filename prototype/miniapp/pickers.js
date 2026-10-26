// Date, time and city pickers shown as bottom sheets, as in the Figma frames «Дата», «Время», «Город».
import { api, MONTHS, WEEKDAYS, formatDate } from './api.js';
import { closeSheet, node, openSheet } from './sheet.js';

const MIN_YEAR = 1900;
const pad = (value) => String(value).padStart(2, '0');
const COUNTRIES = { RU: 'Россия', BY: 'Беларусь', KZ: 'Казахстан', UA: 'Украина', US: 'США', DE: 'Германия', GB: 'Великобритания', FR: 'Франция', IL: 'Израиль', GE: 'Грузия', AM: 'Армения', AZ: 'Азербайджан', UZ: 'Узбекистан', KG: 'Киргизия', TJ: 'Таджикистан', TR: 'Турция', CN: 'Китай' };
const todayIso = () => new Date().toISOString().slice(0, 10);

function doneButton(label, onClick) {
  const button = node('button', 'btn btn-gold', label);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

export function pickDate({ value, onPick }) {
  const today = todayIso();
  const start = /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value : '1990-01-01';
  let year = Number(start.slice(0, 4)), month = Number(start.slice(5, 7)) - 1, picked = value || '';
  const root = node('div');
  const head = node('div', 'cal-head');
  const prev = node('button', '', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', 'Предыдущий месяц');
  const next = node('button', '', '›'); next.type = 'button'; next.setAttribute('aria-label', 'Следующий месяц');
  const label = node('button'); label.type = 'button'; label.setAttribute('aria-label', 'Выбрать год');
  const grid = node('div', 'cal-grid');
  const years = node('div', 'cal-years'); years.hidden = true;
  head.append(prev, label, next);
  label.append(node('strong'));
  const finish = doneButton('Выбрать', () => { if (!picked) return; closeSheet(); onPick(picked); });

  function draw() {
    label.firstChild.textContent = `${MONTHS[month]} ${year}`;
    grid.replaceChildren(...WEEKDAYS.map((name) => node('span', 'dow', name)));
    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    for (let index = 0; index < offset; index += 1) grid.append(node('span'));
    const days = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= days; day += 1) {
      const iso = `${year}-${pad(month + 1)}-${pad(day)}`;
      const button = node('button', '', String(day)); button.type = 'button';
      button.setAttribute('aria-pressed', String(iso === picked));
      button.disabled = iso > today;
      button.addEventListener('click', () => { picked = iso; draw(); });
      grid.append(button);
    }
    finish.disabled = !picked;
  }
  function shift(step) {
    month += step;
    if (month < 0) { month = 11; year -= 1; } else if (month > 11) { month = 0; year += 1; }
    year = Math.max(MIN_YEAR, Math.min(Number(today.slice(0, 4)), year));
    draw();
  }
  prev.addEventListener('click', () => shift(-1));
  next.addEventListener('click', () => shift(1));
  label.addEventListener('click', () => {
    years.hidden = !years.hidden; grid.hidden = !years.hidden;
    if (years.hidden) return;
    years.replaceChildren();
    for (let item = Number(today.slice(0, 4)); item >= MIN_YEAR; item -= 1) {
      const button = node('button', '', String(item)); button.type = 'button';
      button.setAttribute('aria-pressed', String(item === year));
      button.addEventListener('click', () => { year = item; years.hidden = true; grid.hidden = false; draw(); });
      years.append(button);
    }
    years.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'center' });
  });
  draw();
  root.append(head, grid, years, finish);
  openSheet('Дата рождения', root);
}

export function pickTime({ value, onPick }) {
  const [startHour, startMinute] = /^\d{2}:\d{2}$/.test(value ?? '') ? value.split(':') : ['12', '00'];
  const root = node('div');
  const caption = node('div', 'time-cap'); caption.append(node('span', '', 'Часы'), node('span'), node('span', '', 'Минуты'));
  const row = node('div', 'time-pick');
  const field = (initial, max, name) => {
    const input = node('input'); input.inputMode = 'numeric'; input.maxLength = 2; input.value = initial; input.setAttribute('aria-label', name);
    input.addEventListener('focus', () => input.select());
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 2); });
    input.addEventListener('blur', () => { input.value = pad(Math.min(max, Number(input.value) || 0)); });
    return input;
  };
  const hours = field(startHour, 23, 'Часы'), minutes = field(startMinute, 59, 'Минуты');
  row.append(hours, node('b', '', ':'), minutes);
  const choose = (time) => { closeSheet(); onPick(time); };
  const finish = doneButton('Выбрать', () => { hours.blur(); minutes.blur(); choose(`${pad(Math.min(23, Number(hours.value) || 0))}:${pad(Math.min(59, Number(minutes.value) || 0))}`); });
  const unknown = node('button', 'link-btn sheet-center', 'Не помню точно'); unknown.type = 'button';
  unknown.addEventListener('click', () => choose('12:00'));
  root.append(caption, row, finish, unknown);
  openSheet('Время рождения', root);
  hours.focus();
}

export function pickCity({ onPick }) {
  const root = node('div');
  const input = node('input', 'field'); input.type = 'search'; input.placeholder = 'Начните вводить город'; input.autocomplete = 'off'; input.setAttribute('aria-label', 'Город рождения');
  const list = node('ul', 'city-list'); list.setAttribute('aria-live', 'polite');
  const empty = node('p', 'hint', 'Введите название города, например «Москва».');
  let timer = 0, request = 0;
  async function search() {
    const query = input.value.trim(), turn = ++request;
    if (query.length < 2) { list.replaceChildren(); empty.hidden = false; empty.textContent = 'Введите название города, например «Москва».'; return; }
    try {
      const { data } = await api(`/api/cities?q=${encodeURIComponent(query)}`);
      if (turn !== request) return;
      list.replaceChildren();
      for (const city of data.cities ?? []) {
        const item = node('li'), button = node('button'); button.type = 'button';
        button.append(node('strong', '', city.displayName ?? city.name), node('small', '', COUNTRIES[city.country] ?? city.country ?? ''));
        button.addEventListener('click', () => { closeSheet(); onPick(city); });
        item.append(button); list.append(item);
      }
      empty.hidden = list.children.length > 0;
      empty.textContent = 'Такого города нет в списке. Попробуйте ближайший крупный город.';
    } catch { if (turn === request) { empty.hidden = false; empty.textContent = 'Не удалось найти город. Проверьте связь.'; } }
  }
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 220); });
  root.append(input, list, empty);
  openSheet('Город рождения', root);
  input.focus();
}

export { formatDate };
