import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_AGE_SECONDS = 24 * 3600;

const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

// Checks the signed `initData` string that a Telegram Mini App passes from the page (Telegram.WebApp.initData).
// Returns the Telegram user, or null when the signature is wrong, the data is stale or malformed.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export function verifyInitData(initData, botToken, { now = Date.now(), maxAgeSeconds = MAX_AGE_SECONDS } = {}) {
  if (typeof initData !== 'string' || !initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`).join('\n');
  const expected = hmac(hmac('WebAppData', botToken), dataCheckString);
  const received = Buffer.from(hash, 'hex');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate) || now / 1000 - authDate > maxAgeSeconds || authDate - now / 1000 > 60) return null;
  let user;
  try { user = JSON.parse(params.get('user') ?? ''); } catch { return null; }
  if (!user || !Number.isSafeInteger(user.id)) return null;
  return { id: user.id, firstName: String(user.first_name ?? ''), username: user.username ? String(user.username) : null,
    languageCode: user.language_code ? String(user.language_code) : null };
}
