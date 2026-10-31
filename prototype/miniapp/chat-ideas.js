import { api } from './api.js';
import { $, app } from './state.js?v=2';
import { closeSheet, node, openSheet } from './sheet.js';
import { savedPosition } from './daily-card-choice.js?v=1';

let context, choose, data = null, topic = 'natal', generation = 0, controller, timer;
let busy = false, loading = false, expiresAt = 0;
const visible = () => !document.querySelector('[data-screen="chat"]').hidden;
const fresh = () => data && performance.now() < expiresAt;
const fallbackQuestions = () => context().profileId
  ? ['Что главное в натальной карте этого человека?', 'Как его Венера проявляется в отношениях?', 'Какие сильные стороны видны в его карте?']
  : ['Что главное в моей натальной карте?', 'Как моя Венера проявляется в отношениях?', 'Какие сильные стороны видны в моей карте?'];

function pick(question, card = false) {
  if (busy || loading) return;
  if (data && !fresh()) { refreshIdeas(); return; }
  if (card && data && !context().profileId) app.dayCardContext = { date: data.date, position: data.card.draw };
  $('#chat-suggestions').open = false;
  choose(question);
}

function syncDisabled() {
  for (const button of $('#chat-suggestions').querySelectorAll('button')) {
    button.disabled = busy || loading || (button.dataset.questionTopic === 'day' && !data);
  }
}

function render() {
  const daily = $('#chat-daily-question');
  daily.hidden = !data;
  if (data) {
    $('#chat-daily-label').textContent = context().profileId ? 'Вопрос дня о близком человеке' : 'Твой вопрос дня';
    $('#chat-daily-text').textContent = data.dailyQuestion.text;
    $('#chat-daily-note').textContent = data.dailyQuestion.personalization === 'natal'
      ? 'По натальной карте · обновляется каждый день' : 'Личный вопрос · обновляется каждый день';
  }
  if (!data) topic = 'natal';
  const questions = data?.groups.find((group) => group.id === topic)?.questions ?? fallbackQuestions();
  const buttons = questions.map((question) => {
    const button = node('button', '', question); button.type = 'button';
    button.addEventListener('click', () => pick(question, topic === 'day'));
    return button;
  });
  $('#chat-question-list').replaceChildren(...buttons);
  for (const button of document.querySelectorAll('[data-question-topic]')) {
    button.setAttribute('aria-pressed', String(button.dataset.questionTopic === topic));
  }
  syncDisabled();
}

// The server supplies the date, so device timezone/clock cannot select yesterday's card.
export async function refreshIdeas() {
  const selected = context();
  if (!selected.owner) return;
  const ticket = ++generation;
  controller?.abort(); clearTimeout(timer);
  controller = new AbortController();
  data = null; expiresAt = 0; loading = true;
  $('#chat-suggestions-status').textContent = 'Подбираем вопросы…';
  render();
  const same = () => ticket === generation && context().owner === selected.owner && context().profileId === selected.profileId;
  const url = (draw) => `/api/chat/suggestions?draw=${draw}${selected.profileId ? `&profileId=${selected.profileId}` : ''}`;
  try {
    let result = await api(url(0), { signal: controller.signal });
    if (!same()) return;
    if (!result.ok) throw new Error('unavailable');
    const date = result.data.date;
    const draw = selected.profileId ? 0 : savedPosition(selected.owner, date)
      ?? (app.dayCardContext?.date === date ? app.dayCardContext.position : 0);
    if (draw !== 0) result = await api(url(draw), { signal: controller.signal });
    if (!same()) return;
    if (!result.ok || !result.data.dailyQuestion?.text || !Array.isArray(result.data.groups)
      || !Number.isFinite(result.data.refreshAfterMs)) throw new Error('unavailable');
    data = result.data;
    expiresAt = performance.now() + data.refreshAfterMs;
    if (!selected.profileId) app.dayCardContext = { date: data.date, position: data.card.draw };
    $('#chat-suggestions-status').textContent = '';
    timer = setTimeout(() => { if (visible()) refreshIdeas(); }, Math.min(data.refreshAfterMs, 86_401_000));
  } catch (error) {
    if (!same() || error.name === 'AbortError') return;
    const status = $('#chat-suggestions-status');
    status.textContent = 'Вопрос дня пока не загрузился. Можно выбрать общую тему или ';
    const retry = node('button', 'more-questions', 'попробовать ещё раз'); retry.type = 'button';
    retry.addEventListener('click', refreshIdeas); status.append(retry);
  } finally {
    if (same()) { loading = false; render(); }
  }
}

export function activeIdeaDraw() { return fresh() ? data.card.draw : null; }
export function setIdeasBusy(value) { busy = value; syncDisabled(); }
export function resetIdeas() {
  generation++; controller?.abort(); clearTimeout(timer);
  data = null; topic = 'natal'; expiresAt = 0; busy = false; loading = false;
  $('#chat-suggestions').open = true;
  $('#chat-daily-question').hidden = true;
  $('#chat-question-list').replaceChildren();
  $('#chat-suggestions-status').textContent = '';
}

export function bindIdeas(getContext, selectQuestion) {
  context = getContext; choose = selectQuestion;
  $('#chat-daily-question').addEventListener('click', () => { if (data) pick(data.dailyQuestion.text); });
  for (const button of document.querySelectorAll('[data-question-topic]')) button.addEventListener('click', () => {
    topic = button.dataset.questionTopic; render();
  });
  $('#chat-ideas').addEventListener('click', () => {
    if (busy || loading) return;
    const list = node('div', 'idea-list');
    const questions = data ? data.groups.flatMap((group) => group.questions.map((text) => ({ text, card: group.id === 'day' })))
      : fallbackQuestions().map((text) => ({ text, card: false }));
    for (const question of questions) {
      const button = node('button', 'btn btn-line', question.text); button.type = 'button';
      button.addEventListener('click', () => { closeSheet(); pick(question.text, question.card); }); list.append(button);
    }
    openSheet('Что спросить у Фортуны', list);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && visible() && !fresh() && !loading) refreshIdeas();
  });
}
