import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.js';

test('migrations run once and keep data when the database is opened again', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'anna-store-'));
  try {
    const first = await createStore(`pglite:${dir}`);
    await first.createUser('existing@example.com', 'hash', 1);
    const applied = await first.q.query('SELECT version FROM schema_migrations ORDER BY version');
    await first.close();
    const reopened = await createStore(`pglite:${dir}`);
    assert.equal((await reopened.findUserByEmail('existing@example.com')).email_verified_at, null);
    assert.deepEqual(await reopened.q.query('SELECT version FROM schema_migrations ORDER BY version'), applied);
    assert.equal(await reopened.health(), true);
    await reopened.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('code expires, allows only five attempts, and cannot be resent immediately', async () => {
  const store = await createStore('pglite:memory');
  const first = { challengeHash: 'one', purpose: 'registration', email: 'anna@example.com', passwordHash: 'hash', codeHash: 'a'.repeat(64) };
  assert.equal(await store.issueChallenge(first, 1000), true);
  assert.equal(await store.issueChallenge({ ...first, challengeHash: 'two' }, 2000), false);
  for (let i = 0; i < 5; i++) assert.equal(await store.consumeChallenge('one', 'b'.repeat(64), 'registration', 3000), null);
  assert.equal(await store.consumeChallenge('one', 'a'.repeat(64), 'registration', 3000), null);
  assert.equal(await store.issueChallenge({ ...first, challengeHash: 'two' }, 62_000), true);
  assert.equal(await store.consumeChallenge('two', 'a'.repeat(64), 'registration', 62_000 + 10 * 60 * 1000), null);
  await store.close();
});

test('account and birth profile remain after reopening the database', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'anna-profile-'));
  const path = join(dir, 'pgdata');
  try {
    const first = await createStore(`pglite:${path}`);
    const user = await first.createUser('person@example.com', 'hash', 1000, 1000);
    await first.saveBirthProfile(user.id, { birthDate: '1990-03-10', birthTime: '10:45', birthPlace: 'Москва' }, 2000);
    await first.close();
    const reopened = await createStore(`pglite:${path}`);
    assert.equal((await reopened.findUserByEmail('person@example.com')).email_verified_at, 1000);
    assert.equal((await reopened.getBirthProfile(user.id)).birthPlace, 'Москва');
    await reopened.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resolved birth coordinates survive schema migration and reopen', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'anna-resolved-'));
  const path = join(dir, 'pgdata');
  try {
    const first = await createStore(`pglite:${path}`);
    const user = await first.createUser('resolved@example.com', 'hash', 1000, 1000);
    await first.saveBirthProfile(user.id, { birthDate: '1990-03-10', birthTime: '10:45', birthPlace: 'Moscow',
      birthCityId: 524901, birthLatitude: 55.75222, birthLongitude: 37.61556,
      birthTimeZone: 'Europe/Moscow', birthUtc: '1990-03-10T07:45:00.000Z', birthUtcOffsetMinutes: 180 });
    await first.close();
    const reopened = await createStore(`pglite:${path}`);
    assert.equal((await reopened.getBirthProfile(user.id)).birthCityId, 524901);
    assert.equal((await reopened.getBirthProfile(user.id)).birthUtc, '1990-03-10T07:45:00.000Z');
    await reopened.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('outbound mail quota persists and stops at its daily cap', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'anna-quota-'));
  const path = join(dir, 'pgdata');
  try {
    const first = await createStore(`pglite:${path}`);
    assert.equal(await first.consumeDailyQuota('mail', '2026-10-03', 2), true);
    await first.close();
    const reopened = await createStore(`pglite:${path}`);
    assert.equal(await reopened.consumeDailyQuota('mail', '2026-10-03', 2), true);
    assert.equal(await reopened.consumeDailyQuota('mail', '2026-10-03', 2), false);
    assert.equal(await reopened.consumeDailyQuota('mail', '2026-10-04', 2), true);
    await reopened.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('wrong codes are counted per address across re-issued codes', async () => {
  const store = await createStore('pglite:memory');
  try {
    const now = Date.parse('2026-10-08T10:00:00Z');
    let challenge = 0;
    const issue = async (at) => {
      challenge++;
      await store.issueChallenge({ challengeHash: `c${challenge}`, purpose: 'registration', email: 'guess@example.com', passwordHash: 'h', codeHash: 'a'.repeat(64) }, at);
      return `c${challenge}`;
    };
    // Two codes × five wrong attempts reach the daily cap of ten; a third code is refused even with the right digits.
    for (const at of [now, now + 61_000]) {
      const id = await issue(at);
      for (let i = 0; i < 5; i++) assert.equal(await store.consumeChallenge(id, 'b'.repeat(64), 'registration', at), null);
    }
    const last = await issue(now + 122_000);
    assert.equal(await store.consumeChallenge(last, 'a'.repeat(64), 'registration', now + 122_000), null);
  } finally { await store.close(); }
});
