# Чат «Модель Анны»

**Модель:** Sonnet 5.5. **Рабочая папка:** `E:\ai-site-intl`.

## Как начать

> Прочитай `docs/sessions/02-anna-model.md`. Правки Анны: `<путь к файлу>`. Собери датасет и обучи следующую версию.

## Где что

- Всё вне git — `D:\AnnaAI`:
  - `data\dataset\cards.jsonl` — карточки «вопрос — ответ» (черновики), `cards-methodics.jsonl` — 103 черновика по методичке (генератор `methodics-cards.mjs`), `voice-questions.json` — вопросы для проверки;
  - `knowledge\methodics\*.md` — методички для поиска в чате (из PDF курса «Квантовый скачок PRO», конвертер `D:\AnnaAI\tmp\to_md.py`; лекции 8–10 исключены, грубые слова и рискованные советы вычищены);
  - `adapters\anna-v1` — текущий адаптер; `models\merged\anna-v1-q8_0.gguf` — модель для Ollama;
  - `reports\` — журналы обучения и сравнения (`compare-models-v1.md` — последнее);
  - `venvs\train` — Python для обучения, `tools\llama.cpp` — конвертер GGUF.
- В репозитории: `training/` (README, `build-dataset.js`, `train_lora.py`, `merge_adapter.py`, `export_ollama.ps1`, `eval-chat.js`, `validate-cards.js`), `server/chat-grounding.js`, `server/anna-method.js`, `config/chat-context.json` (правила чата, v11).

## Состояние

- `anna-v1`: лучшая — первая эпоха (eval_loss 1,67), 16/16 контрольных вопросов. Манера Анны есть, по деньгам отвечает по расчёту и её словам; встречаются смысловые огрехи — нужны одобренные Анной ответы. В чат на сайте пока не включена.
- Видеокарта ПК: RTX 3050 8 ГБ, обучение ~2,5 мин/шаг. На боевом сервере RTX 2080 Ti.

## Порядок нового обучения

1. Принять правки Анны: обновить `status` карточек (`approved`/`rejected`), проверить `node training/validate-cards.js <файл>`.
2. `node training/build-dataset.js <cards.jsonl>,<cards-methodics.jsonl> D:/AnnaAI/data/dataset/build-v2 --knowledge D:/AnnaAI/knowledge --holdout 0.08` (без `--include-drafts`, когда одобренных достаточно).
3. `train_lora.py … --epochs 1` (см. `training/README.md`); лучшая эпоха сохраняется сама.
4. `powershell -File scripts/start-local-ollama.ps1`, затем `powershell -File training/export_ollama.ps1 -Name anna-v2 -Adapter D:\AnnaAI\adapters\anna-v2`.
5. `node training/eval-chat.js anna-v2` и сравнение с `anna-v1` (по образцу `compare-models-v1.md`).
6. Если лучше — перенести GGUF на сервер, `CHAT_LOCAL_MODEL=anna-v2`. Остановить Ollama на ПК.

## Открытые вопросы к Анне

- Какая финансовая стратегия при перевесе воздуха и при равенстве стихий?
- Что значит «работает на два дома» в инструкции по управителю 2 дома?
- Сверить телефоны кризисных линий в `config/crisis.json`, утвердить цены.

## Правила

- Карточки не должны нарушать проверки чата (`server/chat-safety.js`): Анна от первого лица, цены, ссылки, даты, гарантии.
- Без советов про кредиты, развод, алкоголь и т. п.
- «Сильные объекты» и «Формулы домов» Chronos не воспроизводим (закрытый алгоритм).
