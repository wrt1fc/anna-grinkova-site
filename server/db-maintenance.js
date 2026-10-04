import { DatabaseSync, backup } from 'node:sqlite';
import { access, chmod, mkdir, rename, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';

async function exists(path) {
  try { await access(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function checkedCopy(sourcePath, targetPath) {
  const source = resolve(sourcePath), target = resolve(targetPath);
  if (source === target) throw new Error('same_database_path');
  if (await exists(target)) throw new Error('target_exists');
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomBytes(8).toString('hex')}.tmp`;
  const sourceDb = new DatabaseSync(source, { readOnly: true });
  try {
    const sourceCheck = sourceDb.prepare('PRAGMA quick_check').get();
    if (sourceCheck.quick_check !== 'ok') throw new Error('source_database_corrupt');
    await backup(sourceDb, temporary);
    const copied = new DatabaseSync(temporary, { readOnly: true });
    try {
      if (copied.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('backup_database_corrupt');
    } finally { copied.close(); }
    if (process.platform !== 'win32') await chmod(temporary, 0o600);
    if (await exists(target)) throw new Error('target_exists');
    await rename(temporary, target);
    return target;
  } catch (error) { await rm(temporary, { force: true }); throw error; }
  finally { sourceDb.close(); }
}

export const backupDatabase = checkedCopy;
export const restoreDatabase = checkedCopy;
