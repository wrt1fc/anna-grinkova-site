import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validPassword } from '../server/auth.js';

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
