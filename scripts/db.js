// Usage: node scripts/db.js backup <file.dump>   |   node scripts/db.js restore <file.dump>
// PostgreSQL backups through pg_dump/pg_restore (custom format, compressed). The provider's own point-in-time
// backups are the main protection; this is the extra copy kept in your storage. Needs the PostgreSQL client tools.
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';

const [operation, file] = process.argv.slice(2);
const url = process.env.DATABASE_URL ?? '';
if (!['backup', 'restore'].includes(operation) || !file || !/^postgres(ql)?:\/\//.test(url)) {
  console.error('Usage: DATABASE_URL=postgres://… node scripts/db.js <backup|restore> <file.dump>');
  process.exit(2);
}
if (operation === 'backup') {
  try { await access(file); console.error('Target file already exists'); process.exit(1); } catch { /* new file, as expected */ }
}
// Connection details go through libpq environment variables, so the password never appears in the process list.
const parsed = new URL(url);
const env = { ...process.env, PGHOST: parsed.hostname, PGPORT: parsed.port || '5432', PGUSER: decodeURIComponent(parsed.username),
  PGPASSWORD: decodeURIComponent(parsed.password), PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
  PGSSLMODE: parsed.searchParams.get('sslmode') ?? process.env.PGSSLMODE ?? 'prefer' };
const args = operation === 'backup'
  ? ['--format=custom', '--no-owner', '--file', file]
  : ['--clean', '--if-exists', '--no-owner', '--single-transaction', '--dbname', env.PGDATABASE, file];
const tool = operation === 'backup' ? 'pg_dump' : 'pg_restore';
const child = spawn(tool, args, { stdio: 'inherit', env });
child.on('exit', (code) => {
  console.log(code === 0 ? `${operation} done: ${file}` : `${operation} failed (${tool} exit ${code})`);
  process.exitCode = code ?? 1;
});
