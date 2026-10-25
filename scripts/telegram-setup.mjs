// One-time Telegram setup after TELEGRAM_BOT_TOKEN is set: webhook, menu button and command list.
// Run on the server (or anywhere with the same environment): node scripts/telegram-setup.mjs
import { createTelegramBot } from '../server/telegram/bot.js';

const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret, PUBLIC_URL: publicUrl } = process.env;
if (!token || !secret || !/^https:\/\/[^/]+/.test(publicUrl ?? '')) {
  console.error('Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and PUBLIC_URL=https://… first.');
  process.exit(1);
}
const bot = createTelegramBot({ token, publicUrl });
await bot.configure({ webhookUrl: `${publicUrl.replace(/\/$/, '')}/api/telegram/webhook`, secret });
console.log('Telegram is set up: webhook, menu button, commands.');
