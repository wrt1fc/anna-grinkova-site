export function createTrafficLimiter({ perIpLimit = 60, globalLimit = 600, windowMs = 60_000, now = Date.now } = {}) {
  for (const value of [perIpLimit, globalLimit, windowMs]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Traffic limits must be positive integers');
  }
  let windowStart = now();
  let total = 0;
  let addresses = new Map();
  return {
    check(address) {
      const current = now();
      if (current - windowStart >= windowMs) {
        windowStart = current;
        total = 0;
        addresses = new Map();
      }
      const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - current) / 1000));
      const count = addresses.get(address) || 0;
      if (count >= perIpLimit || total >= globalLimit) return { allowed: false, retryAfter };
      addresses.set(address, count + 1);
      total++;
      return { allowed: true, retryAfter: 0 };
    },
  };
}
