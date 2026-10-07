import { createServer as nodeServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emailCodeHash, hashPassword, newChallenge, newEmailCode, newSessionToken, normalizeEmail, tokenHash, validPassword, verifyPassword } from './auth.js';
import { forecastForDate, moscowDate } from './daily-forecast.js';
import { createTrafficLimiter } from './traffic.js';
import { getCityById, searchCities } from './cities.js';
import { birthInstant } from './birth-time.js';
import { personalForecastForDate } from './personal-forecast.js';

const SESSION_AGE = 30 * 24 * 60 * 60;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

function json(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('expected_json');
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 16_384) throw new Error('body_too_large');
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
  mailDailyLimit = 0, trafficLimiter = createTrafficLimiter(), forecastWriter = null, sotisVerifier = null }) {
  if (!codeSecret || String(codeSecret).length < 32) throw new Error('AUTH_CODE_SECRET must have at least 32 characters');
  if (!Number.isSafeInteger(mailDailyLimit) || mailDailyLimit < 0) throw new Error('MAIL_DAILY_LIMIT must be a non-negative integer');
  const rootPath = fileURLToPath(root);
  const sessionCookie = (value, maxAge) => `anna_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;
  let dailyCache = null;
  let dailyDrawCacheDay = null;
  const dailyDrawCache = new Map();
  let personalCacheDay = null;
  const personalCache = new Map();
  async function sendCode({ purpose, email, userId = null, passwordHash = null }) {
    if (!mailer) return { status: 503, data: { error: 'mail_unavailable', message: 'Отправка кодов временно недоступна.' } };
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
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const path = url.pathname;
      if (path.startsWith('/api/')) {
        const traffic = trafficLimiter.check(req.socket.remoteAddress || 'unknown');
        if (!traffic.allowed) return json(res, 429, { error: 'rate_limited', message: 'Слишком много запросов. Попробуйте позже.' }, { 'Retry-After': String(traffic.retryAfter) });
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers.origin) {
          const origin = new URL(req.headers.origin);
          if (origin.host !== req.headers.host) return json(res, 403, { error: 'forbidden_origin' });
        }
        if (path === '/api/health' && req.method === 'GET') {
          const healthy = store.health();
          return json(res, healthy ? 200 : 503, { status: healthy ? 'ok' : 'unavailable' });
        }
        if (path === '/api/cities' && req.method === 'GET') {
          return json(res, 200, { cities: searchCities(url.searchParams.get('q') || '') });
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
          const dailyToken = cookieToken(req);
          const dailyUser = dailyToken ? store.userForSession(tokenHash(dailyToken)) : null;
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
        const token = cookieToken(req);
        const user = token ? store.userForSession(tokenHash(token)) : null;
        if (path === '/api/auth/register' && req.method === 'POST') {
          const body = await readJson(req);
          const email = normalizeEmail(body.email);
          if (!email || !validPassword(body.password) || body.password !== body.confirmPassword) return json(res, 400, { error: 'invalid_credentials', message: 'Проверьте email и совпадение паролей. Пароль: от 8 символов, с заглавной буквой, цифрой и спецсимволом.' });
          if (store.findUserByEmail(email)) return json(res, 409, { error: 'email_exists', message: 'Этот email уже зарегистрирован.' });
          const sent = await sendCode({ purpose: 'registration', email, passwordHash: hashPassword(body.password) });
          return json(res, sent.status, sent.data);
        }
        if (path === '/api/auth/register/verify' && req.method === 'POST') {
          const body = await readJson(req);
          if (typeof body.challenge !== 'string' || !/^\d{6}$/.test(body.code || '')) return json(res, 400, { error: 'invalid_code' });
          const created = store.consumeChallenge(tokenHash(body.challenge), emailCodeHash(codeSecret, body.challenge, body.code), 'registration');
          if (!created) return json(res, 400, { error: 'invalid_code', message: 'Код неверный или срок его действия истёк.' });
          const session = sessionFor(res, created);
          return json(res, 201, { user: session.user }, { 'Set-Cookie': session.cookie });
        }
        if (path === '/api/auth/login' && req.method === 'POST') {
          const body = await readJson(req);
          const found = store.findUserByEmail(normalizeEmail(body.email) || '');
          if (!found || !verifyPassword(body.password, found.password_hash)) return json(res, 401, { error: 'invalid_credentials', message: 'Неверный email или пароль.' });
          const session = sessionFor(res, found);
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
          const changed = store.consumeChallenge(tokenHash(body.challenge), emailCodeHash(codeSecret, body.challenge, body.code), 'reset', Date.now(), hashPassword(body.password));
          if (!changed) return json(res, 400, { error: 'invalid_code', message: 'Код неверный или срок его действия истёк.' });
          return json(res, 200, { ok: true, message: 'Пароль изменён. Войдите с новым паролем.' }, { 'Set-Cookie': sessionCookie('', 0) });
        }
        if (path === '/api/auth/logout' && req.method === 'POST') {
          if (token) store.deleteSession(tokenHash(token));
          return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
        }
        if (!user) return json(res, 401, { error: 'login_required' });
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
        if (path === '/api/profile' && req.method === 'PUT') {
          const body = await readJson(req);
          const date = body.birthDate, time = body.birthTime;
          const validDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
            && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
            && date >= '1900-01-01' && date <= new Date().toISOString().slice(0, 10);
          if (!validDate || typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
            return json(res, 400, { error: 'invalid_birth_profile', message: 'Проверьте дату, время и место рождения.' });
          }
          const city = body.birthCityId == null || body.birthCityId === '' ? null : getCityById(body.birthCityId);
          if (body.birthCityId != null && body.birthCityId !== '' && !city) return json(res, 400, { error: 'invalid_city' });
          const place = city?.name || (typeof body.birthPlace === 'string' ? body.birthPlace.trim() : '');
          const latitude = city?.latitude ?? (body.birthLatitude === '' || body.birthLatitude == null ? NaN : Number(body.birthLatitude));
          const longitude = city?.longitude ?? (body.birthLongitude === '' || body.birthLongitude == null ? NaN : Number(body.birthLongitude));
          const timeZone = city?.timeZone || body.birthTimeZone;
          if (place.length < 2 || place.length > 120 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
            || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || typeof timeZone !== 'string') {
            return json(res, 400, { error: 'invalid_birth_profile', message: 'Выберите город из списка либо укажите название, координаты и часовой пояс.' });
          }
          let utcOffsetMinutes;
          if (body.birthUtcOffsetMinutes !== undefined && body.birthUtcOffsetMinutes !== '') {
            utcOffsetMinutes = Number(body.birthUtcOffsetMinutes);
            if (!Number.isInteger(utcOffsetMinutes)) return json(res, 400, { error: 'invalid_birth_offset' });
          }
          let instant;
          try { instant = birthInstant({ birthDate: date, birthTime: time, timeZone, utcOffsetMinutes }); }
          catch (error) {
            if (error.message === 'birth_time_ambiguous') return json(res, 409, { error: 'birth_time_ambiguous',
              message: 'Это местное время приходится на перевод часов. Уточните время рождения; если час повторялся, укажите смещение UTC в минутах.' });
            return json(res, 400, { error: 'invalid_birth_time', message: 'Проверьте местное время и часовой пояс рождения.' });
          }
          return json(res, 200, { birthProfile: store.saveBirthProfile(user.id, { birthDate: date, birthTime: time,
            birthPlace: place, birthCityId: city?.id ?? null, birthLatitude: latitude, birthLongitude: longitude,
            birthTimeZone: timeZone, birthUtc: instant.utc, birthUtcOffsetMinutes: instant.offsetMinutes }) });
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
        res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        return res.end(req.method === 'HEAD' ? undefined : file);
      } catch { res.writeHead(404); return res.end(); }
    } catch (error) {
      if (error instanceof SyntaxError || ['expected_json', 'body_too_large', 'invalid_json'].includes(error.message)) return json(res, 400, { error: 'invalid_request' });
      if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') return json(res, 409, { error: 'email_exists' });
      console.error(error);
      return json(res, 500, { error: 'internal_error' });
    }
  });
}
