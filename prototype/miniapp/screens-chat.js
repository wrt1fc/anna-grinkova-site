// The chat opens with examples and the composer; replies appear only after a question.
import { api, readEvents } from './api.js';
import { $, app, planLine, visitorName } from './state.js?v=3';
import { closeSheet, node, openSheet } from './sheet.js';
import { activeIdeaDraw, bindIdeas, refreshIdeas, resetIdeas, setIdeasBusy } from './chat-ideas.js?v=3';

const MAX_CHARS = 600;
const HISTORY_ITEMS = 6;
// The consent question is asked once per device; the answer itself lives on the account.
const CONSENT_ASKED_KEY = 'fortuna-chat-consent-asked';
let history = [];
let busy = false;
let personId = null;
let people = null;
let chatGeneration = 0;
let replyController = null;

const transcript = () => $('#transcript');
const input = () => $('#chat-input');

function clearTranscript() {
  transcript().querySelectorAll('.msg:not(#chat-welcome)').forEach((row) => row.remove());
}

function say(role, text, className = '') {
  const row = node('div', `msg msg-${role === 'user' ? 'user' : 'bot'}`);
  if (role !== 'user') { const avatar = node('img'); avatar.src = '/miniapp/assets/fortuna-avatar-v2.webp'; avatar.alt = ''; avatar.width = 34; avatar.height = 34; row.append(avatar); }
  const bubble = node('div', `bubble ${className}`.trim(), text);
  row.append(bubble);
  transcript().hidden = false;
  transcript().append(row);
  row.scrollIntoView({ block: 'end', behavior: 'smooth' });
  return bubble;
}

function showComposer(show = true, focus = true) {
  $('#composer').hidden = !show;
  $('#chat-actions').hidden = show;
  if (show && focus) input().focus();
}

export async function enterChat() {
  $('#person-name').textContent = personId ? ($('#person-name').textContent || '') : visitorName();
  $('#person-note').textContent = personId ? $('#person-note').textContent : 'Моя карта';
  $('#chat-quota').textContent = planLine() || '3 вопроса бесплатно после регистрации';
  $('#person-bar').hidden = true;
  $('#chat-welcome').hidden = true;
  $('#chart-chip').hidden = true;
  transcript().hidden = !history.length;
  showComposer(true, false);
  refreshIdeas();
  loadSaved();
  if (app.pendingQuestion) {
    const question = app.pendingQuestion;
    app.pendingQuestion = '';
    input().value = question;
    autosize();
  }
}

// The server keeps the conversation when the visitor agreed; signed answers come back trusted.
function renderSaved(messages) {
  const mine = messages.filter((item) => (item.profileId ?? null) === personId);
  clearTranscript();
  for (const item of mine.slice(-40)) say(item.role, item.content);
  history = mine.slice(-HISTORY_ITEMS).map(({ role, content, signature }) => ({ role, content, ...(signature ? { signature } : {}) }));
  transcript().hidden = !history.length;
}

function consentSheet() {
  const body = node('div');
  body.append(node('p', 'sheet-text', 'Могу сохранять нашу переписку, чтобы разговор не терялся и продолжался с любого устройства. История хранится на сервере в России, и ты можешь удалить её в любой момент.'));
  const keep = node('button', 'btn btn-gold', 'Сохранять переписку'); keep.type = 'button';
  keep.addEventListener('click', async () => {
    localStorage.setItem(CONSENT_ASKED_KEY, '1');
    const { ok } = await api('/api/chat/consent', { method: 'PUT', body: { consent: true } });
    closeSheet();
    if (ok) loadSaved();
  });
  const no = node('button', 'btn btn-line', 'Не надо'); no.type = 'button';
  no.addEventListener('click', () => { localStorage.setItem(CONSENT_ASKED_KEY, '1'); closeSheet(); });
  body.append(keep, no);
  openSheet('Сохранять историю чата?', body);
}

async function loadSaved() {
  if (!app.me || busy) return;
  const { ok, data } = await api('/api/chat/history');
  if (!ok) return;
  if (data.consent) { renderSaved(data.messages ?? []); return; }
  if (!localStorage.getItem(CONSENT_ASKED_KEY)) consentSheet();
}

function autosize() {
  const field = input();
  field.style.height = 'auto';
  field.style.height = `${Math.min(field.scrollHeight, 140)}px`;
}

function limitSheet(subscriptionRequired = false) {
  const body = node('div');
  body.append(node('p', 'sheet-text', subscriptionRequired
    ? 'Три бесплатных вопроса использованы. Чтобы продолжить разговор, оформи подписку. Натальная карта остаётся доступной.'
    : 'На сегодня вопросы по подписке закончились. Новые появятся завтра.'));
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
  if (!app.me) { app.pendingQuestion = message; app.requireRegistration('chat'); return; }
  busy = true;
  const ticket = chatGeneration;
  replyController = new AbortController();
  setIdeasBusy(true);
  $('#person-switch').disabled = true;
  $('#chat-suggestions').open = false;
  showComposer(true);
  const userBubble = say('user', message);
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
      if (['chat_daily_limit','subscription_required'].includes(data.error)) {
        bubble.closest('.msg').remove(); userBubble.closest('.msg').remove();
        transcript().hidden = !history.length; input().value = message; autosize();
        limitSheet(data.error === 'subscription_required'); return;
      }
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
    if (final.learning?.text && !final.filtered && !final.crisis) {
      const invitation = node('aside', 'learning-invitation');
      invitation.append(node('strong', '', final.learning.title), node('p', '', final.learning.text));
      const learn = node('a', 'btn btn-line learning-button', 'Узнать об обучении');
      learn.href = 'https://t.me/anna_grinkovaa?text=%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82%21%20%D0%BA%D0%BE%D0%B4%D0%BE%D0%B2%D0%BE%D0%B5%20%D1%81%D0%BB%D0%BE%D0%B2%D0%BE%20%22%D1%84%D0%BE%D1%80%D1%82%D1%83%D0%BD%D0%B0%22';
      learn.target = '_blank'; learn.rel = 'noopener noreferrer';
      invitation.append(learn);
      bubble.append(invitation);
    }
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
      clearTranscript();
      input().value = ''; showComposer(true, false);
      $('#chat-suggestions').open = true;
      $('#person-name').textContent = entry.label;
      $('#person-note').textContent = entry.id ? 'Близкий человек' : 'Моя карта';
      closeSheet(); refreshIdeas();
      loadSaved();
    });
    list.append(button);
  }
  openSheet('Чью карту обсуждаем', list);
}

export function resetChat() { history = []; personId = null; people = null; app.dayCardContext = null;
  chatGeneration++; replyController?.abort(); busy = false;
  resetIdeas(); input().value = ''; $('#composer button').disabled = false; $('#person-switch').disabled = false;
  clearTranscript(); }

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
  bindIdeas(() => ({ owner: app.me?.user?.id, profileId: personId }), (question) => {
    if (busy) return;
    showComposer(true); input().value = question; autosize(); input().focus();
  });
  $('#person-switch').addEventListener('click', peopleSheet);
  $('#composer').addEventListener('submit', (event) => { event.preventDefault(); send(input().value); });
  input().addEventListener('input', autosize);
  input().addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(input().value); } });
}
