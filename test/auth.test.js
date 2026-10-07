import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, validPassword, verifyLogin, verifyPassword } from '../server/auth.js';

test('new passwords require eight characters, uppercase, digit and special character', () => {
  assert.equal(validPassword('Abcdef1!'), true);
  assert.equal(validPassword('Пароль1!'), true);
  assert.equal(validPassword('Abcde1!'), false);
  assert.equal(validPassword('abcdef1!'), false);
  assert.equal(validPassword('Abcdefg!'), false);
  assert.equal(validPassword('Abcdefg1'), false);
  assert.equal(validPassword('Abcdef1 '), false);
  assert.equal(validPassword('A'.repeat(127) + '1!'), false);
});

test('password hashes verify asynchronously and reject other passwords', async () => {
  const stored = await hashPassword('Abcdef1!');
  assert.equal(await verifyPassword('Abcdef1!', stored), true);
  assert.equal(await verifyPassword('Abcdef1?', stored), false);
});

test('login check fails for a missing account after doing the same hashing work', async () => {
  const stored = await hashPassword('Abcdef1!');
  assert.equal(await verifyLogin('Abcdef1!', stored), true);
  assert.equal(await verifyLogin('Abcdef1!', undefined), false);
  assert.equal(await verifyLogin(undefined, stored), false);
});
