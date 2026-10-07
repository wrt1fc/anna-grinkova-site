const chatTranscript = document.getElementById('chat-transcript');
const chatEmpty = document.getElementById('chat-empty');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const chatStop = document.getElementById('chat-stop');
const chatStatus = document.getElementById('chat-status');
const chatClear = document.getElementById('chat-clear');
let chatHistory = [];
let chatAbort = null;
let chatRequest = 0;
let chatSlowTimer;

function scrollChatToEnd() { chatTranscript.scrollTop = chatTranscript.scrollHeight; }
function chatIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('ui-icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `./assets/icons.svg#${name}`);
  svg.append(use);
  return svg;
}

function chatMessage(role, content, context = null) {
  const article = document.createElement('article');
  article.className = 'chat-message';
  article.dataset.role = role;
  const label = document.createElement('span');
  label.className = 'chat-message-label';
  label.textContent = role === 'user' ? 'Вы' : 'Помощник Анны';
  const paragraph = document.createElement('p');
  paragraph.textContent = content;
  article.append(label, paragraph);
  if (role === 'assistant' && content) {
    const actions = document.createElement('div');
    actions.className = 'chat-message-actions';
    const copy = document.createElement('button');
    copy.type = 'button';
    const copyLabel = document.createElement('span');
    copyLabel.textContent = 'Скопировать';
    copy.append(chatIcon('copy'), copyLabel);
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(content); copyLabel.textContent = 'Скопировано'; }
      catch { copyLabel.textContent = 'Не удалось скопировать'; }
    });
    actions.append(copy);
    if (context) {
      const source = document.createElement('span');
      source.className = 'chat-message-context';
      source.textContent = `${context.scope === 'personal' ? 'Личный' : 'Общий'} расчёт · ${context.card}`;
      actions.append(source);
    }
    article.append(actions);
  }
  chatTranscript.append(article);
  scrollChatToEnd();
  return article;
}

function thinkingMessage() {
  const article = chatMessage('assistant', '');
  article.classList.add('chat-message-thinking');
  const stage = document.createElement('div');
  stage.className = 'chat-thinking-stage';
  stage.setAttribute('role', 'status');
  stage.setAttribute('aria-label', 'Помощник печатает, карты перебираются');
  const cards = document.createElement('span');
  cards.className = 'chat-thinking-cards';
  cards.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 5; index += 1) {
    const card = document.createElement('i');
    const star = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    star.setAttribute('viewBox', '0 0 24 24');
    const mark = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    mark.setAttribute('href', './assets/icons.svg#star');
    star.append(mark);
    card.append(star);
    cards.append(card);
  }
  const line = document.createElement('span');
  line.className = 'chat-thinking-line';
  line.textContent = 'Помощник печатает';
  const dots = document.createElement('span');
  dots.className = 'chat-thinking-dots';
  dots.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 3; index += 1) dots.append(document.createElement('i'));
  line.append(dots);
  stage.append(cards, line);
  article.querySelector('p').replaceWith(stage);
  return article;
}

function updateChatSend() { chatSend.disabled = !!chatAbort || !chatInput.value.trim(); }

async function sendChat(message, existingUserMessage = false) {
  if (chatAbort) return;
  const text = message.trim();
  if (!text || text.length > 600) return;
  const request = ++chatRequest;
  const started = performance.now();
  chatEmpty.hidden = true;
  if (!existingUserMessage) chatMessage('user', text);
  chatInput.value = '';
  const thinking = thinkingMessage();
  const controller = new AbortController();
  chatAbort = controller;
  chatStop.hidden = false;
  chatStatus.textContent = '';
  chatSlowTimer = window.setTimeout(() => { if (request === chatRequest) chatStatus.textContent = 'Модель отвечает дольше обычного…'; }, 2500);
  updateChatSend();
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: chatHistory.slice(-6), draw: window.chatDrawPosition() }),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Ответ сейчас недоступен.');
    const remaining = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1100 - (performance.now() - started);
    if (remaining > 0) await new Promise((resolve) => window.setTimeout(resolve, remaining));
    if (request !== chatRequest) return;
    if (controller.signal.aborted) throw new DOMException('Ответ остановлен', 'AbortError');
    thinking.remove();
    chatMessage('assistant', data.answer, data.context);
    chatHistory.push({ role: 'user', content: text }, { role: 'assistant', content: data.answer });
    chatHistory = chatHistory.slice(-6);
    chatStatus.textContent = '';
  } catch (error) {
    if (request !== chatRequest) return;
    thinking.remove();
    const card = chatMessage('assistant', controller.signal.aborted ? 'Ответ остановлен.' : error.message || 'Не удалось получить ответ.');
    card.classList.add('chat-error');
    const actions = document.createElement('div');
    actions.className = 'chat-message-actions';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Повторить';
    retry.prepend(chatIcon('refresh'));
    retry.addEventListener('click', () => { card.remove(); sendChat(text, true); });
    actions.append(retry);
    card.append(actions);
    chatStatus.textContent = '';
  } finally {
    if (request === chatRequest) {
      clearTimeout(chatSlowTimer);
      chatAbort = null;
      chatStop.hidden = true;
      updateChatSend();
    }
  }
}

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  sendChat(chatInput.value);
});
chatInput.addEventListener('input', updateChatSend);
chatInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); chatForm.requestSubmit(); }
});
chatStop.addEventListener('click', () => chatAbort?.abort());
function clearChat(focus = true) {
  chatRequest += 1;
  chatAbort?.abort();
  chatAbort = null;
  clearTimeout(chatSlowTimer);
  chatHistory = [];
  chatTranscript.replaceChildren(chatEmpty);
  chatEmpty.hidden = false;
  chatInput.value = '';
  chatStatus.textContent = '';
  chatStop.hidden = true;
  updateChatSend();
  if (focus) chatInput.focus();
}
chatClear.addEventListener('click', () => clearChat());
document.addEventListener('anna-account-changed', () => clearChat(false));
for (const button of document.querySelectorAll('[data-chat-prompt]')) {
  button.addEventListener('click', () => sendChat(button.dataset.chatPrompt));
}
updateChatSend();
