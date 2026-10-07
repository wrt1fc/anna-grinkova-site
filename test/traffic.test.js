import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientAddress, createTrafficLimiter } from '../server/traffic.js';

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

test('client address trusts X-Real-IP only from a loopback proxy', () => {
  const req = (remoteAddress, ip) => ({ socket: { remoteAddress }, headers: ip ? { 'x-real-ip': ip } : {} });
  assert.equal(clientAddress(req('127.0.0.1', '203.0.113.5'), true), '203.0.113.5');
  assert.equal(clientAddress(req('::ffff:127.0.0.1', '2001:db8::1'), true), '2001:db8::1');
  assert.equal(clientAddress(req('198.51.100.7', '203.0.113.5'), true), '198.51.100.7');
  assert.equal(clientAddress(req('127.0.0.1', '203.0.113.5'), false), '127.0.0.1');
  assert.equal(clientAddress(req('127.0.0.1', 'evil<script>'), true), '127.0.0.1');
});
