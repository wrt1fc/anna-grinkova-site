// The chat with Fortuna: greeting, chart chips, the three starting buttons, the composer and the streamed answer.
import { api, readEvents } from './api.js';
import { $, app, loadNatal, planLine, visitorName } from './state.js';
import { closeSheet, node, openSheet } from './sheet.js';
import { activeIdeaDraw, bindIdeas, refreshIdeas, resetIdeas, setIdeasBusy } from './chat-ideas.js?v=1';

const MAX_CHARS = 600;
const HISTORY_ITEMS = 6;
// U+FE0E asks for the text glyph: without it Windows draws the signs as purple emoji tiles.
const SIGN_GLYPHS = Object.fromEntries(Object.entries({ Овен: '♈', Телец: '♉', Близнецы: '♊', Рак: '♋', Лев: '♌', Дева: '♍', Весы: '♎', Скорпион: '♏', Стрелец: '♐', Козерог: '♑', Водолей: '♒', Рыбы: '♓' }).map(([sign, glyph]) => [sign, `${glyph}︎`]));
const PLANET_GLYPHS = { sun: '☉', moon: '☽', pluto: '♇', saturn: '♄' };
const INTRO_QUESTION = 'Расскажи, как ты работаешь и с какими вопросами к тебе можно прийти.';

let history = [];
let busy = false;
let personId = null;
let people = null;
let chatGeneration = 0;
let replyController = null;

const transcript = () => $('#transcript');
const input = () => $('#chat-input');

function say(role, text, className = '') {
  const row = node('div', `msg msg-${role === 'user' ? 'user' : 'bot'}`);
  if (role !== 'user') { const avatar = node('img'); avatar.src = '/miniapp/assets/fortuna-avatar-v2.webp'; avatar.alt = ''; avatar.width = 34; avatar.height = 34; row.append(avatar); }
  const bubble = node('div', `bubble ${className}`.trim(), text);
  row.append(bubble);
  transcript().append(row);
  row.scrollIntoView({ block: 'end', behavior: 'smooth' });
  return bubble;
}

function showComposer(show = true) {
  $('#composer').hidden = !show;
  $('#chat-actions').hidden = show;
  if (show) input().focus();
}

function chip(planet, red = false) {
  const item = node('span', red ? 'chip is-red' : 'chip', `${PLANET_GLYPHS[planet.key] ?? ''} ${planet.degree}° ${SIGN_GLYPHS[planet.sign] ?? planet.sign}`.trim());
  item.setAttribute('aria-label', `${planet.name ?? ''} ${planet.degree}° ${planet.sign}`.trim());
  return item;
}

async function drawChartChip() {
  const box = $('#chart-chip');
  box.hidden = true;
  if (personId) return;
  const owner = app.me?.user?.id;
  const ticket = chatGeneration;
  const natal = await loadNatal();
  if (!natal || personId || owner !== app.me?.user?.id || ticket !== chatGeneration) return;
  const items = ['sun', 'moon'].map((key) => natal.planets.find((planet) => planet.key === key)).filter(Boolean).map((planet) => chip(planet));
  const rest = natal.planets.find((planet) => planet.retrograde);
  if (rest) items.push(chip(rest, true));
  $('#chart-chip-title').textContent = `Моя карта · ${visitorName()}`;
  $('#chart-chip-list').replaceChildren(...items);
  box.hidden = false;
}

export async function enterChat() {
  $('#person-name').textContent = personId ? ($('#person-name').textContent || '') : visitorName();
  $('#person-note').textContent = personId ? $('#person-note').textContent : 'Моя карта';
  $('#chat-quota').textContent = planLine();
  drawChartChip();
  refreshIdeas();
  if (app.pendingQuestion) {
    const question = app.pendingQuestion;
    app.pendingQuestion = '';
    showComposer(true);
    input().value = question;
    autosize();
    $('#chat-suggestions').open = false;
  } else if (!history.length && !$('#composer').hidden) {
    showComposer(false);
  }
}

function autosize() {
  const field = input();
  field.style.height = 'auto';
  field.style.height = `${Math.min(field.scrollHeight, 140)}px`;
}

function limitSheet() {
  const body = node('div');
  body.append(node('p', 'sheet-text', 'На сегодня вопросы закончились. Новые появятся завтра, а по подписке их больше.'));
  const subscribe = node('button', 'btn btn-gold', 'Оформить подписку'); subscribe.type = 'button';
  subscribe.addEventListener('click', () => { closeSheet(); app.go('plan'); });
  const later = node('button', 'btn btn-line', 'Понятно'); later.type = 'button';
  later.addEventListener('click', closeSheet);
  body.append(subscribe, later);
  openSheet('Вопросы закончились', body);
}

async function send(text) {
  const message = text.trim();
  if (busy || !message || message.length > MAX_CHARS) return;
  busy = true;
  const ticket = chatGeneration;
  replyController = new AbortController();
  setIdeasBusy(true);
  $('#person-switch').disabled = true;
  $('#chat-suggestions').open = false;
  showComposer(true);
  say('user', message);
  input().value = '';
  autosize();
  $('#composer button').disabled = true;
  const bubble = say('bot', '', 'is-typing');
  try {
    const response = await fetch('/api/chat', { method: 'POST', credentials: 'same-origin', signal: replyController.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ message, history: history.slice(-HISTORY_ITEMS), length: 'medium', tone: 'normal', profileId: personId,
        draw: !personId ? activeIdeaDraw() ?? (app.dayCardContext?.date === new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date())
          ? app.dayCardContext.position : 0) : 0 }) });
    if (ticket !== chatGeneration) return;
    if (!(response.headers.get('content-type') || '').includes('text/event-stream')) {
      const data = await response.json();
      if (data.error === 'chat_daily_limit') { bubble.closest('.msg').remove(); limitSheet(); return; }
      if (response.status === 401) { app.go('login'); return; }
      throw new Error(data.message || 'Ответ сейчас недоступен.');
    }
    let final = null;
    for await (const { event, data } of readEvents(response)) {
      if (ticket !== chatGeneration) return;
      if (event === 'delta') { bubble.classList.remove('is-typing'); bubble.textContent += data.text; bubble.scrollIntoView({ block: 'end' }); }
      else if (event === 'done') final = data;
      else if (event === 'error') throw new Error(data.message || 'Не удалось получить ответ.');
    }
    if (!final) throw new Error('Ответ прервался. Попробуй ещё раз.');
    bubble.classList.remove('is-typing');
    bubble.textContent = final.answer;
    history.push({ role: 'user', content: message }, { role: 'assistant', content: final.answer, signature: final.signature });
    history = history.slice(-HISTORY_ITEMS);
  } catch (error) {
    if (ticket !== chatGeneration || error.name === 'AbortError') return;
    bubble.classList.remove('is-typing');
    bubble.classList.add('is-error');
    bubble.textContent = error.message || 'Не удалось получить ответ.';
    const retry = node('button', 'btn btn-line', 'Повторить'); retry.type = 'button';
    retry.addEventListener('click', () => { bubble.closest('.msg').remove(); send(message); });
    const actions = node('div', 'bubble-actions'); actions.append(retry);
    bubble.append(actions);
  } finally {
    if (ticket === chatGeneration) {
      busy = false;
      setIdeasBusy(false);
      $('#person-switch').disabled = false;
      $('#composer button').disabled = false;
      api('/api/plan').then(({ ok, data }) => { if (ok && ticket === chatGeneration) { app.plan = data; $('#chat-quota').textContent = planLine(); } }).catch(() => {});
    }
  }
}

async function peopleSheet() {
  if (!people) {
    const { ok, data } = await api('/api/profiles');
    if (!ok) return;
    people = data.profiles ?? [];
  }
  const list = node('div', 'idea-list');
  const entries = [{ id: null, label: visitorName(), note: 'Моя карта' }, ...people.filter((item) => !item.locked)
    .map((item) => ({ id: item.id, label: item.label, note: item.relation }))];
  for (const entry of entries) {
    const button = node('button', 'btn btn-line', `${entry.label}${entry.id ? '' : ' · моя карта'}`); button.type = 'button';
    button.addEventListener('click', () => {
      personId = entry.id; history = []; app.dayCardContext = null;
      chatGeneration++;
      transcript().querySelectorAll('.msg:not(#chat-welcome)').forEach((row) => row.remove());
      input().value = ''; showComposer(false);
      $('#chat-suggestions').open = true;
      $('#person-name').textContent = entry.label;
      $('#person-note').textContent = entry.id ? 'Близкий человек' : 'Моя карта';
      closeSheet(); drawChartChip(); refreshIdeas();
    });
    list.append(button);
  }
  openSheet('Чью карту обсуждаем', list);
}

export function resetChat() { history = []; personId = null; people = null; app.dayCardContext = null;
  chatGeneration++; replyController?.abort(); busy = false;
  resetIdeas(); input().value = ''; $('#composer button').disabled = false; $('#person-switch').disabled = false;
  transcript().querySelectorAll('.msg:not(#chat-welcome)').forEach((row) => row.remove()); }

export function prepareCardQuestion({ position, date, card }) {
  if (busy) return false;
  resetChat();
  app.dayCardContext = { position, date };
  app.pendingQuestion = `Что для меня может значить сегодняшняя карта «${card.name}»? Помоги разобраться в её образе.`;
  app.go('chat');
  return true;
}

export function bindChat() {
  $('#chat-ask').addEventListener('click', () => showComposer(true));
  $('#chat-intro').addEventListener('click', () => { showComposer(true); input().value = INTRO_QUESTION; autosize(); });
  bindIdeas(() => ({ owner: app.me?.user?.id, profileId: personId }), (question) => {
    if (busy) return;
    showComposer(true); input().value = question; autosize(); input().focus();
  });
  $('#person-switch').addEventListener('click', peopleSheet);
  $('#composer').addEventListener('submit', (event) => { event.preventDefault(); send(input().value); });
  input().addEventListener('input', autosize);
  input().addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(input().value); } });
}
