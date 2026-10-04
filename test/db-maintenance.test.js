import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { backupDatabase, restoreDatabase } from '../server/db-maintenance.js';
import { createStore } from '../server/store.js';

test('SQLite backup restores accounts and profiles to a fresh path', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'anna-backup-'));
  const source = join(dir, 'live.sqlite'), archive = join(dir, 'archive.sqlite'), restored = join(dir, 'restored.sqlite');
  try {
    const store = createStore(source);
    const user = store.createUser('backup@example.com', 'hash', 1000, 1000);
    store.saveBirthProfile(user.id, { birthDate: '1990-03-10', birthTime: '10:45', birthPlace: 'Moscow',
      birthCityId: 524901, birthLatitude: 55.75, birthLongitude: 37.61,
      birthTimeZone: 'Europe/Moscow', birthUtc: '1990-03-10T07:45:00.000Z' });
    await backupDatabase(source, archive);
    store.close();
    await restoreDatabase(archive, restored);
    const reopened = createStore(restored);
    assert.equal(reopened.findUserByEmail('backup@example.com').id, user.id);
    assert.equal(reopened.getBirthProfile(user.id).birthUtc, '1990-03-10T07:45:00.000Z');
    reopened.close();
    await assert.rejects(restoreDatabase(archive, restored), /target_exists/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
