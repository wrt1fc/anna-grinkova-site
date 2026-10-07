// Counts failed logins per email and visitor address. A pair (email, IP) is locked after a few failures, so a stranger
// cannot lock someone else out from their own address; a much higher per-email cap still stops distributed guessing.
export function createLoginGuard({ maxFailures = 10, maxFailuresPerEmail = 100, windowMs = 15 * 60_000, now = Date.now } = {}) {
  for (const value of [maxFailures, maxFailuresPerEmail, windowMs]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Login guard limits must be positive integers');
  }
  const failures = new Map();
  function current(key) {
    const entry = failures.get(key);
    if (entry && now() - entry.start >= windowMs) { failures.delete(key); return null; }
    return entry ?? null;
  }
  function bump(key) {
    const entry = current(key);
    if (entry) entry.count++;
    else failures.set(key, { start: now(), count: 1 });
  }
  const blocked = (key, limit) => {
    const entry = current(key);
    return entry && entry.count >= limit ? Math.max(1, Math.ceil((entry.start + windowMs - now()) / 1000)) : 0;
  };
  return {
    check(email, ip = '') {
      const retryAfter = Math.max(blocked(`pair:${email}|${ip}`, maxFailures), blocked(`email:${email}`, maxFailuresPerEmail));
      return retryAfter ? { allowed: false, retryAfter } : { allowed: true, retryAfter: 0 };
    },
    fail(email, ip = '') {
      if (failures.size >= 20_000) for (const key of failures.keys()) current(key);
      bump(`pair:${email}|${ip}`);
      bump(`email:${email}`);
    },
    succeed(email, ip = '') { failures.delete(`pair:${email}|${ip}`); },
  };
}
