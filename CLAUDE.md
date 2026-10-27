# Сайт Анны Гриньковой — контекст для Claude

Сайт астропсихолога Анны Гриньковой (Институт прогрессивной психологии): карта дня таро, прогноз на неделю, личный кабинет, близкие люди на тарифах, чат с моделью в манере Анны, оплата из России и из-за рубежа. Пользователь — разработчик проекта; заказчик — Анна. Отвечать по-русски, просто, без лишних технических подробностей, когда речь о решениях для заказчика.

Брифы для отдельных чатов по направлениям — `docs/sessions/`. Один чат — одна задача.

## Код и ветки

- Репозиторий: https://github.com/wrt1fc/anna-grinkova-site, основная ветка `main`.
- Рабочие копии (git worktree):
  - `E:\ai сайт` — `main`;
  - `E:\ai-site-intl` — `feat/intl-payments`, сервер и модель (Claude);
  - `E:\ai-site-codex` — `feat/account-payments`, интерфейс (перенос дизайна из Figma, Claude).
- После работы: тесты, коммит в свою ветку, fast-forward остальных двух, push всех трёх (`git -C "E:\ai сайт" push origin main feat/account-payments feat/intl-payments`).
- **Дизайн ведётся только в Figma** (https://www.figma.com/design/BggW2QztAkK0GdWCSrHOKy/, «Анна Гринькова — сайт и UI-kit»): это единственный источник правды, расхождение сайта с макетом считается ошибкой сайта. Сайт (`prototype/`, HTML/CSS/JS) переносит из макета Claude. Codex с 21.10.2026 в проекте не участвует (решение пользователя); `docs/codex-ui-tasks.md` остался как описание API для интерфейса. `docs/site-copy.md` — черновик текстов, при расхождении с Figma верен Figma. Не менять `prototype/sw.js`, `prototype/pwa.js`, `manifest.webmanifest` и служебное в `<head>` (SEO, PWA), кроме нового адреса страницы.

## Стек

- Node.js 24, `node:http`, без фреймворков. `npm start`, `npm test` (`node --test`, 150 тестов — все должны проходить).
- PostgreSQL: на сервере `DATABASE_URL=postgres://…`; локально без настройки — PGlite в `data/pglite`; в тестах `pglite:memory`. Схема — миграции в `server/schema.js` (новые только в конец).
- Расчёты: Astronomy Engine (`server/astro-chart.js`, дома Плацидус, сверено с Sotis), методика Анны — `server/anna-method.js`.
- Модель: Qwen3.5-4B + LoRA-адаптер `anna-v1`, работает в Ollama (`OLLAMA_URL`, по умолчанию `http://127.0.0.1:11434`). Чат и прогноз дня работают и без модели (расчётный текст).
- Настройки — `deploy/env.example`. На боевом сервере обязательны `TRUST_PROXY=1`, `PUBLIC_URL=https://…`, `REQUIRE_PRIVACY_CONSENT=1`.

## Локальная среда (Windows)

- Диск **C: почти полный** — ничего туда не писать. Для команд: `TMPDIR=E:/ai-site-intl-tmp`, кэш npm — `D:/AnnaAI/tmp/npm`, `HF_HOME=D:\AnnaAI\models\hf`.
- Всё про модель — в `D:\AnnaAI` (вне git, там платные методички и личные данные): `runtime\ollama.exe`, `models\`, `adapters\`, `data\dataset\` (карточки), `knowledge\methodics\` (методички для поиска), `reports\`, `venvs\train`, `tools\llama.cpp`.
- Ollama не держать запущенной без дела: `powershell -File scripts/start-local-ollama.ps1`.

## Принятые решения

- **Хостинг (экономный вариант):** один сервер Immers.cloud, Москва, `rtx2080ti-1.10.16.500` (RTX 2080 Ti 11 ГБ, 10 vCPU, 16 ГБ, 500 ГБ Local), Ubuntu 26.04 CUDA. На нём сайт, PostgreSQL и Ollama. Копии базы — в S3 Timeweb Cloud. A10 и A2 были заняты.
- **Домены:** `мояфортуна.рф` — основной (`xn--80axddamoif3i.xn--p1ai`), `мояфортуна.com` — перенаправление на него. Куплены в Рег.ру.
- **Доступ к серверу:** `ssh -i ~/.ssh/anna_site_ed25519 ubuntu@195.209.219.31`; защита — `docs/server-security.md`. SSH-ключ `~/.ssh/anna_site_ed25519` (открытая часть добавлена через cloud-init). Пароли и секреты пользователь вводит сам в `/etc/anna/site.env`, Claude их не запрашивает.
- **152-ФЗ:** все данные в России, одна база для всех; за рубеж уходят только письма на зарубежные ящики через Brevo (после уведомления в РКН). Согласие при регистрации хранится с версией политики (`config/legal.json`).
- **Оплата:** ЮKassa (РФ, рубли) и Robokassa (иностранные карты, USD/EUR) — код готов, подключать после юрлица и документов. Цены черновые (`config/products.json`), утверждает Анна.
- **Письма с кодами:** Unisender Go (РФ), Brevo (зарубежные ящики, позже).
- **Адреса страниц:** `/`, `/karta-dnya`, `/prognoz-na-nedelyu`, `/chat`, `/kabinet` (`config/seo.json`).

## Правила

- Перед словами «готово», «работает» — запустить тесты или проверить вживую.
- Не коммитить секреты, `data/`, методички и материалы из `D:\AnnaAI`.
- В интерфейсе не писать «ИИ», «нейросеть», «модель».
- Сообщения коммитов: `feat:`/`fix:`/`docs:` + строка `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Новый интерфейс (27.10.2026)

Сайт полностью заменён мини-приложением из Figma «08 · Мини-приложение» (`prototype/miniapp/`, HTML/CSS/JS-модули). Оно открывается на `/` и на старых адресах (`/karta-dnya`, `/chat`, `/kabinet`, `/podpiska`, `/natalnaya-karta`, `/prognoz-na-nedelyu`, `/rasklad` ведут на нужный экран); `/miniapp/` — дубль. Старый интерфейс (`prototype/index.html`, `app.js`, `styles.css` и др.) остался в репозитории, но не отдаётся; удалить после проверки.
