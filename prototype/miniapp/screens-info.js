// Home, natal chart, day and week screens.
import { api, formatDate, MONTHS_GEN, WEEKDAYS } from './api.js';
import { $, app, birth, loadNatal, planLine, setNote, visitorName } from './state.js?v=3';
import { node } from './sheet.js';
import { drawWheel } from './wheel.js';

// U+FE0E asks for the text glyph: without it Windows draws the signs as purple emoji tiles.
const GLYPH = Object.fromEntries(Object.entries({ Овен: '♈', Телец: '♉', Близнецы: '♊', Рак: '♋', Лев: '♌', Дева: '♍', Весы: '♎', Скорпион: '♏', Стрелец: '♐', Козерог: '♑', Водолей: '♒', Рыбы: '♓' }).map(([sign, glyph]) => [sign, `${glyph}︎`]));
// «в ♍ Деве», as in the Figma day card; the general and the personal forecast keep the sky in different places.
const inSign = (sign, body, planet) => (IN_SIGN[sign] ? `в ${GLYPH[sign]} ${IN_SIGN[sign]}` : `в ${new RegExp(`${planet} в ([^,;.]+)`).exec(body)?.[1] ?? ''}`);
const IN_SIGN = { Овен: 'Овне', Телец: 'Тельце', Близнецы: 'Близнецах', Рак: 'Раке', Лев: 'Льве', Дева: 'Деве', Весы: 'Весах', Скорпион: 'Скорпионе', Стрелец: 'Стрельце', Козерог: 'Козероге', Водолей: 'Водолее', Рыбы: 'Рыбах' };

export async function enterHome() {
  $('#home-name').textContent = app.me ? visitorName() : 'Фортуна';
  $('#home-plan').textContent = planLine() || 'Посмотри возможности';
  $('#home-promo-note').textContent = planLine() || '3 вопроса и натальная карта после регистрации';
  $('.home-intro strong').textContent = app.me ? 'Знакомство с Фортуной' : 'Попробовать бесплатно';
  $('#home-intro-note').textContent = app.me ? planLine() : 'После регистрации · бонус автоматически';
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

let dayRequest = 0;
let weekRequest = 0;
let activeDay = null;
let activeWeek = null;
let selectedWeekDate = null;
const PLANET_NAMES = { sun: 'Солнце', moon: 'Луна', mercury: 'Меркурий', venus: 'Венера', mars: 'Марс', jupiter: 'Юпитер', saturn: 'Сатурн' };
const ASPECT_NAMES = { conjunction: 'соединение', sextile: 'секстиль', square: 'квадрат', trine: 'трин', opposition: 'оппозиция' };
const localDate = (iso) => new Date(`${iso}T12:00:00Z`);
const dateLabel = (iso, weekday = false) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', ...(weekday ? { weekday: 'long' } : {}), day: 'numeric', month: 'long' }).format(localDate(iso));
const skyOf = (forecast) => forecast.astronomy.transit ?? forecast.astronomy;
const moscowTime = (iso) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

function skyEvents(forecast) {
  const events = [
    ...(forecast.astronomy.moonIngresses ?? []).map(e => ({ at: e.at, text: `Луна переходит из знака ${e.from} в ${e.to}.` })),
    ...(forecast.astronomy.exactAspects ?? []).map(e => ({ at: e.at, text: `${PLANET_NAMES[e.first] ?? e.first} и ${PLANET_NAMES[e.second] ?? e.second} — ${ASPECT_NAMES[e.aspect] ?? e.aspect}.` })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return events.length ? events : [{ at: forecast.calculatedFor, text: 'Луна не меняет знак; точных аспектов из отслеживаемого набора в этот день нет.' }];
}

export async function enterDay() {
  const request = ++dayRequest;
  activeDay = null;
  setNote('day');
  $('#day-personal').hidden = !!birth();
  $('#day-content').hidden = true;
  $('#day-loading').hidden = false;
  $('#day-retry').hidden = true;
  const selected = app.forecastDate;
  try {
    const { ok, data } = await api(`/api/forecast/day?draw=0${selected ? `&date=${encodeURIComponent(selected)}` : ''}`);
    if (request !== dayRequest) return;
    if (!ok) throw new Error(data.message || 'Не удалось загрузить прогноз.');
    activeDay = data;
    const sky = skyOf(data);
    $('#day-date').textContent = `${dateLabel(data.date, true)} · ${data.scope === 'personal' ? 'личный прогноз' : 'общий прогноз'}`;
    $('#day-moon-title').textContent = `☽ Луна ${inSign(sky.moon?.sign, data.reading.body, 'Луна')}`.trim();
    $('#day-moon-phase').textContent = data.astronomy.moonPhase;
    $('#day-sun').textContent = `☉ Солнце ${inSign(sky.sun?.sign, data.reading.body, 'Солнце')}`.trim();
    $('#day-theme').textContent = data.tarot.focus || data.reading.theme;
    $('#day-body').textContent = data.reading.body;
    $('#day-action').textContent = data.reading.action;
    $('#day-question').textContent = data.reading.question;
    $('#day-events').replaceChildren(...skyEvents(data).map(event => {
      const li = node('li');
      const time = node('time', '', `${moscowTime(event.at)} МСК`); time.dateTime = event.at;
      li.append(time, node('p', '', event.text)); return li;
    }));
    $('#day-content').hidden = false;
  } catch (error) {
    if (request !== dayRequest) return;
    setNote('day', error.message || 'Не удалось загрузить прогноз. Проверьте связь.');
    $('#day-retry').hidden = false;
  } finally { if (request === dayRequest) $('#day-loading').hidden = true; }
}

function selectWeekDate(date, focus = false) {
  const forecast = activeWeek?.days.find(day => day.date === date);
  if (!forecast) return;
  selectedWeekDate = date;
  for (const button of $('#week-days').children) {
    const chosen = button.dataset.date === date;
    button.setAttribute('aria-pressed', String(chosen));
    button.tabIndex = chosen ? 0 : -1;
    if (chosen && focus) button.focus();
  }
  const sky = skyOf(forecast);
  $('#week-selected-date').textContent = dateLabel(date, true);
  $('#week-selected-moon').textContent = `Луна ${inSign(sky.moon?.sign, forecast.reading.body, 'Луна')}`;
  $('#week-selected-phase').textContent = `${forecast.astronomy.moonPhase} · ${forecast.scope === 'personal' ? 'учтена твоя карта' : 'общий прогноз'}`;
  $('#week-selected-action').textContent = forecast.reading.action;
  $('#week-selected-question').textContent = forecast.reading.question;
}

export async function enterWeek() {
  const request = ++weekRequest;
  activeWeek = null;
  setNote('week');
  $('#week-content').hidden = true;
  $('#week-loading').hidden = false;
  $('#week-retry').hidden = true;
  try {
    const { ok, data } = await api('/api/forecast/week');
    if (request !== weekRequest) return;
    if (!ok) throw new Error(data.message || 'Не удалось загрузить неделю.');
    activeWeek = data;
    $('#week-range').textContent = `${dateLabel(data.weekStart)} — ${dateLabel(data.weekEnd)} · ${data.scope === 'personal' ? 'личный разбор' : 'общий разбор'}`;
    $('#week-title').textContent = data.reading.title;
    $('#week-body').textContent = data.reading.body;
    $('#week-personal-note').textContent = data.reading.personalNote;
    $('#week-question').textContent = data.reading.question;
    $('#week-recommendations').replaceChildren(...data.reading.recommendations.map(period => {
      const section = node('article', 'weekly-period');
      section.append(node('p', 'period-date', period.label), node('h3', '', `Луна в знаке ${period.sign}`), node('p', '', period.text));
      return section;
    }));
    $('#week-days').replaceChildren(...data.days.map((forecast, index) => {
      const button = node('button'); button.type = 'button'; button.dataset.date = forecast.date;
      button.classList.toggle('is-today', forecast.date === data.today);
      if (forecast.date === data.today) button.setAttribute('aria-current', 'date');
      button.setAttribute('aria-label', `${dateLabel(forecast.date, true)}${forecast.date === data.today ? ', сегодня' : ''}`);
      button.append(node('span', '', String(localDate(forecast.date).getUTCDate())), node('small', '', WEEKDAYS[index]));
      button.addEventListener('click', () => selectWeekDate(forecast.date));
      return button;
    }));
    selectWeekDate(data.days.some(day => day.date === selectedWeekDate) ? selectedWeekDate : data.today);
    $('#week-content').hidden = false;
  } catch (error) {
    if (request !== weekRequest) return;
    setNote('week', error.message || 'Не удалось загрузить неделю. Проверьте связь.');
    $('#week-retry').hidden = false;
  } finally { if (request === weekRequest) $('#week-loading').hidden = true; }
}

export function bindInfo() {
  $('#day-retry').addEventListener('click', enterDay);
  $('#week-retry').addEventListener('click', enterWeek);
  $('#week-open-day').addEventListener('click', () => { app.forecastDate = selectedWeekDate; app.go('day'); });
  for (const button of document.querySelectorAll('[data-go="day"]')) button.addEventListener('click', () => { app.forecastDate = null; });
  $('#week-days').addEventListener('keydown', event => {
    const buttons = [...$('#week-days').children];
    const current = buttons.findIndex(button => button.dataset.date === selectedWeekDate);
    let index;
    if (event.key === 'ArrowRight') index = (current + 1) % buttons.length;
    else if (event.key === 'ArrowLeft') index = (current + buttons.length - 1) % buttons.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = buttons.length - 1;
    else return;
    if (!buttons.length) return;
    event.preventDefault(); selectWeekDate(buttons[index].dataset.date, true);
  });
  $('#natal-ask').addEventListener('click', () => { app.pendingQuestion = 'Что главное в моей натальной карте?'; app.go('chat'); });
  for (const link of document.querySelectorAll('[data-ask]')) {
    link.addEventListener('click', () => {
      app.pendingQuestion = link.dataset.ask === 'week' && activeWeek
        ? `Помоги понять мой разбор на ${activeWeek.weekStart} — ${activeWeek.weekEnd}. Тема: ${activeWeek.reading.title}. ${activeWeek.reading.body} Что мне важно учесть?`
        : activeDay ? `Помоги понять прогноз на ${activeDay.date}. ${activeDay.reading.body} Совет: ${activeDay.reading.action} Как применить его к своей ситуации?`
          : 'Что мне важно учесть в моём прогнозе?';
      app.go('chat');
    });
  }
}
