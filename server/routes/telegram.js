import { timingSafeEqual } from 'node:crypto';
import { verifyInitData } from '../telegram/init-data.js';

const WEBHOOK_PATH = '/api/telegram/webhook';
const VERIFY_PATH = '/api/telegram/verify';

function sameSecret(received, expected) {
  const a = Buffer.from(String(received ?? '')); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Telegram bot and Mini App. Off (404) until TELEGRAM_BOT_TOKEN is set.
// Signing the user in with the Telegram identity (linking it to an account) is the next step: docs/telegram.md.
export function createTelegramRoutes({ bot, botToken, webhookSecret, metrics }) {
  return async function handleTelegramRoutes({ req, res, path, json, readJson }) {
    if (!path.startsWith('/api/telegram/')) return false;
    if (!bot || !botToken) return json(res, 404, { error: 'not_found' }), true;
    if (path === WEBHOOK_PATH && req.method === 'POST') {
      if (!webhookSecret || !sameSecret(req.headers['x-telegram-bot-api-secret-token'], webhookSecret)) {
        return json(res, 403, { error: 'forbidden' }), true;
      }
      try {
        metrics.count(`telegram_update_${await bot.handleUpdate(await readJson(req, 64_000))}`);
      } catch (error) {
        // A 200 anyway: Telegram would resend the same update again and again.
        console.error('Telegram update failed:', error.message);
        metrics.count('telegram_update_error');
      }
      return json(res, 200, { ok: true }), true;
    }
    if (path === VERIFY_PATH && req.method === 'POST') {
      const body = await readJson(req);
      const telegramUser = verifyInitData(body?.initData, botToken);
      return (telegramUser ? json(res, 200, { ok: true, telegramUser }) : json(res, 401, { error: 'invalid_init_data' })), true;
    }
    return false;
  };
}
