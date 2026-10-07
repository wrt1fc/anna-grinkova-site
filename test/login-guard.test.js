import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoginGuard } from '../server/login-guard.js';

test('login guard locks an email after the failure cap and unlocks after the window', () => {
  let time = 0;
  const guard = createLoginGuard({ maxFailures: 2, windowMs: 1000, now: () => time });
  guard.fail('a@example.com');
  assert.equal(guard.check('a@example.com').allowed, true);
  guard.fail('a@example.com');
  assert.deepEqual(guard.check('a@example.com'), { allowed: false, retryAfter: 1 });
  assert.equal(guard.check('b@example.com').allowed, true);
  time = 1000;
  assert.equal(guard.check('a@example.com').allowed, true);
});

test('a successful login resets the failure count', () => {
  const guard = createLoginGuard({ maxFailures: 1 });
  guard.fail('a@example.com');
  guard.succeed('a@example.com');
  assert.equal(guard.check('a@example.com').allowed, true);
});
