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
let chatSignedIn = false;
const chatLocked = document.getElementById('chat-locked');
const lengthKey = 'anna-chat-length';
const formatButtons = document.querySelectorAll('[data-chat-length]');
const lengths = new Set([...formatButtons].map((button) => button.dataset.chatLength));
let chatLengthValue = 'medium';

// The answer format is chosen in the greeting and kept per visitor, so browser storage is enough.
try {
  const saved = localStorage.getItem(lengthKey);
  if (lengths.has(saved)) chatLengthValue = saved;
} catch { /* storage unavailable: keep the default */ }
function selectedLength() { return chatLengthValue; }
function setLength(value) {
  if (!lengths.has(value)) return;
  chatLengthValue = value;
  try { localStorage.setItem(lengthKey, value); } catch { /* not critical */ }
  for (const button of formatButtons) button.setAttribute('aria-pressed', String(button.dataset.chatLength === value));
}
for (const button of formatButtons) button.addEventListener('click', () => setLength(button.dataset.chatLength));
setLength(chatLengthValue);
const chatPrompts = document.querySelectorAll('[data-chat-prompt]');
const chatSignInButton = chatLocked.querySelector('[data-open-signup]');

function setChatAccess(signedIn) {
  chatSignedIn = signedIn;
  chatLocked.hidden = signedIn;
  chatForm.hidden = !signedIn;
}

// Minimal SSE reader for a fetch response: yields { event, data } per message.
const BOUNDARY = String.fromCharCode(10, 10);
async function* readEvents(response) {
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
      buffer = buffer.slice(boundary + 2);
      const event = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.+)$/m.exec(block)?.[1];
      if (event && data) yield { event, data: JSON.parse(data) };
    }
  }
}

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
  if (role === 'assistant' && content) addAnswerActions(article, content, context);
  chatTranscript.append(article);
  scrollChatToEnd();
  return article;
}

function contextLabel(context) {
  const scope = `${context.scope === 'personal' ? 'Личный' : 'Общий'} расчёт · ${context.card}`;
  return context.subject ? `${context.subject.label} · ${scope}` : scope;
}

function addAnswerActions(article, content, context) {
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
    source.textContent = contextLabel(context);
    actions.append(source);
  }
  article.append(actions);
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
  if (chatAbort || !chatSignedIn) return;
  const text = message.trim();
  if (!text || text.length > 600) return;
  const request = ++chatRequest;
  if (!existingUserMessage) chatMessage('user', text);
  chatInput.value = '';
  const thinking = thinkingMessage();
  const controller = new AbortController();
  chatAbort = controller;
  chatStop.hidden = false;
  chatStatus.textContent = '';
  chatSlowTimer = window.setTimeout(() => { if (request === chatRequest) chatStatus.textContent = 'Модель отвечает дольше обычного…'; }, 2500);
  updateChatSend();
  let answer = null;
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ message: text, history: chatHistory.slice(-6), draw: window.chatDrawPosition(), length: selectedLength(),
        profileId: window.chatSelectedProfileId?.() ?? null }),
      signal: controller.signal,
    });
    // Errors that happen before the answer starts (limits, sign-in, busy) come back as plain JSON.
    if (!(response.headers.get('content-type') || '').includes('text/event-stream')) {
      const data = await response.json();
      if (response.status === 401) setChatAccess(false);
      throw new Error(data.message || 'Ответ сейчас недоступен.');
    }
    let final = null;
    for await (const { event, data } of readEvents(response)) {
      if (request !== chatRequest) return;
      if (event === 'delta') {
        if (!answer) {
          thinking.remove();
          clearTimeout(chatSlowTimer);
          chatStatus.textContent = '';
          answer = chatMessage('assistant', '');
          answer.classList.add('is-streaming');
        }
        answer.querySelector('p').textContent += data.text;
        scrollChatToEnd();
      } else if (event === 'done') final = data;
      else if (event === 'error') throw new Error(data.message || 'Не удалось получить ответ.');
    }
    if (!final) throw new Error('Ответ прервался. Попробуйте ещё раз.');
    thinking.remove();
    answer ??= chatMessage('assistant', '');
    // The final text wins: if the safety check replaced the reply, the visitor sees the replacement.
    answer.querySelector('p').textContent = final.answer;
    answer.classList.remove('is-streaming');
    addAnswerActions(answer, final.answer, final.context);
    scrollChatToEnd();
    chatHistory.push({ role: 'user', content: text }, { role: 'assistant', content: final.answer, signature: final.signature });
    chatHistory = chatHistory.slice(-6);
    chatStatus.textContent = '';
  } catch (error) {
    if (request !== chatRequest) return;
    thinking.remove();
    answer?.classList.remove('is-streaming');
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
  for (const group of chatEmpty.querySelectorAll('details[open]')) group.open = false;
  chatInput.value = '';
  chatStatus.textContent = '';
  chatStop.hidden = true;
  updateChatSend();
  if (focus) chatInput.focus();
}
chatClear.addEventListener('click', () => clearChat());
document.addEventListener('anna-account-changed', () => clearChat(false));
document.addEventListener('anna-account-state', (event) => setChatAccess(event.detail.signedIn));
setChatAccess(document.body.dataset.signedIn === 'true');
for (const button of chatPrompts) {
  // A guest who picks a question is taken straight to sign-in instead of a dead button.
  button.addEventListener('click', () => (chatSignedIn ? sendChat(button.dataset.chatPrompt) : chatSignInButton.click()));
}
updateChatSend();
