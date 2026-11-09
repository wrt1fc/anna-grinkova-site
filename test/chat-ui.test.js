import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

function harness() {
  const elements = new Map();
  function element() {
    return { hidden: false, disabled: false, value: '', textContent: '', children: [], style: {}, scrollHeight: 20,
      classList: { add() {}, remove() {} }, handlers: {},
      setAttribute() {}, addEventListener(name, fn) { this.handlers[name] = fn; },
      append(...items) { for (const item of items) item.parent = this; this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
      querySelectorAll() { return this.children.filter((item) => item.className?.startsWith('msg ')); },
      remove() { if (this.parent) this.parent.children = this.parent.children.filter((item) => item !== this); },
      focus() {}, scrollIntoView() {}, closest() { return this.parent ?? this; } };
  }
  const $ = (selector) => { if (!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); };
  const requests = [], storage = new Map();
  const app = { me: { user: { id: 1 } }, go() {} };
  const context = vm.createContext({ $, app, node: (_tag, _cls, text = '') => Object.assign(element(), { textContent: text, className: _cls }),
    api: (path, options) => new Promise((resolve, reject) => requests.push({ path, options, resolve, reject })),
    readEvents: async function* () {}, planLine: () => '', visitorName: () => 'Я',
    bindIdeas() {}, refreshIdeas() {}, resetIdeas() {}, setIdeasBusy() {}, activeIdeaDraw: () => null,
    closeSheet() {}, openSheet: (_title, body) => { context.sheet = body; },
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    AbortController, Intl, Date, fetch: async () => { throw new Error('network'); },
  });
  const source = readFileSync(new URL('../prototype/miniapp/screens-chat.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  vm.runInContext(source + '\n globalThis.chat = { enterChat, resetChat, loadSaved, consentSheet, send, bindChat, peopleSheet };', context);
  return { ...context, context, $, requests, storage, app };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('late saved history cannot replace a message just sent', async () => {
  const h = harness();
  const load = h.chat.loadSaved();
  await h.chat.send('Как выбрать работу?');
  const rows = h.$('#transcript').children.length;
  h.requests.find((r) => r.path.startsWith('/api/chat/history')).resolve({ ok: true, data: { consent: true, messages: [{ role: 'user', content: 'старое' }] } });
  await load;
  assert.equal(h.$('#transcript').children.length, rows);
});

test('account transition ignores late saved history and errors are visible', async () => {
  const h = harness();
  const load = h.chat.loadSaved();
  h.app.me = { user: { id: 2 } };
  h.requests[0].resolve({ ok: true, data: { consent: true, messages: [{ role: 'user', content: 'чужое' }] } });
  await load;
  assert.equal(h.$('#transcript').children.length, 0);
  const again = h.chat.loadSaved();
  h.requests[1].reject(new Error('network'));
  await again;
  assert.match(h.$('#chat-history-status').textContent, /не удалось/i);
});

test('consent failure is visible and does not mark prompt answered on device', async () => {
  const h = harness();
  h.chat.consentSheet();
  const keep = h.context.sheet.children.find((n) => n.textContent === 'Сохранять переписку');
  const pending = keep.handlers.click();
  assert.equal(h.storage.size, 0);
  h.requests[0].resolve({ ok: false, data: {} });
  await pending;
  assert.equal(h.storage.size, 0);
  assert.match(h.$('#chat-history-status').textContent, /не удалось/i);
});

test('history setting is saved on server before account scoped prompt marker', async () => {
  const h = harness();
  h.chat.consentSheet();
  const keep = h.context.sheet.children.find((n) => n.textContent === 'Сохранять переписку');
  const pending = keep.handlers.click();
  h.requests[0].resolve({ ok: true, data: { consent: true } });
  await tick();
  assert.equal(h.storage.get('fortuna-chat-consent-asked:1'), '1');
  if (h.requests[1]) h.requests[1].resolve({ ok: true, data: { consent: true, messages: [] } });
  await pending;
});


test('profile change requests its own history and ignores an earlier response', async () => {
  const h = harness();
  const initial = h.chat.loadSaved();
  const people = h.chat.peopleSheet();
  h.requests.find((r) => r.path === '/api/profiles').resolve({ ok: true, data: { profiles: [{ id: 3, label: 'Близкий' }] } });
  await people;
  h.context.sheet.children[1].handlers.click();
  assert.ok(h.requests.some((r) => r.path === '/api/chat/history?profileId=3'));
  h.requests[0].resolve({ ok: true, data: { consent: true, messages: [{ role: 'user', content: 'своя история' }] } });
  await initial;
  assert.equal(h.$('#transcript').children.length, 0);
});

test('late profiles request does not open a sheet after account reset', async () => {
  const h = harness();
  const pending = h.chat.peopleSheet();
  h.app.me = null; h.chat.resetChat();
  h.requests[0].resolve({ ok: true, data: { profiles: [{ id: 3, label: 'Чужой' }] } });
  await pending;
  assert.equal(h.context.sheet, undefined);
});

test('save failure remains visible while successful reply is retained', async () => {
  const h = harness();
  h.context.fetch = async () => ({ headers: { get: () => 'text/event-stream' } });
  h.context.readEvents = async function* () { yield { event: 'done', data: { answer: 'Ответ', historySaved: false } }; };
  await h.chat.send('Как выбрать работу?');
  assert.match(h.$('#chat-history-status').textContent, /не удалось сохранить/i);
  const rows = h.$('#transcript').children;
  assert.equal(rows[1].children[1].textContent, 'Ответ');
});

test('withdrawal requires confirmation, cancel makes no request, confirm deletes displayed history', async () => {
  const h = harness(); h.chat.bindChat();
  const load = h.chat.loadSaved();
  h.requests[0].resolve({ ok: true, data: { consent: true, messages: [{ role: 'user', content: 'Сохранено' }] } });
  await load;
  h.$('#chat-history-toggle').handlers.click();
  assert.match(h.context.sheet.children[0].textContent, /удалить всю сохранённую переписку, включая близких/i);
  assert.equal(h.requests.length, 1);
  h.context.sheet.children.find((n) => n.textContent === 'Отмена').handlers.click();
  assert.equal(h.requests.length, 1);
  assert.equal(h.$('#transcript').children.length, 1);
  h.$('#chat-history-toggle').handlers.click();
  const confirm = h.context.sheet.children.find((n) => n.textContent === 'Выключить и удалить историю');
  const pending = confirm.handlers.click();
  assert.deepEqual(JSON.parse(JSON.stringify(h.requests[1].options.body)), { consent: false });
  h.requests[1].resolve({ ok: true, data: { consent: false } }); await pending;
  assert.match(h.$('#chat-history-toggle').textContent, /Включить/);
  assert.match(h.$('#chat-history-status').textContent, /вся сохранённая история удалена/i);
  assert.equal(h.$('#transcript').children.length, 0);
  assert.equal(h.$('#transcript').hidden, true);
});

test('delete failure does not clear displayed history', async () => {
  const h = harness(); h.chat.bindChat();
  const load = h.chat.loadSaved();
  h.requests[0].resolve({ ok: true, data: { consent: true, messages: [{ role: 'user', content: 'Сохранено' }] } });
  await load;
  h.$('#chat-history-delete').handlers.click();
  const remove = h.context.sheet.children.find((n) => n.textContent === 'Удалить всю историю');
  const pending = remove.handlers.click();
  assert.equal(h.requests[1].options.method, 'DELETE');
  h.requests[1].resolve({ ok: false, data: {} }); await pending;
  assert.equal(h.$('#transcript').children.length, 1);
  assert.match(h.$('#chat-history-status').textContent, /не удалось удалить/i);
});

test('a final event received before logout cannot update the next account after stream closes', async () => {
  const h = harness(); let finish;
  h.context.fetch = async () => ({ headers: { get: () => 'text/event-stream' } });
  h.context.readEvents = async function* () {
    yield { event: 'done', data: { answer: 'Чужой ответ', historySaved: false } };
    await new Promise((resolve) => { finish = resolve; });
  };
  const pending = h.chat.send('Вопрос'); await tick();
  h.app.me = { user: { id: 2 } }; h.chat.resetChat();
  finish(); await pending;
  assert.equal(h.$('#chat-history-status').textContent, '');
});


test('explicit refresh restores saved history after failed initial load and a sent message, with confirmation', async () => {
  const h = harness(); h.chat.bindChat();
  const initial = h.chat.loadSaved();
  h.requests[0].reject(new Error('network')); await initial;
  h.context.fetch = async () => ({ headers: { get: () => 'text/event-stream' } });
  h.context.readEvents = async function* () { yield { event: 'done', data: { answer: 'Новый ответ' } }; };
  await h.chat.send('Новый вопрос');
  h.$('#chat-history-retry').handlers.click();
  const confirm = h.context.sheet.children.find((n) => n.textContent === 'Загрузить сохранённую историю');
  assert.match(h.context.sheet.children[0].textContent, /несохранённые сообщения/i);
  assert.equal(h.requests.filter((r) => r.path.startsWith('/api/chat/history')).length, 1);
  const refreshed = confirm.handlers.click();
  h.requests.findLast((r) => r.path.startsWith('/api/chat/history')).resolve({ ok: true, data: { consent: true,
    messages: [{ role: 'user', content: 'Старый вопрос' }, { role: 'assistant', content: 'Старый ответ' }] } });
  await refreshed;
  assert.equal(h.$('#transcript').children.length, 2);
  assert.equal(h.$('#transcript').children[0].children[0].textContent, 'Старый вопрос');
});

test('new send after an explicit refresh request prevents replacement by its late response', async () => {
  const h = harness(); h.chat.bindChat();
  h.context.fetch = async () => ({ headers: { get: () => 'text/event-stream' } });
  h.context.readEvents = async function* () { yield { event: 'done', data: { answer: 'Ответ' } }; };
  await h.chat.send('Первый вопрос');
  h.$('#chat-history-retry').handlers.click();
  const refreshed = h.context.sheet.children.find((n) => n.textContent === 'Загрузить сохранённую историю').handlers.click();
  await h.chat.send('Вопрос во время загрузки');
  const rows = h.$('#transcript').children.length;
  h.requests.findLast((r) => r.path.startsWith('/api/chat/history')).resolve({ ok: true, data: { consent: true,
    messages: [{ role: 'user', content: 'Старое' }] } });
  await refreshed;
  assert.equal(h.$('#transcript').children.length, rows);
  assert.equal(h.$('#transcript').children[2].children[0].textContent, 'Вопрос во время загрузки');
});


function ideasHarness(owner = null) {
  const elements = new Map();
  const makeNode = (_tag, _cls, textContent = '') => ({ textContent, children: [], handlers: {}, attributes: {}, dataset: {},
    addEventListener(name, fn) { this.handlers[name] = fn; },
    setAttribute(name, value) { this.attributes[name] = value; },
    append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
    querySelectorAll() { return [...tabs, ...$('#chat-question-list').children]; },
  });
  const $ = (selector) => { if (!elements.has(selector)) elements.set(selector, makeNode()); return elements.get(selector); };
  const tabs = ['work', 'money', 'relationships'].map((questionTopic) => Object.assign(makeNode(), { dataset: { questionTopic } }));
  const context = vm.createContext({ $, app: {}, node: makeNode, savedPosition: () => null,
    document: { querySelectorAll: () => tabs, addEventListener() {} },
    closeSheet() {}, openSheet() {}, AbortController, performance, setTimeout, clearTimeout,
    api: async () => { throw new Error('network'); },
  });
  const source = readFileSync(new URL('../prototype/miniapp/chat-ideas.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  vm.runInContext(source + '\n globalThis.ideas = { bindIdeas, refreshIdeas };', context);
  const selected = [];
  context.ideas.bindIdeas(() => ({ owner, profileId: null }), (question) => selected.push(question));
  return { $, tabs, selected, ideas: context.ideas };
}

for (const [label, owner] of [['guest', null], ['failed API', 1]]) test(`${label} ideas tabs show matching fallback questions`, async () => {
  const h = ideasHarness(owner); await h.ideas.refreshIdeas();
  for (const [topic, firstQuestion] of [
    ['money', 'Какой подход к деньгам мне ближе?'], ['relationships', 'Что для меня важно в отношениях?'],
  ]) {
    const tab = h.tabs.find((item) => item.dataset.questionTopic === topic);
    tab.handlers.click();
    assert.equal(tab.attributes['aria-pressed'], 'true');
    assert.equal(h.tabs.filter((item) => item.attributes['aria-pressed'] === 'true').length, 1);
    const questions = h.$('#chat-question-list').children;
    assert.equal(questions.length, 3);
    assert.equal(questions[0].textContent, firstQuestion);
    questions[0].handlers.click();
    assert.equal(h.selected.at(-1), firstQuestion);
  }
});
