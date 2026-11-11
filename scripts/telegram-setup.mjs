// One-time Telegram setup after TELEGRAM_BOT_TOKEN is set: webhook, menu button and command list.
// Run on the server (or anywhere with the same environment): node scripts/telegram-setup.mjs
import { createTelegramBot } from '../server/telegram/bot.js';
import { readFile } from 'node:fs/promises';

const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret, PUBLIC_URL: publicUrl } = process.env;
if (!token || !secret || !/^https:\/\/[^/]+/.test(publicUrl ?? '')) {
  console.error('Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and PUBLIC_URL=https://… first.');
  process.exit(1);
}
const bot = createTelegramBot({ token, publicUrl });
try {
  await bot.configure({ webhookUrl: `${publicUrl.replace(/\/$/, '')}/api/telegram/webhook`, secret,
    profilePhoto: await readFile(new URL('../prototype/assets/app/icon-512.png', import.meta.url)) });
  console.log('Telegram is set up: webhook, menu button, commands.');
} catch {
  // Network exception stacks may contain the request URL, including the token.
  console.error('Telegram setup failed. Check the token, HTTPS address and connection, then run again.');
  process.exitCode = 1;
}
