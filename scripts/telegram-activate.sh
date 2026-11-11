#!/usr/bin/env bash
# Run as root after setting TELEGRAM_BOT_TOKEN in /etc/anna/site.env.
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then
  echo 'Run: sudo bash /opt/anna-site/scripts/telegram-activate.sh' >&2
  exit 1
fi
cd /opt/anna-site
node --env-file=/etc/anna/site.env --input-type=module -e '
  import { appendFileSync } from "node:fs";
  import { randomBytes } from "node:crypto";
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("Add TELEGRAM_BOT_TOKEN to /etc/anna/site.env first."); process.exit(1);
  }
  if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
    appendFileSync("/etc/anna/site.env", "\nTELEGRAM_WEBHOOK_SECRET=" + randomBytes(32).toString("hex") + "\n");
  }
'
node --env-file=/etc/anna/site.env scripts/telegram-setup.mjs
systemctl restart anna-site
systemctl is-active --quiet anna-site
echo 'Telegram Mini App activated. Open the bot and send /start.'
