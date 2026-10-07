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

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const IP_PATTERN = /^[0-9a-f.:]{2,45}$/i;

// Behind Nginx every socket comes from loopback; only then is the proxy's X-Real-IP trusted.
export function clientAddress(req, trustProxy = false) {
  const socketAddress = req.socket.remoteAddress || 'unknown';
  if (!trustProxy || !LOOPBACK.has(socketAddress)) return socketAddress;
  const forwarded = req.headers['x-real-ip'];
  return typeof forwarded === 'string' && IP_PATTERN.test(forwarded.trim()) ? forwarded.trim() : socketAddress;
}
