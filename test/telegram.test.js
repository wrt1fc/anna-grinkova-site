import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from '../server/http.js';
import { createStore } from '../server/store.js';
import { createTrafficLimiter } from '../server/traffic.js';
import { verifyInitData } from '../server/telegram/init-data.js';
import { createTelegramBot } from '../server/telegram/bot.js';
import { BRAND, COMMANDS } from '../server/telegram/branding.js';

const TOKEN = '123456:test-token';
const SECRET = 'webhook-secret_1';
const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);

// A signed `initData` string built the way Telegram builds it.
function initData({ token = TOKEN, authDate = NOW / 1000, user = { id: 777, first_name: 'Анна', username: 'anna_test' } } = {}) {
  const params = new URLSearchParams({ auth_date: String(authDate), query_id: 'AAH', user: JSON.stringify(user) });
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}

test('verifyInitData: accepts data signed with the bot token', () => {
  const user = verifyInitData(initData(), TOKEN, { now: NOW });
  assert.deepEqual(user, { id: 777, firstName: 'Анна', username: 'anna_test', languageCode: null });
});

test('verifyInitData: rejects a wrong token, a changed field, stale and malformed data', () => {
  assert.equal(verifyInitData(initData(), 'other:token', { now: NOW }), null);
  assert.equal(verifyInitData(initData().replace('anna_test', 'someone'), TOKEN, { now: NOW }), null);
  assert.equal(verifyInitData(initData({ authDate: NOW / 1000 - 3 * 24 * 3600 }), TOKEN, { now: NOW }), null);
  assert.equal(verifyInitData(initData({ authDate: NOW / 1000 + 3600 }), TOKEN, { now: NOW }), null);
  assert.equal(verifyInitData('', TOKEN, { now: NOW }), null);
  assert.equal(verifyInitData('hash=zz', TOKEN, { now: NOW }), null);
  assert.equal(verifyInitData(undefined, TOKEN, { now: NOW }), null);
  assert.equal(verifyInitData(initData(), '', { now: NOW }), null);
});

function fakeApi() {
  const calls = [];
  const fetchImpl = async (url, { body }) => {
    calls.push({ method: url.split('/').pop(), payload: JSON.parse(body) });
    return { ok: true, json: async () => ({ ok: true, result: true }) };
  };
  return { calls, fetchImpl };
}

test('bot: /start and /help answer with the button that opens the app', async () => {
  const { calls, fetchImpl } = fakeApi();
  const bot = createTelegramBot({ token: TOKEN, publicUrl: 'https://anna.example', fetchImpl });
  assert.equal(await bot.handleUpdate({ message: { chat: { id: 5 }, text: '/start' } }), 'start');
  assert.equal(await bot.handleUpdate({ message: { chat: { id: 5 }, text: '/help@anna_bot' } }), 'help');
  assert.equal(await bot.handleUpdate({ message: { chat: { id: 5 }, text: 'привет' } }), 'start');
  assert.equal(await bot.handleUpdate({ edited_message: {} }), 'ignored');
  assert.equal(calls.length, 3);
  assert.equal(calls[0].method, 'sendMessage');
  assert.equal(calls[0].payload.chat_id, 5);
  assert.equal(calls[0].payload.reply_markup.inline_keyboard[0][0].web_app.url, 'https://anna.example');
  assert.doesNotMatch(JSON.stringify(calls), /(?<![а-яё])ИИ(?![а-яё])|нейросет/);
});

test('bot: configure sets the webhook, the menu button and the commands; no token = no bot', async () => {
  const { calls, fetchImpl } = fakeApi();
  const bot = createTelegramBot({ token: TOKEN, publicUrl: 'https://anna.example', fetchImpl });
  await bot.configure({ webhookUrl: 'https://anna.example/api/telegram/webhook', secret: SECRET });
  assert.deepEqual(calls.map((call) => call.method), ['setWebhook', 'setChatMenuButton', 'setMyCommands', 'setMyName', 'setMyDescription', 'setMyShortDescription']);
  assert.equal(calls[0].payload.secret_token, SECRET);
  assert.equal(createTelegramBot({ token: null, publicUrl: 'https://anna.example' }), null);
});

test('branding fits Telegram limits and each shortcut opens the matching app screen without a network call', () => {
  assert.ok(BRAND.name.length <= 64);
  assert.ok(BRAND.description.length <= 512);
  assert.ok(BRAND.shortDescription.length <= 120);
  const bot = createTelegramBot({ token: TOKEN, publicUrl: 'https://anna.example/', fetchImpl: () => { throw new Error('must not call API'); } });
  for (const command of COMMANDS) {
    assert.ok(command.description.length <= 256);
    const reply = bot.webhookReply({ message: { chat: { id: 9, type: 'private' }, text: `/${command.command}` } });
    assert.equal(reply.method, 'sendMessage');
    const url = reply.reply_markup.inline_keyboard[0][0].web_app.url;
    assert.equal(url, ['help', 'start'].includes(command.command) ? 'https://anna.example/' : `https://anna.example/#/${command.command}`);
  }
  assert.equal(bot.webhookReply({ message: { chat: { id: 9, type: 'group' }, text: '/start' } }), null);
});

test('profile avatar uses an actual multipart upload', async () => {
  let photo;
  const bot = createTelegramBot({ token: TOKEN, publicUrl: 'https://anna.example', fetchImpl: async (url, options) => {
    if (url.endsWith('/setMyProfilePhoto')) photo = options.body;
    return { ok: true, json: async () => ({ ok: true, result: true }) };
  } });
  await bot.configure({ webhookUrl: 'https://anna.example/api/telegram/webhook', secret: SECRET, profilePhoto: Buffer.from('test-photo') });
  assert.ok(photo instanceof FormData);
  assert.deepEqual(JSON.parse(photo.get('photo')), { type: 'static', photo: 'attach://avatar' });
  assert.equal(await photo.get('avatar').text(), 'test-photo');
});

async function fixture(run, { enabled = true } = {}) {
  const store = await createStore('pglite:memory');
  const { calls, fetchImpl } = fakeApi();
  const bot = enabled ? createTelegramBot({ token: TOKEN, publicUrl: 'https://anna.example', fetchImpl }) : null;
  const server = createServer({ store, telegramBot: bot, telegramBotToken: enabled ? TOKEN : null, telegramWebhookSecret: enabled ? SECRET : null,
    publicUrl: 'https://anna.example', codeSecret: 'test-secret-with-at-least-thirty-two-characters',
    trafficLimiter: createTrafficLimiter({ perIpLimit: 500, globalLimit: 1000 }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers = {}) => fetch(`${base}${path}`, { method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers } });
  try { await run({ post, calls }); }
  finally { await new Promise((resolve) => server.close(resolve)); await store.close(); }
}

test('webhook: needs the secret header, answers 200 and replies to /start', async () => {
  await fixture(async ({ post, calls }) => {
    const update = { message: { chat: { id: 9 }, text: '/start' } };
    assert.equal((await post('/api/telegram/webhook', update)).status, 403);
    assert.equal((await post('/api/telegram/webhook', update, { 'X-Telegram-Bot-Api-Secret-Token': 'wrong' })).status, 403);
    assert.equal(calls.length, 0);
    const response = await post('/api/telegram/webhook', update, { 'X-Telegram-Bot-Api-Secret-Token': SECRET });
    assert.equal(response.status, 200);
    const reply = await response.json();
    assert.equal(reply.method, 'sendMessage');
    assert.equal(reply.chat_id, 9);
    assert.match(reply.text, /Я Фортуна/);
    assert.equal(calls.length, 0, 'webhook replies do not depend on outbound Telegram access');
  });
});

test('verify: valid initData returns the Telegram user, a forged one gets 401', async () => {
  await fixture(async ({ post }) => {
    const ok = await post('/api/telegram/verify', { initData: initData({ authDate: Math.floor(Date.now() / 1000) }) });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).telegramUser.id, 777);
    assert.equal((await post('/api/telegram/verify', { initData: 'hash=' + 'a'.repeat(64) })).status, 401);
    assert.equal((await post('/api/telegram/verify', {})).status, 401);
  });
});

test('without a token the Telegram routes are off', async () => {
  await fixture(async ({ post }) => {
    assert.equal((await post('/api/telegram/webhook', {})).status, 404);
    assert.equal((await post('/api/telegram/verify', {})).status, 404);
  }, { enabled: false });
});
