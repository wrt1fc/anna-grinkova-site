import { forecastForDate, moscowDate, tarotForDate } from '../daily-forecast.js';
import { personalForecastForDate } from '../personal-forecast.js';
import { ANSWER_LENGTHS, DEFAULT_ANSWER_LENGTH, MAX_ANSWER_CHARS, TAROT_MODE, TAROT_QUESTION_MAX_CHARS,
  chatForecastContext, forecastForQuestion, tarotReadingContext } from '../local-chat.js';
import { SAFE_FALLBACK_ANSWER, unsafeChatAnswer } from '../chat-safety.js';
import { planFor } from '../plans.js';
import { CRISIS_ANSWER, isCrisisMessage } from '../crisis.js';
import { profilesWithAccess } from './profiles.js';
import { chartContext, findMaterials } from '../chat-grounding.js';
import { clientAddress } from '../traffic.js';
import { fallbackReading, wrongCard } from '../tarot-guard.js';

const MAX_MESSAGE_CHARS = 600;
// Seeds the personal tarot card for a partner/family profile apart from any account id.
const PROFILE_SEED_OFFSET = 1_000_000_000;
const MAX_HISTORY_ITEMS = 6;
// Detailed answers come back in the signed history, so chat bodies may be larger than other requests.
// In bytes, matching nginx client_max_body_size 64k (Cyrillic takes two bytes per letter).
const MAX_CHAT_BODY_BYTES = 64_000;
// Keeps history from pushing the rules and facts out of the model's context window.
const MAX_HISTORY_CHARS = 6000;
// Text held back from the stream until it has passed the safety check, so a blocked phrase is never shown.
const STREAM_HOLDBACK_CHARS = 40;
// A comment line keeps a quiet stream alive behind Nginx (proxy_read_timeout 60 s for /api/): a reading is sent only
// at the end and may take two model runs.
const STREAM_KEEPALIVE_MS = 15_000;

function invalidChatBody(body) {
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const history = body.history ?? [];
  const draw = body.draw ?? 0;
  return !message || message.length > MAX_MESSAGE_CHARS || !Array.isArray(history) || history.length > MAX_HISTORY_ITEMS
    || history.some((item) => !item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string'
      || !item.content.trim() || item.content.length > (item.role === 'user' ? MAX_MESSAGE_CHARS : MAX_ANSWER_CHARS)
      || (item.signature !== undefined && typeof item.signature !== 'string'))
    || history.reduce((sum, item) => sum + (typeof item?.content === 'string' ? item.content.length : 0), 0) > MAX_HISTORY_CHARS
    || !Number.isInteger(draw) || draw < 0 || draw > 4
    || (body.length !== undefined && !Object.hasOwn(ANSWER_LENGTHS, body.length))
    || (body.profileId !== undefined && body.profileId !== null && !(Number.isSafeInteger(body.profileId) && body.profileId > 0));
}

// A reading is one question and the number of one of the five cards (0–4) the account was shown.
function invalidTarotBody(body) {
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  return !question || question.length > TAROT_QUESTION_MAX_CHARS || !Number.isInteger(body.draw) || body.draw < 0 || body.draw > 4;
}

// The owner's own chart, or a partner/family profile the plan currently allows.
async function chartFor(store, user, profileId) {
  if (profileId == null) return { profile: await store.getBirthProfile(user.id), subject: null, profileId: null };
  const profile = (await profilesWithAccess(store, user.id)).find((item) => item.id === profileId);
  if (!profile) return { error: [404, { error: 'profile_not_found', message: 'Профиль не найден.' }] };
  if (profile.locked) return { error: [403, { error: 'profile_locked', message: 'Этот профиль недоступен на текущем тарифе.' }] };
  return { profile, subject: { relation: profile.relation, label: profile.label }, profileId: profile.id };
}

function sse(res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
  return (event, data) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
}

// Answered before limits, quotas and the model: a person in crisis must always get the help lines.
function replyCrisis(req, res, json) {
  const payload = { answer: CRISIS_ANSWER, crisis: true, filtered: false, context: null };
  if (!String(req.headers.accept ?? '').includes('text/event-stream')) return json(res, 200, payload);
  sse(res)('done', payload);
  return res.end();
}

export function createChatRoutes({ store, chatWriter, chatLimiter, chatGate, historySigner, metrics, knowledge = null, trustProxy = false,
  keepAliveMs = STREAM_KEEPALIVE_MS }) {
  // One answer at a time per account; one visitor address may hold at most half of the model slots, so a few accounts
  // cannot take them all, while people behind the same mobile-carrier address (CGNAT) still get answers.
  const answering = new Set();
  const answeringIps = new Map();
  const perIpSlots = Math.max(1, Math.floor((chatGate.limit ?? 2) / 2));

  // One pipeline for chat messages and card readings: the same gate, locks, limits, stream and safety checks.
  // A reading differs in its own daily limit, its prompt mode and in leaving no chat history.
  async function postChat({ req, res, user, json, readJson }, tarot = false) {
    const unavailable = tarot
      ? { error: 'tarot_unavailable', message: 'Расклад сейчас недоступен. Попробуйте позже.' }
      : { error: 'chat_unavailable', message: 'Чат пока недоступен. Попробуйте позже.' };
    if (!chatWriter) return json(res, 503, unavailable);
    if (!user) {
      return json(res, 401, { error: 'login_required', message: tarot
        ? 'Расклад с трактовкой доступен после регистрации.' : 'Чат доступен после входа в личный кабинет.' });
    }
    const body = await readJson(req, MAX_CHAT_BODY_BYTES);
    if (tarot ? invalidTarotBody(body) : invalidChatBody(body)) {
      return json(res, 400, tarot ? { error: 'invalid_tarot_reading', message: 'Напишите вопрос (до 300 символов) и выберите карту от 1 до 5.' }
        : { error: 'invalid_chat_message', message: 'Проверьте текст сообщения.' });
    }
    if (tarot) body.message = body.question.trim();
    if (isCrisisMessage(body.message)) { metrics.count('chat_crisis'); return replyCrisis(req, res, json); }
    const ip = clientAddress(req, trustProxy);
    if (answering.has(user.id)) return json(res, 429, { error: 'chat_in_progress', message: 'Дождитесь ответа на предыдущий вопрос.' });
    // Counted only after validation, so malformed requests cannot use up the shared budget.
    const limit = chatLimiter.check(`user:${user.id}`);
    if (!limit.allowed) {
      metrics.count('chat_rate_limited');
      return json(res, 429, { error: 'chat_rate_limited', message: 'Слишком много сообщений. Попробуйте через минуту.' },
        { 'Retry-After': String(limit.retryAfter) });
    }
    // A reading is about the account's own card for the question, so it never reads a natal chart or a profile.
    const chart = tarot ? { profile: null, subject: null, profileId: null } : await chartFor(store, user, body.profileId ?? null);
    if (chart.error) return json(res, ...chart.error);

    // Another person behind the same address sees an ordinary "busy", not someone else's "wait for your answer".
    const releaseGate = (answeringIps.get(ip) ?? 0) < perIpSlots ? chatGate.tryAcquire() : null;
    if (!releaseGate) {
      metrics.count('chat_busy');
      return json(res, 503, { error: 'chat_busy', message: 'Помощник сейчас отвечает другим посетителям. Попробуйте через минуту.' },
        { 'Retry-After': '20' });
    }
    answering.add(user.id);
    answeringIps.set(ip, (answeringIps.get(ip) ?? 0) + 1);
    const release = () => {
      answering.delete(user.id);
      const left = (answeringIps.get(ip) ?? 1) - 1;
      if (left > 0) answeringIps.set(ip, left); else answeringIps.delete(ip);
      releaseGate();
    };
    const day = moscowDate();
    // Readings are counted apart from chat messages: spending one never uses up the other.
    const quotaKind = `${tarot ? 'tarot' : 'chat'}:${user.id}`;
    // A database failure here must still free the slot and the per-user lock, or chat would stay blocked.
    let plan, allowed;
    try {
      plan = planFor(await store.getPlan(user.id));
      allowed = await store.consumeDailyQuota(quotaKind, day, tarot ? plan.dailyTarotReadings : plan.dailyChatMessages);
    } catch (error) { release(); throw error; }
    if (!allowed) {
      release();
      metrics.count(tarot ? 'tarot_daily_limit' : 'chat_daily_limit');
      return json(res, 429, tarot
        ? { error: 'tarot_daily_limit', message: `Расклады на сегодня по тарифу «${plan.label}» закончились. Возвращайтесь завтра.` }
        : { error: 'chat_daily_limit', message: `Сообщения на сегодня по тарифу «${plan.label}» закончились. Возвращайтесь завтра.` });
    }

    const message = body.message.trim();
    const draw = body.draw ?? 0;
    // Any failure while preparing the prompt frees the slot and gives the message back.
    let context, astro, materials, card;
    try {
      if (tarot) {
        // The same function and key that drew the five cards on the page, so the number picks the card the person saw.
        card = tarotForDate(day, user.id, draw);
        context = tarotReadingContext(day, card);
        astro = { chart: null };
        materials = [];
      } else {
        const general = forecastForDate(day, draw, user.id);
        const forecast = chart.profile?.birthUtc
          ? personalForecastForDate(day, chart.profile, chart.profileId ? PROFILE_SEED_OFFSET + chart.profileId : user.id, general, draw)
          : general;
        context = chatForecastContext(forecast, chart.subject);
        astro = chartContext(chart.profile, message);
        // Only the text goes to the model; file names and scores stay on the server.
        materials = findMaterials(knowledge, message, astro.queries);
      }
    } catch (error) {
      release();
      await store.refundDailyQuota(quotaKind, day).catch(() => {});
      throw error;
    }
    const streaming = String(req.headers.accept ?? '').includes('text/event-stream');
    const send = streaming ? sse(res) : null;
    const keepAlive = streaming ? setInterval(() => { if (!res.writableEnded && !res.destroyed) res.write(': keepalive\n\n'); }, keepAliveMs) : null;
    const abort = new AbortController();
    let unsafe = false;
    const onClose = () => { if (!res.writableEnded) abort.abort(); };
    res.on('close', onClose);
    const started = performance.now();
    let firstToken = null;
    let sent = 0;
    const onDelta = (delta, full) => {
      if (firstToken === null) { firstToken = performance.now() - started; metrics.timing('chat_first_token', firstToken); }
      // Checked on every chunk, so a reply that turns unsafe is stopped and replaced mid-stream.
      if (unsafeChatAnswer(full, day)) { unsafe = true; abort.abort(); return; }
      const safeUpTo = full.length - STREAM_HOLDBACK_CHARS;
      // A reading is sent whole after it has been checked against the drawn card, never piece by piece.
      if (send && !tarot && safeUpTo > sent) { send('delta', { text: full.slice(sent, safeUpTo) }); sent = safeUpTo; }
    };
    const finish = async (answer, filtered, extra = {}) => {
      metrics.count(tarot ? 'tarot_readings' : 'chat_messages');
      if (filtered) metrics.count('chat_filtered');
      metrics.timing('chat_answer', performance.now() - started);
      if (tarot) {
        // Questions of a reading are not stored: no history, no signature to continue it as a chat.
        const payload = { answer, filtered, card: { number: card.number, name: card.name, position: draw + 1 } };
        return streaming ? (send('done', payload), res.end()) : json(res, 200, payload);
      }
      // A failed history write must not take the answer away from the visitor.
      try {
        await store.appendChatMessages(user.id, chart.profileId, [{ role: 'user', content: message }, { role: 'assistant', content: answer }]);
      } catch (error) { console.error('Chat history not saved:', error.message); }
      const payload = { ...extra, answer, filtered, signature: historySigner.sign(answer),
        context: { date: day, scope: context.scope, card: context.card.name, subject: chart.subject } };
      return streaming ? (send('done', payload), res.end()) : json(res, 200, payload);
    };
    try {
      const generate = (extra = {}) => chatWriter.answer({ message, history: tarot ? [] : historySigner.trusted(body.history ?? []),
        forecast: tarot ? context : forecastForQuestion(context, message),
        visitorName: user.displayName || null, chart: astro.chart, ...(tarot ? { mode: TAROT_MODE } : {}),
        length: tarot ? 'medium' : body.length ?? DEFAULT_ANSWER_LENGTH, materials, signal: abort.signal, onDelta, ...extra });
      let reply = await generate();
      if (tarot && wrongCard(reply.answer, card)) {
        // The model wrote about another card: one more try, then a calculated reading of the card the person was shown.
        metrics.count('tarot_wrong_card');
        try { reply = await generate({ temperature: 0.4 }); }
        catch (error) { if (abort.signal.aborted) throw error; reply = { answer: '' }; }
        if (wrongCard(reply.answer, card)) { metrics.count('tarot_calculated'); reply = { answer: fallbackReading(card) }; }
      }
      const filtered = unsafeChatAnswer(reply.answer, day);
      if (filtered) console.warn('Chat answer rejected by safety check');
      return await finish(filtered ? SAFE_FALLBACK_ANSWER : reply.answer, filtered, reply);
    } catch (error) {
      if (unsafe) {
        console.warn('Chat answer stopped mid-stream by safety check');
        try { return await finish(SAFE_FALLBACK_ANSWER, true); }
        catch (finishError) {
          console.error('Chat fallback failed:', finishError.message);
          return streaming ? res.end() : json(res, 500, { error: 'internal_error' });
        }
      }
      // A message counts only when an answer reached the visitor. Leaving after part of the answer was shown keeps it
      // counted: otherwise reading a reply and closing the stream before its end would make the plan limit endless.
      const clientLeftAfterAnswer = abort.signal.aborted && sent > 0;
      if (!clientLeftAfterAnswer) await store.refundDailyQuota(quotaKind, day);
      if (abort.signal.aborted) return undefined;
      metrics.count('chat_errors');
      console.warn(tarot ? 'Tarot reading failed:' : 'Local chat failed:', error.message);
      const failure = { error: tarot ? 'tarot_unavailable' : 'chat_unavailable', message: 'Сейчас не удалось получить ответ. Попробуйте ещё раз.' };
      return streaming ? (send('error', failure), res.end()) : json(res, 503, failure);
    } finally {
      clearInterval(keepAlive);
      res.off('close', onClose);
      release();
    }
  }

  return async function handleChatRoutes(ctx) {
    const { req, res, path, user, json, readJson } = ctx;
    if (path === '/api/chat' && req.method === 'POST') return await postChat(ctx), true;
    if (path === '/api/tarot/reading' && req.method === 'POST') return await postChat(ctx, true), true;
    if (!path.startsWith('/api/chat/')) return false;
    if (!user) return json(res, 401, { error: 'login_required' }), true;
    if (path === '/api/chat/history' && req.method === 'GET') {
      const consent = await store.chatConsent(user.id) != null;
      return json(res, 200, { consent, messages: consent ? await store.listChatMessages(user.id) : [] }), true;
    }
    if (path === '/api/chat/history' && req.method === 'DELETE') {
      await store.deleteChatMessages(user.id);
      return json(res, 200, { ok: true }), true;
    }
    if (path === '/api/chat/consent' && req.method === 'PUT') {
      const body = await readJson(req);
      if (typeof body.consent !== 'boolean') return json(res, 400, { error: 'invalid_consent' }), true;
      await store.setChatConsent(user.id, body.consent);
      return json(res, 200, { consent: body.consent }), true;
    }
    return false;
  };
}
