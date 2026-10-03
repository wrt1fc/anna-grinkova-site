import { mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { createServer } from './http.js';
import { createStore } from './store.js';
import { createUnisenderGoMailer } from './mail.js';

const dataPath = resolve(process.env.DATA_PATH || './data/site.sqlite');
await mkdir(dirname(dataPath), { recursive: true });
const store = createStore(dataPath);
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
if (process.env.NODE_ENV === 'production' && !process.env.AUTH_CODE_SECRET) throw new Error('AUTH_CODE_SECRET is required in production');
const codeSecret = process.env.AUTH_CODE_SECRET || randomBytes(32).toString('hex');
const mailer = createUnisenderGoMailer({ apiKey: process.env.UNISENDER_GO_API_KEY, fromEmail: process.env.MAIL_FROM });
const server = createServer({ store, mailer, codeSecret, secureCookies: process.env.NODE_ENV === 'production' });
server.listen(port, host, () => console.log(`Anna site: http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
