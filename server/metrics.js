import { createHash, randomBytes } from 'node:crypto';
import { moscowDate } from './daily-forecast.js';
import { clientAddress } from './traffic.js';

// Daily counters for traffic and chat health. Visitors are counted by a hash salted with a key that
// lives only in memory and changes every day, so stored rows cannot be tied back to an IP address.
export function createMetrics(store, { day = moscowDate } = {}) {
  let saltDay = null;
  let salt = null;
  // Fire and forget: counters never delay or break a request.
  function count(metric, by = 1) {
    store.incrementMetric(day(), metric, by).catch((error) => console.warn(`Metric ${metric} not recorded:`, error.message));
  }
  return {
    count,
    timing(metric, ms) {
      count(`${metric}_ms_sum`, Math.max(0, Math.round(ms)));
      count(`${metric}_count`);
    },
    pageView(req, trustProxy = false) {
      count('page_views');
      const today = day();
      if (saltDay !== today) { saltDay = today; salt = randomBytes(16); }
      const visitor = createHash('sha256').update(salt).update(clientAddress(req, trustProxy))
        .update(String(req.headers['user-agent'] ?? '')).digest('hex');
      store.markVisitor(today, visitor).then((first) => { if (first) count('unique_visitors'); })
        .catch((error) => console.warn('Visitor not recorded:', error.message));
    },
  };
}

export const NULL_METRICS = { count() {}, timing() {}, pageView() {} };
