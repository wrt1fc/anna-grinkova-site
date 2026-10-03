import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createStore } from '../server/store.js';

test('existing account database migrates without losing its users', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anna-store-'));
  const path = join(dir, 'site.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)');
    old.prepare('INSERT INTO users (email,password_hash,created_at) VALUES (?,?,?)').run('existing@example.com', 'hash', 1);
    old.close();
    const store = createStore(path);
    assert.equal(store.findUserByEmail('existing@example.com').email_verified_at, null);
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('code expires, allows only five attempts, and cannot be resent immediately', () => {
  const store = createStore(':memory:');
  const first = { challengeHash: 'one', purpose: 'registration', email: 'anna@example.com', passwordHash: 'hash', codeHash: 'a'.repeat(64) };
  assert.equal(store.issueChallenge(first, 1000), true);
  assert.equal(store.issueChallenge({ ...first, challengeHash: 'two' }, 2000), false);
  for (let i = 0; i < 5; i++) assert.equal(store.consumeChallenge('one', 'b'.repeat(64), 'registration', 3000), null);
  assert.equal(store.consumeChallenge('one', 'a'.repeat(64), 'registration', 3000), null);
  assert.equal(store.issueChallenge({ ...first, challengeHash: 'two' }, 62_000), true);
  assert.equal(store.consumeChallenge('two', 'a'.repeat(64), 'registration', 62_000 + 10 * 60 * 1000), null);
  store.close();
});

test('account and birth profile remain after reopening the database', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anna-profile-'));
  const path = join(dir, 'site.sqlite');
  try {
    const first = createStore(path);
    const user = first.createUser('person@example.com', 'hash', 1000, 1000);
    first.saveBirthProfile(user.id, { birthDate: '1990-03-10', birthTime: '10:45', birthPlace: 'Москва' }, 2000);
    first.close();
    const reopened = createStore(path);
    assert.equal(reopened.findUserByEmail('person@example.com').email_verified_at, 1000);
    assert.equal(reopened.getBirthProfile(user.id).birthPlace, 'Москва');
    reopened.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
