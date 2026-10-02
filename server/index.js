import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createServer } from './http.js';
import { createStore } from './store.js';

const dataPath = resolve(process.env.DATA_PATH || './data/site.sqlite');
await mkdir(dirname(dataPath), { recursive: true });
const store = createStore(dataPath);
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const server = createServer({ store, secureCookies: process.env.NODE_ENV === 'production' });
server.listen(port, host, () => console.log(`Anna site: http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
