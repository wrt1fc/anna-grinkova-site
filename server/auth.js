import { createHash, createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';

export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function validPassword(value) {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128;
}

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    if (salt.length !== 16 || expected.length !== 64) return false;
    return timingSafeEqual(scryptSync(password, salt, expected.length), expected);
  } catch { return false; }
}

export function newSessionToken() { return randomBytes(32).toString('base64url'); }
export function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }
export function newEmailCode() { return String(randomInt(0, 1_000_000)).padStart(6, '0'); }
export function newChallenge() { return randomBytes(24).toString('base64url'); }
export function emailCodeHash(secret, challenge, code) {
  return createHmac('sha256', secret).update(`${challenge}:${code}`).digest('hex');
}
