import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// Async scrypt runs on the libuv thread pool, so hashing never blocks other requests.
const scryptAsync = promisify(scrypt);

export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function validPassword(value) {
  if (typeof value !== 'string') return false;
  const length = [...value].length;
  return length >= 8 && length <= 128
    && /\p{Lu}/u.test(value)
    && /\p{Nd}/u.test(value)
    && /[^\p{L}\p{N}\s]/u.test(value);
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    if (salt.length !== 16 || expected.length !== 64) return false;
    return timingSafeEqual(await scryptAsync(password, salt, expected.length), expected);
  } catch { return false; }
}

// Checked when an email has no account, so a failed login takes as long either way.
const dummyPasswordHash = `scrypt:${randomBytes(16).toString('hex')}:${randomBytes(64).toString('hex')}`;
export async function verifyLogin(password, stored) {
  const matches = await verifyPassword(typeof password === 'string' ? password : '', stored ?? dummyPasswordHash);
  return matches && typeof stored === 'string';
}

export function newSessionToken() { return randomBytes(32).toString('base64url'); }
export function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }
export function newEmailCode() { return String(randomInt(0, 1_000_000)).padStart(6, '0'); }
export function newChallenge() { return randomBytes(24).toString('base64url'); }
export function emailCodeHash(secret, challenge, code) {
  return createHmac('sha256', secret).update(`${challenge}:${code}`).digest('hex');
}
