import { forecastForDate, moscowDate } from '../daily-forecast.js';
import { personalForecastForDate } from '../personal-forecast.js';
import { ANSWER_LENGTHS, DEFAULT_ANSWER_LENGTH, MAX_ANSWER_CHARS, chatForecastContext, forecastForQuestion } from '../local-chat.js';
import { SAFE_FALLBACK_ANSWER, unsafeChatAnswer } from '../chat-safety.js';
import { planFor } from '../plans.js';
import { CRISIS_ANSWER, isCrisisMessage } from '../crisis.js';
import { profilesWithAccess } from './profiles.js';

const MAX_MESSAGE_CHARS = 600;
// Seeds the personal tarot card for a partner/family profile apart from any account id.
const PROFILE_SEED_OFFSET = 1_000_000_000;
const MAX_HISTORY_ITEMS = 6;
// Detailed answers come back in the signed history, so chat bodies may be larger than other requests.
const MAX_CHAT_BODY_CHARS = 48_000;
// Keeps history from pushing the rules and facts out of the model's context window.
const MAX_HISTORY_CHARS = 6000;
// Text held back from the stream until it has passed the safety check, so a blocked phrase is never shown.
const STREAM_HOLDBACK_CHARS = 40;

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

// The owner's own chart, or a partner/family profile the plan currently allows.
function chartFor(store, user, profileId) {
  if (profileId == null) return { profile: store.getBirthProfile(user.id), subject: null, profileId: null };
  const profile = profilesWithAccess(store, user.id).find((item) => item.id === profileId);
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

export function createChatRoutes({ store, chatWriter, chatLimiter, chatGate, historySigner, metrics, knowledge = null }) {
  // One answer at a time per account, so a single user cannot hold every model slot.
  const answering = new Set();

  async function postChat({ req, res, user, json, readJson }) {
    if (!chatWriter) return json(res, 503, { error: 'chat_unavailable', message: 'Чат пока недоступен. Попробуйте позже.' });
    if (!user) return json(res, 401, { error: 'login_required', message: 'Чат доступен после входа в личный кабинет.' });
    const body = await readJson(req, MAX_CHAT_BODY_CHARS);
    if (invalidChatBody(body)) return json(res, 400, { error: 'invalid_chat_message', message: 'Проверьте текст сообщения.' });
    if (isCrisisMessage(body.message)) { metrics.count('chat_crisis'); return replyCrisis(req, res, json); }
    if (answering.has(user.id)) return json(res, 429, { error: 'chat_in_progress', message: 'Дождитесь ответа на предыдущий вопрос.' });
    // Counted only after validation, so malformed requests cannot use up the shared budget.
    const limit = chatLimiter.check(`user:${user.id}`);
    if (!limit.allowed) {
      metrics.count('chat_rate_limited');
      return json(res, 429, { error: 'chat_rate_limited', message: 'Слишком много сообщений. Попробуйте через минуту.' },
        { 'Retry-After': String(limit.retryAfter) });
    }
    const chart = chartFor(store, user, body.profileId ?? null);
    if (chart.error) return json(res, ...chart.error);

    const releaseGate = chatGate.tryAcquire();
    if (!releaseGate) {
      metrics.count('chat_busy');
      return json(res, 503, { error: 'chat_busy', message: 'Помощник сейчас отвечает другим посетителям. Попробуйте через минуту.' },
        { 'Retry-After': '20' });
    }
    answering.add(user.id);
    const release = () => { answering.delete(user.id); releaseGate(); };
    const day = moscowDate();
    const quotaKind = `chat:${user.id}`;
    const plan = planFor(store.getPlan(user.id));
    if (!store.consumeDailyQuota(quotaKind, day, plan.dailyChatMessages)) {
      release();
      metrics.count('chat_daily_limit');
      return json(res, 429, { error: 'chat_daily_limit', message: `Сообщения на сегодня по тарифу «${plan.label}» закончились. Возвращайтесь завтра.` });
    }

    const message = body.message.trim();
    const draw = body.draw ?? 0;
    const general = forecastForDate(day, draw);
    const forecast = chart.profile?.birthUtc
      ? personalForecastForDate(day, chart.profile, chart.profileId ? PROFILE_SEED_OFFSET + chart.profileId : user.id, general, draw)
      : general;
    const context = chatForecastContext(forecast, chart.subject);
    // Only the text goes to the model; file names and scores stay on the server.
    const materials = (knowledge?.search(message) ?? []).map(({ text }) => ({ text }));
    const streaming = String(req.headers.accept ?? '').includes('text/event-stream');
    const send = streaming ? sse(res) : null;
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
      if (send && safeUpTo > sent) { send('delta', { text: full.slice(sent, safeUpTo) }); sent = safeUpTo; }
    };
    const finish = (answer, filtered, extra = {}) => {
      metrics.count('chat_messages');
      if (filtered) metrics.count('chat_filtered');
      metrics.timing('chat_answer', performance.now() - started);
      store.appendChatMessages(user.id, chart.profileId, [{ role: 'user', content: message }, { role: 'assistant', content: answer }]);
      const payload = { ...extra, answer, filtered, signature: historySigner.sign(answer),
        context: { date: day, scope: context.scope, card: context.card.name, subject: chart.subject } };
      return streaming ? (send('done', payload), res.end()) : json(res, 200, payload);
    };
    try {
      const reply = await chatWriter.answer({ message, history: historySigner.trusted(body.history ?? []), forecast: forecastForQuestion(context, message),
        visitorName: user.displayName || null,
        length: body.length ?? DEFAULT_ANSWER_LENGTH, materials, signal: abort.signal, onDelta });
      const filtered = unsafeChatAnswer(reply.answer, day);
      if (filtered) console.warn('Chat answer rejected by safety check');
      return finish(filtered ? SAFE_FALLBACK_ANSWER : reply.answer, filtered, reply);
    } catch (error) {
      if (unsafe) {
        console.warn('Chat answer stopped mid-stream by safety check');
        try { return finish(SAFE_FALLBACK_ANSWER, true); }
        catch (finishError) {
          console.error('Chat fallback failed:', finishError.message);
          return streaming ? res.end() : json(res, 500, { error: 'internal_error' });
        }
      }
      // No answer was delivered, so the message does not count against the plan.
      store.refundDailyQuota(quotaKind, day);
      if (abort.signal.aborted) return undefined;
      metrics.count('chat_errors');
      console.warn('Local chat failed:', error.message);
      const failure = { error: 'chat_unavailable', message: 'Сейчас не удалось получить ответ. Попробуйте ещё раз.' };
      return streaming ? (send('error', failure), res.end()) : json(res, 503, failure);
    } finally {
      res.off('close', onClose);
      release();
    }
  }

  return async function handleChatRoutes(ctx) {
    const { req, res, path, user, json, readJson } = ctx;
    if (path === '/api/chat' && req.method === 'POST') return await postChat(ctx), true;
    if (!path.startsWith('/api/chat/')) return false;
    if (!user) return json(res, 401, { error: 'login_required' }), true;
    if (path === '/api/chat/history' && req.method === 'GET') {
      const consent = store.chatConsent(user.id) != null;
      return json(res, 200, { consent, messages: consent ? store.listChatMessages(user.id) : [] }), true;
    }
    if (path === '/api/chat/history' && req.method === 'DELETE') {
      store.deleteChatMessages(user.id);
      return json(res, 200, { ok: true }), true;
    }
    if (path === '/api/chat/consent' && req.method === 'PUT') {
      const body = await readJson(req);
      if (typeof body.consent !== 'boolean') return json(res, 400, { error: 'invalid_consent' }), true;
      store.setChatConsent(user.id, body.consent);
      return json(res, 200, { consent: body.consent }), true;
    }
    return false;
  };
}
