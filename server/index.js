import { mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { createServer } from './http.js';
import { createStore } from './store.js';
import { createBrevoMailer, createMailRouter, createUnisenderGoMailer } from './mail.js';
import { createTrafficLimiter } from './traffic.js';
import { createLocalForecastWriter } from './local-writer.js';
import { createLocalChat } from './local-chat.js';
import { createConcurrencyGate } from './chat-safety.js';
import { createMetrics } from './metrics.js';
import { loadKnowledge } from './knowledge.js';
import { createYooKassa } from './billing/yookassa.js';
import { createTestProvider } from './billing/test-provider.js';
import { createRobokassa } from './billing/robokassa.js';
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
// Russian mailboxes go through Unisender Go (servers in Russia), foreign ones through Brevo when it is configured.
const mailer = createMailRouter({
  ru: createUnisenderGoMailer({ apiKey: process.env.UNISENDER_GO_API_KEY, fromEmail: process.env.MAIL_FROM }),
  intl: createBrevoMailer({ apiKey: process.env.BREVO_API_KEY, fromEmail: process.env.MAIL_FROM_INTL || process.env.MAIL_FROM }),
  ruFallbackAbroad: process.env.MAIL_RU_FALLBACK_ABROAD === '1',
});
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
// Payments are off unless a provider is configured; the test provider is refused in production.
if (process.env.BILLING_PROVIDER === 'test' && process.env.NODE_ENV === 'production') throw new Error('Test payment provider is not allowed in production');
const paymentProvider = process.env.BILLING_PROVIDER === 'yookassa'
  ? createYooKassa({ shopId: process.env.YOOKASSA_SHOP_ID, secretKey: process.env.YOOKASSA_SECRET_KEY })
  : process.env.BILLING_PROVIDER === 'test' ? createTestProvider() : null;
if (process.env.BILLING_PROVIDER && !paymentProvider) throw new Error('Payment provider is set but its keys are missing');
// Cards of foreign banks: Robokassa in USD/EUR.
const intlProvider = process.env.BILLING_INTL_PROVIDER === 'robokassa'
  ? createRobokassa({ merchantLogin: process.env.ROBOKASSA_LOGIN, password1: process.env.ROBOKASSA_PASSWORD1,
    password2: process.env.ROBOKASSA_PASSWORD2, hashAlgorithm: process.env.ROBOKASSA_HASH || 'sha256', isTest: process.env.ROBOKASSA_TEST === '1' })
  : null;
if (process.env.BILLING_INTL_PROVIDER && !intlProvider) throw new Error('Foreign payment provider is set but its keys are missing');
// Test payments report "paid" without money, so test mode must never run in production.
if (process.env.ROBOKASSA_TEST === '1' && process.env.NODE_ENV === 'production') throw new Error('ROBOKASSA_TEST=1 is not allowed in production');
const server = createServer({ store, mailer, codeSecret, trafficLimiter,
  mailDailyLimit: Number(process.env.MAIL_DAILY_LIMIT ?? 0), forecastWriter, chatWriter, sotisVerifier,
  chatGate: createConcurrencyGate(Number(process.env.CHAT_MAX_CONCURRENT ?? 2)), metrics: createMetrics(store), knowledge, paymentProviders: { ru: paymentProvider, intl: intlProvider },
  publicUrl: process.env.PUBLIC_URL || `http://${host}:${port}`,
  secureCookies: process.env.NODE_ENV === 'production', trustProxy: process.env.TRUST_PROXY === '1' });
if (mailer && !Number(process.env.MAIL_DAILY_LIMIT)) console.warn('MAIL_DAILY_LIMIT is 0: registration and password reset emails are disabled.');
server.listen(port, host, () => console.log(`Anna site: http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
