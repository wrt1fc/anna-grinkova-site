# Telegram: бот и мини-приложение

Мини-приложение открывает тот же сайт внутри Telegram. Бот отвечает на `/start` и `/help` кнопкой «Открыть приложение»; кнопка меню рядом с полем ввода делает то же самое.

## Что уже есть в коде

| Файл | Что делает |
|---|---|
| `server/telegram/init-data.js` | Проверяет подпись `initData`, которую мини-приложение передаёт со страницы. Без неё Telegram-идентификатору верить нельзя |
| `server/telegram/bot.js` | Клиент Bot API: ответы на `/start`, `/help`, настройка вебхука, кнопки меню и списка команд |
| `server/routes/telegram.js` | `POST /api/telegram/webhook` (обновления от Telegram, проверка секрета) и `POST /api/telegram/verify` (проверка `initData`) |
| `scripts/telegram-setup.mjs` | Разовая настройка после получения токена |
| `test/telegram.test.js` | Тесты подписи, бота и маршрутов |

Пока `TELEGRAM_BOT_TOKEN` пуст, все адреса `/api/telegram/*` отвечают 404, на сайт это не влияет.

## Когда будет токен

1. В Telegram откройте @BotFather → `/newbot` → имя и ник бота → скопируйте токен.
2. На сервере в `/etc/anna/site.env` добавьте (сами, токен в чат не присылайте):
   ```
   TELEGRAM_BOT_TOKEN=токен
   TELEGRAM_WEBHOOK_SECRET=случайная_строка   # openssl rand -hex 32
   ```
3. Перезапустите сайт: `sudo systemctl restart anna-site`.
4. Один раз выполните настройку (задаёт вебхук, кнопку меню и команды):
   ```
   cd /opt/anna-site && set -a && . /etc/anna/site.env && set +a && node scripts/telegram-setup.mjs
   ```
5. Откройте бота в Telegram и нажмите `/start`.

## Что осталось сделать (следующие шаги)

1. **Вход через Telegram.** Сейчас `/api/telegram/verify` лишь проверяет подпись. Нужно связать `telegramUser.id` с аккаунтом: колонка `telegram_id` в `users` (новая миграция в конец `server/schema.js`), вход без письма с кодом, привязка к существующему аккаунту по e-mail.
2. **Страница внутри Telegram.** Подключить `https://telegram.org/js/telegram-web-app.js`, при открытии из Telegram вызвать `Telegram.WebApp.ready()`/`expand()`, взять `initData`, отправить на сервер, подстроить цвета под тему и убрать лишние ссылки на внешние сайты. Дизайн экранов брать только из Figma; для мини-приложения кадров пока нет.
3. **Оплата в Telegram.** Ссылки Prodamus открывать через `Telegram.WebApp.openLink`, не внутри окна приложения.
4. **Уведомления.** Карта дня в чат: нужна подписка (`/subscribe`), время отправки и согласие на рассылку (152-ФЗ).
5. **Политика и согласие.** Сообщить в политике конфиденциальности, что Telegram-идентификатор хранится и зачем.
