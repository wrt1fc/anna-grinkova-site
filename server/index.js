import { mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { createServer } from './http.js';
import { createStore } from './store.js';
import { createUnisenderGoMailer } from './mail.js';
import { createTrafficLimiter } from './traffic.js';
import { createLocalForecastWriter } from './local-writer.js';
import { createLocalChat } from './local-chat.js';
import { createConcurrencyGate } from './chat-safety.js';
import { createMetrics } from './metrics.js';
import { loadKnowledge } from './knowledge.js';
import { createSotisVerifier } from './sotis.js';

// Newly created SQLite, WAL and directory files must not be readable by other local users on POSIX hosts.
if (process.platform !== 'win32') process.umask(0o077);
const dataPath = resolve(process.env.DATA_PATH || './data/site.sqlite');
await mkdir(dirname(dataPath), { recursive: true });
const store = createStore(dataPath);
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
if (process.env.NODE_ENV === 'production' && !process.env.AUTH_CODE_SECRET) throw new Error('AUTH_CODE_SECRET is required in production');
const codeSecret = process.env.AUTH_CODE_SECRET || randomBytes(32).toString('hex');
const mailer = createUnisenderGoMailer({ apiKey: process.env.UNISENDER_GO_API_KEY, fromEmail: process.env.MAIL_FROM });
const trafficLimiter = createTrafficLimiter({
  perIpLimit: Number(process.env.API_PER_IP_PER_MINUTE ?? 60),
  globalLimit: Number(process.env.API_GLOBAL_PER_MINUTE ?? 600),
});
const forecastWriter = process.env.FORECAST_LOCAL_MODEL
  ? createLocalForecastWriter({ model: process.env.FORECAST_LOCAL_MODEL }) : null;
const chatModel = process.env.CHAT_LOCAL_MODEL || process.env.FORECAST_LOCAL_MODEL;
const chatWriter = chatModel ? createLocalChat({ model: chatModel }) : null;
const sotisVerifier = process.env.SOTIS_VERIFY === '0' ? null : createSotisVerifier();
// Approved materials for retrieval live outside Git, like the recordings they come from.
const knowledge = process.env.KNOWLEDGE_PATH ? loadKnowledge(resolve(process.env.KNOWLEDGE_PATH)) : null;
if (knowledge) console.log(`Knowledge: ${knowledge.size} approved fragments`);
const server = createServer({ store, mailer, codeSecret, trafficLimiter,
  mailDailyLimit: Number(process.env.MAIL_DAILY_LIMIT ?? 0), forecastWriter, chatWriter, sotisVerifier,
  chatGate: createConcurrencyGate(Number(process.env.CHAT_MAX_CONCURRENT ?? 2)), metrics: createMetrics(store), knowledge,
  secureCookies: process.env.NODE_ENV === 'production', trustProxy: process.env.TRUST_PROXY === '1' });
if (mailer && !Number(process.env.MAIL_DAILY_LIMIT)) console.warn('MAIL_DAILY_LIMIT is 0: registration and password reset emails are disabled.');
server.listen(port, host, () => console.log(`Anna site: http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
