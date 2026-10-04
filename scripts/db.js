import { resolve } from 'node:path';
import { backupDatabase, restoreDatabase } from '../server/db-maintenance.js';

const [operation, source, target] = process.argv.slice(2);
if (!['backup', 'restore'].includes(operation) || !source || !target) {
  console.error('Usage: node scripts/db.js <backup|restore> <source.sqlite> <new-target.sqlite>');
  process.exitCode = 2;
} else {
  try {
    const destination = await (operation === 'backup' ? backupDatabase : restoreDatabase)(resolve(source), resolve(target));
    console.log(`${operation} verified: ${destination}`);
  } catch (error) { console.error(`${operation} failed: ${error.message}`); process.exitCode = 1; }
}
