import { createServer as nodeServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emailCodeHash, hashPassword, newChallenge, newEmailCode, newSessionToken, normalizeEmail, tokenHash, validPassword, verifyLogin } from './auth.js';
import { forecastForDate, moscowDate } from './daily-forecast.js';
import { clientAddress, createTrafficLimiter } from './traffic.js';
import { createLoginGuard } from './login-guard.js';
import { searchCities } from './cities.js';
import { parseBirthInput } from './birth-input.js';
import { personalForecastForDate } from './personal-forecast.js';
import { createConcurrencyGate, createHistorySigner } from './chat-safety.js';
import { createChatRoutes } from './routes/chat.js';
import { handleProfileRoutes } from './routes/profiles.js';
import { createBillingRoutes } from './routes/billing.js';
import { createBilling } from './billing/service.js';
import { NULL_METRICS } from './metrics.js';

const SESSION_AGE = 30 * 24 * 60 * 60;
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data:", "connect-src 'self'",
  "form-action 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'",
].join('; ');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

function json(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}

async function readJson(req, maxChars = 16_384) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('expected_json');
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > maxChars) throw new Error('body_too_large');
  }
  const value = JSON.parse(data || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_json');
  return value;
}

function cookieToken(req) {
  const value = req.headers.cookie?.split(';').map((item) => item.trim()).find((item) => item.startsWith('anna_session='))?.slice(13);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

export function createServer({ store, mailer = null, codeSecret, root = new URL('../prototype/', import.meta.url), secureCookies = false,
  mailDailyLimit = 0, trafficLimiter = createTrafficLimiter(), chatLimiter = createTrafficLimiter({ perIpLimit: 6, globalLimit: 300 }),
  chatGate = createConcurrencyGate(2), loginGuard = createLoginGuard(), trustProxy = false, forecastWriter = null, chatWriter = null,
  sotisVerifier = null, metrics = NULL_METRICS, knowledge = null, paymentProvider = null, publicUrl = 'http://localhost:3000',
  pageViewLimiter = createTrafficLimiter({ perIpLimit: 30, globalLimit: 3000 }) }) {
  if (!codeSecret || String(codeSecret).length < 32) throw new Error('AUTH_CODE_SECRET must have at least 32 characters');
  if (!Number.isSafeInteger(mailDailyLimit) || mailDailyLimit < 0) throw new Error('MAIL_DAILY_LIMIT must be a non-negative integer');
  const rootPath = fileURLToPath(root);
  const historySigner = createHistorySigner(codeSecret);
  const billing = createBilling({ store, provider: paymentProvider, publicUrl });
  const handleBillingRoutes = createBillingRoutes({ store, billing, provider: paymentProvider, trustProxy, metrics });
  const handleChatRoutes = createChatRoutes({ store, chatWriter, chatLimiter, chatGate, historySigner, metrics, knowledge });
  const sessionCookie = (value, maxAge) => `anna_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;
  let dailyCache = null;
  let dailyDrawCacheDay = null;
  const dailyDrawCache = new Map();
  let personalCacheDay = null;
  const personalCache = new Map();
  async function sendCode({ purpose, email, userId = null, passwordHash = null }) {
    if (!mailer || mailDailyLimit === 0) return { status: 503, data: { error: 'mail_unavailable', message: 'Отправка кодов временно недоступна.' } };
    const challenge = newChallenge();
    const code = newEmailCode();
    const challengeHash = tokenHash(challenge);
    const issued = store.issueChallenge({ challengeHash, purpose, email, userId, passwordHash, codeHash: emailCodeHash(codeSecret, challenge, code) });
    if (!issued) return { status: 429, data: { error: 'too_soon', message: 'Новый код можно запросить через минуту.' } };
    if (!store.consumeDailyQuota('mail', new Date().toISOString().slice(0, 10), mailDailyLimit)) {
      store.deleteChallenge(challengeHash);
      return { status: 429, data: { error: 'mail_quota_exceeded', message: 'Лимит писем на сегодня исчерпан. Попробуйте завтра.' } };
    }
    try { await mailer.sendCode({ to: email, purpose, code }); }
    catch (error) {
      store.deleteChallenge(challengeHash);
      console.error('Mail delivery failed:', error.message);
      return { status: 503, data: { error: 'mail_unavailable', message: 'Не удалось отправить код. Попробуйте позже.' } };
    }
    return { status: 202, data: { challenge, message: 'Код отправлен на вашу почту.' } };
  }

  function sessionFor(res, user) {
    const newToken = newSessionToken();
    store.saveSession(tokenHash(newToken), user.id, Date.now() + SESSION_AGE * 1000);
    return { cookie: sessionCookie(newToken, SESSION_AGE), user: { id: user.id, email: user.email, emailVerified: !!user.emailVerified || user.email_verified_at != null } };
  }

  return nodeServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    res.setHeader('X-Frame-Options', 'DENY');
    if (secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const path = url.pathname;
      if (path.startsWith('/api/')) {
        const traffic = trafficLimiter.check(clientAddress(req, trustProxy));
        if (!traffic.allowed) return json(res, 429, { error: 'rate_limited', message: 'Слишком много запросов. Попробуйте позже.' }, { 'Retry-After': String(traffic.retryAfter) });
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers.origin) {
          let originHost = null;
          try { originHost = new URL(req.headers.origin).host; } catch {}
          if (!originHost || originHost !== req.headers.host) return json(res, 403, { error: 'forbidden_origin' });
        }
        metrics.count('api_requests');
        const token = cookieToken(req);
        const user = token ? store.userForSession(tokenHash(token)) : null;
        const ctx = { req, res, path, user, json, readJson };
        if (await handleChatRoutes(ctx)) return;
        if (await handleBillingRoutes(ctx)) return;
        if (path === '/api/health' && req.method === 'GET') {
          const healthy = store.health();
          return json(res, healthy ? 200 : 503, { status: healthy ? 'ok' : 'unavailable' });
        }
        if (path === '/api/cities' && req.method === 'GET') {
          return json(res, 200, { cities: searchCities(url.searchParams.get('q') || '') });
        }
        if (path === '/api/forecast/card' && req.method === 'GET') {
          const drawParameters = url.searchParams.getAll('draw');
          if (drawParameters.length > 1 || (drawParameters.length === 1 && !/^[0-4]$/.test(drawParameters[0]))) {
            return json(res, 400, { error: 'invalid_draw_position' });
          }
          const draw = drawParameters.length ? Number(drawParameters[0]) : 0;
          const day = moscowDate();
          const general = forecastForDate(day, draw);
          const profile = user ? store.getBirthProfile(user.id) : null;
          const forecast = profile?.birthUtc ? personalForecastForDate(day, profile, user.id, general, draw) : general;
          return json(res, 200, { date: day, tarot: { number: forecast.tarot.number, name: forecast.tarot.name } });
        }
        if (path === '/api/forecast/day' && req.method === 'GET') {
          const drawParameters = url.searchParams.getAll('draw');
          if (drawParameters.length > 1 || (drawParameters.length === 1 && !/^[0-4]$/.test(drawParameters[0]))) {
            return json(res, 400, { error: 'invalid_draw_position' });
          }
          const draw = drawParameters.length ? Number(drawParameters[0]) : 0;
          const day = moscowDate();
          if (dailyCache?.date !== day) {
            const calculated = forecastForDate(day);
            const promise = (async () => {
              let forecast = calculated;
              if (sotisVerifier) {
                try {
                  const positions = await sotisVerifier.verify(day, {
                    sun: calculated.astronomy.sun.longitude, moon: calculated.astronomy.moon.longitude,
                  });
                  forecast = { ...forecast, astronomy: { ...forecast.astronomy,
                    sotis: { status: 'matched', sunLongitude: Number(positions.sun.toFixed(3)), moonLongitude: Number(positions.moon.toFixed(3)) } } };
                } catch (error) {
                  console.warn('Sotis verification unavailable:', error.message);
                  forecast = { ...forecast, astronomy: { ...forecast.astronomy, sotis: { status: 'unavailable' } } };
                }
              }
              return forecast;
            })();
            dailyCache = { date: day, promise };
          }
          const common = await dailyCache.promise;
          if (dailyDrawCacheDay !== day) { dailyDrawCache.clear(); dailyDrawCacheDay = day; }
          if (!dailyDrawCache.has(draw)) {
            const promise = (async () => {
              const selected = draw === 0 ? common : forecastForDate(day, draw);
              const forecast = { ...selected, astronomy: { ...selected.astronomy, sotis: common.astronomy.sotis } };
              if (forecastWriter) {
                try { return await forecastWriter.refine(forecast); }
                catch (error) { console.warn('Local forecast writer failed:', error.message); }
              }
              return forecast;
            })();
            dailyDrawCache.set(draw, promise);
          }
          const general = await dailyDrawCache.get(draw);
          const dailyUser = user;
          const profile = dailyUser ? store.getBirthProfile(dailyUser.id) : null;
          if (profile?.birthUtc) {
            if (personalCacheDay !== day) { personalCache.clear(); personalCacheDay = day; }
            const key = `${dailyUser.id}:${profile.updatedAt}:${profile.birthUtc}:${draw}`;
            if (!personalCache.has(key)) {
              const personal = personalForecastForDate(day, profile, dailyUser.id, general, draw);
              if (personalCache.size >= 1000) personalCache.delete(personalCache.keys().next().value);
              personalCache.set(key, { ...personal, astronomy: { ...personal.astronomy, sotis: general.astronomy.sotis } });
            }
            return json(res, 200, personalCache.get(key));
          }
          return json(res, 200, general);
        }
        if (path === '/api/forecast/week' && req.method === 'GET') {
          return json(res, 501, { error: 'forecast_unavailable', message: 'Прогноз на неделю пока готовится.' });
        }
        if (path === '/api/auth/register' && req.method === 'POST') {
          const body = await readJson(req);
          const email = normalizeEmail(body.email);
          if (!email || !validPassword(body.password) || body.password !== body.confirmPassword) return json(res, 400, { error: 'invalid_credentials', message: 'Проверьте email и совпадение паролей. Пароль: от 8 символов, с заглавной буквой, цифрой и спецсимволом.' });
          if (store.findUserByEmail(email)) return json(res, 409, { error: 'email_exists', message: 'Этот email уже зарегистрирован.' });
          const sent = await sendCode({ purpose: 'registration', email, passwordHash: await hashPassword(body.password) });
          return json(res, sent.status, sent.data);
        }
        if (path === '/api/auth/register/verify' && req.method === 'POST') {
          const body = await readJson(req);
          if (typeof body.challenge !== 'string' || !/^\d{6}$/.test(body.code || '')) return json(res, 400, { error: 'invalid_code' });
          const created = store.consumeChallenge(tokenHash(body.challenge), emailCodeHash(codeSecret, body.challenge, body.code), 'registration');
          if (!created) return json(res, 400, { error: 'invalid_code', message: 'Код неверный или срок его действия истёк.' });
          const session = sessionFor(res, created);
          metrics.count('signups');
          return json(res, 201, { user: session.user }, { 'Set-Cookie': session.cookie });
        }
        if (path === '/api/auth/login' && req.method === 'POST') {
          const body = await readJson(req);
          const email = normalizeEmail(body.email) || '';
          const guard = loginGuard.check(email);
          if (!guard.allowed) return json(res, 429, { error: 'too_many_attempts', message: 'Слишком много неудачных попыток входа. Попробуйте позже или восстановите пароль.' }, { 'Retry-After': String(guard.retryAfter) });
          const found = store.findUserByEmail(email);
          if (!(await verifyLogin(body.password, found?.password_hash))) {
            loginGuard.fail(email);
            return json(res, 401, { error: 'invalid_credentials', message: 'Неверный email или пароль.' });
          }
          loginGuard.succeed(email);
          const session = sessionFor(res, found);
          metrics.count('logins');
          return json(res, 200, { user: session.user }, { 'Set-Cookie': session.cookie });
        }
        if (path === '/api/auth/reset/request' && req.method === 'POST') {
          const body = await readJson(req);
          const email = normalizeEmail(body.email);
          if (!email) return json(res, 400, { error: 'invalid_email' });
          if (!mailer) return json(res, 503, { error: 'mail_unavailable', message: 'Отправка кодов временно недоступна.' });
          const found = store.findUserByEmail(email);
          const generic = { message: 'Если аккаунт существует, код отправлен на почту.' };
          if (!found) {
            const challenge = newChallenge();
            const code = newEmailCode();
            const issued = store.issueChallenge({ challengeHash: tokenHash(challenge), purpose: 'reset', email,
              codeHash: emailCodeHash(codeSecret, challenge, code) });
            return issued ? json(res, 202, { ...generic, challenge })
              : json(res, 429, { error: 'too_soon', message: 'Новый код можно запросить через минуту.' });
          }
          const sent = await sendCode({ purpose: 'reset', email, userId: found.id });
          if (sent.status === 429) return json(res, 429, sent.data);
          if (sent.status !== 202) return json(res, sent.status, sent.data);
          return json(res, 202, { ...generic, challenge: sent.data.challenge });
        }
        if (path === '/api/auth/reset/confirm' && req.method === 'POST') {
          const body = await readJson(req);
          if (typeof body.challenge !== 'string' || !/^\d{6}$/.test(body.code || '')
            || !validPassword(body.password) || body.password !== body.confirmPassword) {
            return json(res, 400, { error: 'invalid_request', message: 'Проверьте код и совпадение новых паролей. Пароль: от 8 символов, с заглавной буквой, цифрой и спецсимволом.' });
          }
          const changed = store.consumeChallenge(tokenHash(body.challenge), emailCodeHash(codeSecret, body.challenge, body.code), 'reset', Date.now(), await hashPassword(body.password));
          if (!changed) return json(res, 400, { error: 'invalid_code', message: 'Код неверный или срок его действия истёк.' });
          return json(res, 200, { ok: true, message: 'Пароль изменён. Войдите с новым паролем.' }, { 'Set-Cookie': sessionCookie('', 0) });
        }
        if (path === '/api/auth/logout' && req.method === 'POST') {
          if (token) store.deleteSession(tokenHash(token));
          return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
        }
        if (!user) return json(res, 401, { error: 'login_required' });
        if (await handleProfileRoutes({ ...ctx, store })) return;
        if (path === '/api/auth/email/request' && req.method === 'POST') {
          if (user.emailVerified) return json(res, 409, { error: 'already_verified' });
          const sent = await sendCode({ purpose: 'verify', email: user.email, userId: user.id });
          return json(res, sent.status, sent.data);
        }
        if (path === '/api/auth/email/verify' && req.method === 'POST') {
          const body = await readJson(req);
          if (typeof body.challenge !== 'string' || !/^\d{6}$/.test(body.code || '')) return json(res, 400, { error: 'invalid_code' });
          const verified = store.consumeChallenge(tokenHash(body.challenge), emailCodeHash(codeSecret, body.challenge, body.code), 'verify', Date.now(), null, user.id);
          if (!verified) return json(res, 400, { error: 'invalid_code', message: 'Код неверный или срок его действия истёк.' });
          return json(res, 200, { ok: true });
        }
        if (path === '/api/me' && req.method === 'GET') {
          return json(res, 200, { user, birthProfile: store.getBirthProfile(user.id) });
        }
        if (path === '/api/me/name' && req.method === 'PUT') {
          const body = await readJson(req);
          const rawName = typeof body.name === 'string' ? body.name : '';
          const name = rawName.trim().replace(/ +/g, ' ');
          if (name.length < 2 || name.length > 40 || !/^[\p{L}]+(?:[ '\u2019\-][\p{L}]+)*$/u.test(name)) {
            return json(res, 400, { error: 'invalid_name', message: 'Укажите имя буквами, от 2 до 40 символов.' });
          }
          store.saveDisplayName(user.id, name);
          return json(res, 200, { name });
        }
        if (path === '/api/profile' && req.method === 'PUT') {
          const parsed = parseBirthInput(await readJson(req));
          if (!parsed.ok) return json(res, parsed.status, parsed.data);
          return json(res, 200, { birthProfile: store.saveBirthProfile(user.id, parsed.profile) });
        }
        return json(res, 404, { error: 'not_found' });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      let decoded;
      try { decoded = decodeURIComponent(path); } catch { res.writeHead(400); return res.end(); }
      if (decoded.includes('\0')) { res.writeHead(400); return res.end(); }
      const target = resolve(rootPath, '.' + (decoded === '/' ? '/index.html' : decoded));
      if (target !== resolve(rootPath) && !target.startsWith(resolve(rootPath) + sep)) { res.writeHead(403); return res.end(); }
      try {
        const file = await readFile(target);
        // Counted only within a per-address budget, so a flood of page loads cannot grow the counters without bound.
        if (extname(target) === '.html' && req.method === 'GET' && pageViewLimiter.check(clientAddress(req, trustProxy)).allowed) {
          metrics.pageView(req, trustProxy);
        }
        res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        return res.end(req.method === 'HEAD' ? undefined : file);
      } catch { res.writeHead(404); return res.end(); }
    } catch (error) {
      // A stream already started cannot switch to a JSON error; close it instead of throwing again.
      if (res.headersSent) { console.error(error); if (!res.writableEnded) res.end(); return undefined; }
      if (error instanceof SyntaxError || ['expected_json', 'body_too_large', 'invalid_json'].includes(error.message)) return json(res, 400, { error: 'invalid_request' });
      if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') return json(res, 409, { error: 'email_exists' });
      console.error(error);
      return json(res, 500, { error: 'internal_error' });
    }
  });
}
