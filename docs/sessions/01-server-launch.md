# Чат «Сервер и запуск»

**Модель:** Sonnet 5.5. **Рабочая папка:** `E:\ai-site-intl`.

## Как начать

> Прочитай `docs/sessions/01-server-launch.md`. IP сервера: `<IP>`. Продолжаем настройку.

## Что уже решено

- Сервер Immers.cloud, Москва, `rtx2080ti-1.10.16.500`: RTX 2080 Ti 11 ГБ, 10 vCPU, 16 ГБ RAM, 500 ГБ локальный диск (тип инстанса Local), Ubuntu 26.04 CUDA (драйверы и CUDA предустановлены). A10 и A2 были заняты.
- Создаётся с Dynamic IP, затем на странице сервера IP отмечается статическим.
- SSH: ключ `~/.ssh/anna_site_ed25519`, открытая часть передана через «Пользовательские данные» (cloud-init). Пользователь по умолчанию в образе, скорее всего, `ubuntu`: `ssh -i ~/.ssh/anna_site_ed25519 ubuntu@<IP>`.
- На одном сервере: Nginx + Node.js 24 (сайт) + PostgreSQL (локально) + Ollama с моделью `anna-v1`.
- Копии базы — в S3 Timeweb Cloud (отдельный провайдер).
- Домены (Рег.ру): `мояфортуна.рф` основной = `xn--80axddamoif3i.xn--p1ai`; `мояфортуна.com` = `xn--80axddamoif3i.com`, 301 на основной.
- Письма: Unisender Go, отправитель `no-reply@мояфортуна.рф`.

## Шаги

1. Пользователь присылает IP (уже статический) — проверить вход по ключу.
2. DNS в Рег.ру для обоих доменов: A `@` и A `www` на IP. Подсказать, где это в кабинете.
3. Базовая защита: обновления, отдельный пользователь `anna`, вход только по ключу (без пароля и root), firewall (22, 80, 443), fail2ban, автообновления безопасности.
4. PostgreSQL локально: база и пользователь `anna`, слушает только `127.0.0.1`.
5. Node.js 24, код в `/opt/anna-site` (git clone `main`), `npm ci --omit=dev`.
6. `/etc/anna/site.env` по `deploy/env.example` (права 600). Секреты (`AUTH_CODE_SECRET`, пароль базы, ключ Unisender, коды Вебмастера) вставляет пользователь сам — дать команду для редактирования. `DATABASE_URL=postgres://anna:…@127.0.0.1:5432/anna`, `OLLAMA_URL` не задавать.
7. Ollama: установить, слушает только `127.0.0.1`, `OLLAMA_NUM_PARALLEL=4`, `OLLAMA_MAX_LOADED_MODELS=1`. Перенести `D:\AnnaAI\models\merged\anna-v1-q8_0.gguf` и `Modelfile.anna-v1` через `scp`, `ollama create anna-v1`. На сайте `CHAT_LOCAL_MODEL=anna-v1`, `CHAT_MAX_CONCURRENT=4`.
8. Nginx по `deploy/nginx.example.conf` с punycode-именами; оба домена и `www` ведут на `https://xn--80axddamoif3i.xn--p1ai`. Сертификаты Let's Encrypt (certbot) на все четыре имени.
9. systemd: `deploy/anna-site.service`, `deploy/anna-daily.service` и `.timer`. Бэкап в `/var/backups/anna` и выгрузка в S3 Timeweb (rclone или aws-cli; ключи S3 вводит пользователь).
10. Проверка: `/api/health`, главная, `/karta-dnya`, регистрация с кодом, чат, `sitemap.xml`; перезагрузка сервера — всё поднимается само.
11. Unisender Go: пользователь добавляет домен, подсказать DNS-записи SPF/DKIM для Рег.ру.
12. Потом: Яндекс.Вебмастер и Google Search Console (коды в `YANDEX_VERIFICATION`, `GOOGLE_SITE_VERIFICATION`), отправить sitemap.

## Важно

- `deploy/*` писались под два сервера (Timeweb + Immers). Для одного сервера PostgreSQL ставится локально, WireGuard не нужен.
- Без `TRUST_PROXY=1`, `PUBLIC_URL=https://…` и `REQUIRE_PRIVACY_CONSENT=1` сервер в production не стартует — это нарочно.
- Регистрации на боевом сайте нужна галочка согласия (интерфейс — Codex, §9 `docs/codex-ui-tasks.md`). До этого проверять регистрацию запросом с `privacyConsent: true`.
- Документация: `docs/server-transfer.md`, `docs/infrastructure.md`, `docs/database.md`.
