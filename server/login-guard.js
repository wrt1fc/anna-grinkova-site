// Counts failed logins per email so a password cannot be guessed from many addresses.
export function createLoginGuard({ maxFailures = 10, windowMs = 15 * 60_000, now = Date.now } = {}) {
  for (const value of [maxFailures, windowMs]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Login guard limits must be positive integers');
  }
  const failures = new Map();
  function current(email) {
    const entry = failures.get(email);
    if (entry && now() - entry.start >= windowMs) { failures.delete(email); return null; }
    return entry ?? null;
  }
  return {
    check(email) {
      const entry = current(email);
      if (!entry || entry.count < maxFailures) return { allowed: true, retryAfter: 0 };
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((entry.start + windowMs - now()) / 1000)) };
    },
    fail(email) {
      if (failures.size >= 10_000) for (const key of failures.keys()) current(key);
      const entry = current(email);
      if (entry) entry.count++;
      else failures.set(email, { start: now(), count: 1 });
    },
    succeed(email) { failures.delete(email); },
  };
}
