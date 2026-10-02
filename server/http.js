import { createServer as nodeServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, newSessionToken, normalizeEmail, tokenHash, validPassword, verifyPassword } from './auth.js';
import { publicPlans } from './catalog.js';

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

export function createServer({ store, root = new URL('../prototype/', import.meta.url), prices = {}, secureCookies = false }) {
  const rootPath = fileURLToPath(root);
  const sessionCookie = (value, maxAge) => `anna_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;
  return nodeServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const path = url.pathname;
      if (path.startsWith('/api/')) {
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers.origin) {
          const origin = new URL(req.headers.origin);
          if (origin.host !== req.headers.host) return json(res, 403, { error: 'forbidden_origin' });
        }
        const token = cookieToken(req);
        const user = token ? store.userForSession(tokenHash(token)) : null;
        if (path === '/api/plans' && req.method === 'GET') return json(res, 200, { plans: publicPlans(prices), checkoutAvailable: false });
        if (path === '/api/auth/register' && req.method === 'POST') {
          const body = await readJson(req);
          const email = normalizeEmail(body.email);
          if (!email || !validPassword(body.password)) return json(res, 400, { error: 'invalid_credentials', message: 'Укажите корректный email и пароль от 12 до 128 символов.' });
          if (store.findUserByEmail(email)) return json(res, 409, { error: 'email_exists', message: 'Этот email уже зарегистрирован.' });
          const created = store.createUser(email, hashPassword(body.password));
          const newToken = newSessionToken();
          store.saveSession(tokenHash(newToken), created.id, Date.now() + SESSION_AGE * 1000);
          return json(res, 201, { user: created }, { 'Set-Cookie': sessionCookie(newToken, SESSION_AGE) });
        }
        if (path === '/api/auth/login' && req.method === 'POST') {
          const body = await readJson(req);
          const found = store.findUserByEmail(normalizeEmail(body.email) || '');
          if (!found || !verifyPassword(body.password, found.password_hash)) return json(res, 401, { error: 'invalid_credentials', message: 'Неверный email или пароль.' });
          const newToken = newSessionToken();
          store.saveSession(tokenHash(newToken), found.id, Date.now() + SESSION_AGE * 1000);
          return json(res, 200, { user: { id: found.id, email: found.email } }, { 'Set-Cookie': sessionCookie(newToken, SESSION_AGE) });
        }
        if (path === '/api/auth/logout' && req.method === 'POST') {
          if (token) store.deleteSession(tokenHash(token));
          return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
        }
        if (!user) return json(res, 401, { error: 'login_required' });
        if (path === '/api/me' && req.method === 'GET') {
          return json(res, 200, { user, birthProfile: store.getBirthProfile(user.id), entitlements: store.listEntitlements(user.id).filter((item) => item.status === 'paid' && item.endsAt > Date.now()) });
        }
        if (path === '/api/profile' && req.method === 'PUT') {
          const body = await readJson(req);
          const date = body.birthDate, time = body.birthTime, place = body.birthPlace?.trim();
          const validDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
            && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
            && date >= '1900-01-01' && date <= new Date().toISOString().slice(0, 10);
          if (!validDate || typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
            || typeof place !== 'string' || place.length < 2 || place.length > 120) {
            return json(res, 400, { error: 'invalid_birth_profile', message: 'Проверьте дату, время и место рождения.' });
          }
          return json(res, 200, { birthProfile: store.saveBirthProfile(user.id, { birthDate: date, birthTime: time, birthPlace: place }) });
        }
        if (path === '/api/orders' && req.method === 'POST') return json(res, 503, { error: 'checkout_unavailable', message: 'Оплата пока не подключена.' });
        if ((path === '/api/forecast/day' || path === '/api/forecast/week') && req.method === 'GET') {
          const feature = path.endsWith('/day') ? 'day' : 'week';
          if (!store.hasAccess(user.id, feature)) return json(res, 403, { error: 'payment_required' });
          return json(res, 501, { error: 'forecast_unavailable', message: 'Персональный прогноз пока готовится.' });
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
