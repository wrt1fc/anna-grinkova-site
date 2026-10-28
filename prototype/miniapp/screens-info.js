// Home, natal chart, day and week screens.
import { api, formatDate, MONTHS_GEN, WEEKDAYS } from './api.js';
import { $, app, birth, loadNatal, planLine, setNote, visitorName } from './state.js';
import { node } from './sheet.js';
import { drawWheel } from './wheel.js';

const FULL_MOON = 180;
// U+FE0E asks for the text glyph: without it Windows draws the signs as purple emoji tiles.
const GLYPH = Object.fromEntries(Object.entries({ Овен: '♈', Телец: '♉', Близнецы: '♊', Рак: '♋', Лев: '♌', Дева: '♍', Весы: '♎', Скорпион: '♏', Стрелец: '♐', Козерог: '♑', Водолей: '♒', Рыбы: '♓' }).map(([sign, glyph]) => [sign, `${glyph}︎`]));
// «в ♍ Деве», as in the Figma day card; the general and the personal forecast keep the sky in different places.
const inSign = (sign, body, planet) => (IN_SIGN[sign] ? `в ${GLYPH[sign]} ${IN_SIGN[sign]}` : `в ${new RegExp(`${planet} в ([^,;.]+)`).exec(body)?.[1] ?? ''}`);
const IN_SIGN = { Овен: 'Овне', Телец: 'Тельце', Близнецы: 'Близнецах', Рак: 'Раке', Лев: 'Льве', Дева: 'Деве', Весы: 'Весах', Скорпион: 'Скорпионе', Стрелец: 'Стрельце', Козерог: 'Козероге', Водолей: 'Водолее', Рыбы: 'Рыбах' };

export async function enterHome() {
  $('#home-name').textContent = visitorName();
  $('#home-plan').textContent = planLine() || 'Добро пожаловать';
  $('#home-promo-note').textContent = planLine() || 'Первые вопросы бесплатно';
  drawWheel($('#home-wheel'), await loadNatal());
}

function birthLine(profile) {
  return [profile.birthPlace, `${formatDate(profile.birthDate)}, ${profile.birthTime}`].filter(Boolean).join(' · ');
}

export async function enterNatal() {
  const profile = birth();
  if (!profile) { app.birthMode = null; app.redirect('birth'); return; }
  setNote('natal');
  const name = app.me.user.displayName;
  $('#t-natal').textContent = name ? `Натальная карта · ${name}` : 'Натальная карта';
  $('#natal-sub').textContent = birthLine(profile);
  $('#natal-pick-title').textContent = 'Карта готова к исследованию';
  $('#natal-pick-text').textContent = 'Нажмите на планету или знак, чтобы увидеть его положение.';
  const natal = await loadNatal();
  if (!natal) { setNote('natal', 'Не удалось рассчитать карту. Проверьте данные рождения.'); return; }
  drawWheel($('#natal-wheel'), natal, (title, text) => {
    $('#natal-pick-title').textContent = title;
    $('#natal-pick-text').textContent = text;
  });
  const cards = $('#natal-cards');
  cards.replaceChildren(...natal.sections.map((section) => {
    const card = node('article', 'card nat-card');
    const house = section.house && !['asc', 'mc'].includes(section.key) ? `, ${section.house} дом` : '';
    card.append(node('span', 'tag', `${section.sign}${house}`), node('h3', '', section.title), node('p', '', section.lead), node('p', '', section.text));
    return card;
  }));
}

function moonShift(angle) {
  const lit = (1 - Math.cos((angle * Math.PI) / 180)) / 2;
  return `${angle < FULL_MOON ? -lit * 100 : lit * 100}%`;
}

export async function enterDay() {
  setNote('day');
  $('#day-personal').hidden = !!birth();
  const { ok, data } = await api('/api/forecast/day?draw=0');
  if (!ok) { setNote('day', data.message || 'Не удалось загрузить прогноз.'); return; }
  const moon = data.astronomy;
  const [year, month, day] = data.date.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  $('#day-date').textContent = `${['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'][date.getDay()]}, ${day} ${MONTHS_GEN[month - 1]}`;
  const sky = moon.transit ?? moon;
  $('#day-moon-title').textContent = `☽ Луна ${inSign(sky.moon?.sign, data.reading.body, 'Луна')}`.trim();
  $('#day-moon-phase').textContent = moon.moonPhase;
  $('#day-sun').textContent = `☉ Солнце ${inSign(sky.sun?.sign, data.reading.body, 'Солнце')}`.trim();
  $('#day-moon').style.setProperty('--moon-shift', moonShift(moon.moonAngle));
  $('#day-body').textContent = data.reading.body;
  $('#day-action').textContent = data.reading.action;
}

export function enterWeek() {
  setNote('week');
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, index) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index));
  const label = (date) => `${date.getDate()} ${MONTHS_GEN[date.getMonth()]}`;
  $('#week-range').textContent = `${label(days[0])} — ${label(days[6])}`;
  $('#week-days').replaceChildren(...days.map((date, index) => {
    const item = node('button');
    item.type = 'button';
    item.disabled = true;
    item.classList.toggle('is-today', date.toDateString() === today.toDateString());
    item.append(node('span', '', String(date.getDate())), node('small', '', WEEKDAYS[index]));
    return item;
  }));
}

export function bindInfo() {
  $('#natal-ask').addEventListener('click', () => { app.pendingQuestion = 'Что главное в моей натальной карте?'; app.go('chat'); });
  for (const link of document.querySelectorAll('[data-ask]')) {
    link.addEventListener('click', () => {
      app.pendingQuestion = link.dataset.ask === 'week' ? 'Что мне важно учесть на этой неделе?' : 'Что значит мой прогноз на сегодня?';
      app.go('chat');
    });
  }
}
