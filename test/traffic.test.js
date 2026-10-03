import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTrafficLimiter } from '../server/traffic.js';

test('API traffic stops at both per-address and global limits', () => {
  let time = 0;
  const limiter = createTrafficLimiter({ perIpLimit: 2, globalLimit: 3, now: () => time });
  assert.equal(limiter.check('a').allowed, true);
  assert.equal(limiter.check('a').allowed, true);
  assert.equal(limiter.check('a').allowed, false);
  assert.equal(limiter.check('b').allowed, true);
  assert.equal(limiter.check('c').allowed, false);
  time = 60_000;
  assert.equal(limiter.check('a').allowed, true);
});
