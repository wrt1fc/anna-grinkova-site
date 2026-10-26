# Обучение модели на сервере

Инструкция по дообучению помощника Анны (Qwen3.5-4B + LoRA-адаптер) на боевом сервере с видеокартой.
Последний раз по ней обучалась `anna-v5` (26.10.2026). Что и зачем делает каждый шаг — в тексте; команды можно копировать.

## Где что лежит

| Что | Где |
|---|---|
| Сервер | `ssh -i ~/.ssh/anna_site_ed25519 ubuntu@195.209.219.31` (RTX 2080 Ti 11 ГБ, 10 vCPU, 16 ГБ ОЗУ, диск 469 ГБ) |
| Python-окружение для обучения | `/home/ubuntu/natal-bench/venv` (torch 2.6, peft, trl, transformers, bitsandbytes) |
| Кэш базовой модели Qwen3.5-4B | `/home/ubuntu/natal-bench/hf` (работаем без интернета: `HF_HUB_OFFLINE=1`) |
| Рабочая папка версии | `/home/ubuntu/natal-training-vN/` (N — номер версии) |
| Конвертер в GGUF | `/home/ubuntu/natal-training-v4/converter` |
| Материалы Анны для поиска | `/home/ubuntu/natal-training-v4/knowledge` (методички, вне Git) |
| Адаптеры прошлых версий | `natal-training-v4/anna-v4`, `natal-training-v5/anna-v5`; v3: `natal-bench/adapter` |
| Сайт | `/opt/anna-site`, настройки `/etc/anna/site.env` |

Внутри папки версии:

```
data/train.jsonl, data/eval.jsonl   обучающие и контрольные примеры (собираются на ПК)
eval-code/                          код этого репозитория (server/, config/, training/) и node_modules → /opt/anna-site/node_modules
natal-plan-eval-vN.json             контрольные натальные вопросы
anna-vN/                            готовый адаптер
merged-vN/, anna-vN-q8_0.gguf       слитая модель и её GGUF
reports/                            журналы и отчёты (status.txt — на каком шаге процесс)
```

## Важные ограничения этой видеокарты

- **11 ГБ памяти.** Модель в 4 битах + ответы до 3400 токенов помещаются только с флагом `--half-embedding` (таблица слов в FP16, веса LoRA в FP32). Пиковое использование около 6,6 ГБ.
- **BF16 нет** (RTX 2080 Ti — Turing). PyTorch «поддерживает» его через эмуляцию, и обучение становится в разы медленнее: поэтому в коде проверка `is_bf16_supported(including_emulation=False)`.
- **Обучение занимает видеокарту целиком.** Ollama при этом нужно остановить, и чат на сайте временно отвечает расчётным текстом без модели. Планируйте окно на 1,5–2 часа, лучше ночью.
- Лимит длины 3400 токенов не уменьшать: при 2048 длинные натальные ответы обрезаются до пустого ответа.
- Скорость: около 60 секунд на шаг (8 примеров); 330 примеров × 2 эпохи ≈ 84 шага ≈ 1,5 часа.

## Шаг 1. Подготовить данные на своём компьютере

Данные и методички лежат вне Git (`D:\AnnaAI`), команды выполняются в папке репозитория.

1. **План вопросов и карт** (воспроизводится по числу `seed`, карты не повторяют прошлые):
   ```bash
   node training/natal-plan.mjs E:/ai-site-intl-tmp/natal-plan-v5.json --round v5 --avoid E:/ai-site-intl-tmp/natal-plan.json
   ```
   Для новой версии добавьте раунд в `training/natal-plan.mjs` и `KIND_ORDER_V*` в `training/natal-lib.js`.
2. **Рабочие листы** (то, что модель увидит: планеты, дома, аспекты, деньги, слайды Анны), по 12 вопросов:
   ```bash
   node training/natal-plan.mjs E:/ai-site-intl-tmp/natal-plan-v5.json --worksheet 1 --size 12 --knowledge D:/AnnaAI/knowledge
   ```
3. **Ответы** пишутся вручную строго по расчёту, блоками `=== <id>` в текстовом файле (примеры — `E:\ai-site-intl-tmp\drafts\batch-v5-*.txt`). Манера: «Смотрите, …», показатель → жизненная ситуация → один шаг; без обещаний исхода; в тревожных темах совет обратиться к психологу.
4. **Импорт с проверкой** (длина, персональные данные, правила чата и сверка каждого утверждения с расчётом: планета в знаке и доме, аспекты, ретроградность):
   ```bash
   node training/import-natal.mjs E:/ai-site-intl-tmp/natal-plan-v5.json E:/ai-site-intl-tmp/drafts/batch-v5-01.txt E:/ai-site-intl-tmp/cards-natal-v5.jsonl
   ```
   Ответы с ошибками не записываются, скрипт перечисляет причины.
5. **Сборка датасета.** Склейте карточки прошлой версии и новые в один файл (`D:\AnnaAI\data\dataset\cards-vN.jsonl`; несколько последних карт нового набора помечаются `"split": "eval"` для контроля потерь), затем:
   ```bash
   node training/build-dataset.js D:/AnnaAI/data/dataset/cards-v5.jsonl D:/AnnaAI/data/dataset/build-v5 --include-drafts --knowledge D:/AnnaAI/knowledge
   ```
   Запросы собираются теми же функциями, что и боевой чат, поэтому датасет всегда строится **из актуального кода** (ветка `main`): если менялись `config/chat-context.json` или `server/local-chat.js`, пересобирайте весь набор.
6. **Контрольные вопросы**: объедините вопросы `eval` из планов в один файл (`natal-plan-eval-vN.json`). Это карты, которых нет в обучении.

## Шаг 2. Подготовить папку версии на сервере

```bash
K=~/.ssh/anna_site_ed25519; H=ubuntu@195.209.219.31
tar -czf /e/ai-site-intl-tmp/vN-eval-code.tgz --exclude=__pycache__ server config training package.json package-lock.json
ssh -i $K $H "mkdir -p /home/ubuntu/natal-training-vN/{data,reports,eval-code}"
scp -i $K /e/ai-site-intl-tmp/vN-eval-code.tgz $H:/home/ubuntu/natal-training-vN/
scp -i $K /d/AnnaAI/data/dataset/build-vN/{train,eval}.jsonl $H:/home/ubuntu/natal-training-vN/data/
scp -i $K /e/ai-site-intl-tmp/natal-plan-eval-vN.json $H:/home/ubuntu/natal-training-vN/
ssh -i $K $H "cd /home/ubuntu/natal-training-vN && tar -xzf vN-eval-code.tgz -C eval-code && ln -sfn /opt/anna-site/node_modules eval-code/node_modules && chmod +x eval-code/training/server/*.sh"
```

В Git Bash пути к файлам пишите как `/e/...`, а не `E:/...`: `tar` и `scp` принимают `E:` за имя сервера.

## Шаг 3. (по желанию) Измерить прежнюю модель на тех же вопросах

Пока Ollama работает, прогоните прошлую версию по новому набору контрольных вопросов; это точка отсчёта для сравнения:

```bash
ssh -i $K $H "cd /home/ubuntu/natal-training-vN/eval-code && node training/eval-natal.js anna-v4 ../natal-plan-eval-vN.json ../reports/eval-natal-anna-v4-base.md --knowledge /home/ubuntu/natal-training-v4/knowledge"
```

## Шаг 4. Обучение

```bash
ssh -i $K $H "sudo systemctl stop ollama"          # освобождает видеокарту; чат на сайте временно без модели
ssh -i $K $H "cd /home/ubuntu/natal-training-vN && (nohup bash eval-code/training/server/train.sh vN /home/ubuntu/natal-training-v4/anna-v4 2 3e-5 > reports/train-wrapper.log 2>&1 < /dev/null &)"
```

Параметры `train.sh`: версия, **адаптер, с которого продолжаем**, число эпох (по умолчанию 2), скорость обучения (по умолчанию `3e-5`; v4 учили с `5e-5` от v3). Скрипт сам откажется стартовать, если Ollama держит видеокарту.

Наблюдать:

```bash
ssh -i $K $H "cat /home/ubuntu/natal-training-vN/reports/status.txt; grep STEP /home/ubuntu/natal-training-vN/reports/train.log | tail -3"
```

- В начале в журнале есть строка `EVAL_BEFORE {'eval_loss': …}` — потери продолжаемого адаптера на контрольных примерах (точка отсчёта).
- После каждой эпохи считается `eval_loss`; в итоге сохраняется эпоха с **наименьшим** значением.
- `grad_norm: nan` на самом первом шаге — норма для FP16 (подбирается масштаб); если `nan` держится на всех шагах, обучение остановите и проверьте данные.
- Статус `TRAINING_COMPLETE` значит, что адаптер записан в `anna-vN/`; `FAILED …` — смотрите конец `reports/train.log` (чаще всего память: убедитесь, что Ollama остановлена и `nvidia-smi` показывает почти пустую карту).

## Шаг 5. Экспорт в Ollama и контрольные прогоны

```bash
ssh -i $K $H "cd /home/ubuntu/natal-training-vN && (nohup bash eval-code/training/server/export-eval.sh vN /home/ubuntu/natal-training-v4/knowledge natal-plan-eval-vN.json > reports/export-wrapper.log 2>&1 < /dev/null &)"
```

Скрипт сливает адаптер с базовой моделью (около 10 ГБ ОЗУ, на процессоре), конвертирует в GGUF q8_0, создаёт модель `anna-vN` в Ollama (запускает Ollama сам) и прогоняет проверки. Занимает 15–30 минут. Итоги: `reports/eval-natal-anna-vN.md` (натальные вопросы), `reports/eval-chat-anna-vN.md` (общий чат), коды завершения `*.exit` (0 — всё прошло, 1 — есть непрошедшие ответы). Необязательный параметр `REPEAT_PENALTY=1.05 bash …` добавляет в модель штраф за повторы.

Что считать результатом:

- автоматические проверки: ответ не противоречит расчёту (знак, дом, аспект, ретроградность), нет повторов предложений, нет слов «ИИ», нужная длина, нет обещаний; в отчёте также видно, сколько ответов потребовали **повторного запроса** к модели (значит, она сама повторилась или ошиблась знаком, и защита чата исправила это);
- **этого мало.** Проверки ловят ошибки, но не качество трактовки. Перед включением на сайте Анна читает 10–15 ответов (`natal-anna-vN-for-anna.txt`, собирается из отчёта командой `node training/report-for-anna.mjs reports/eval-natal-anna-vN.md natal-anna-vN-for-anna.txt --title anna-vN`).

## Шаг 6. Включить новую модель на сайте или откатить

Включает только владелец проекта после просмотра ответов Анной.

```bash
ssh -i $K $H "sudo sed -i 's/^CHAT_LOCAL_MODEL=.*/CHAT_LOCAL_MODEL=anna-vN/' /etc/anna/site.env && sudo systemctl restart anna-site"
```

Откат — та же команда с прежним именем модели (например, `anna-v4`); старые модели остаются в Ollama (`ollama list`). Ollama после обучения должна быть запущена: `sudo systemctl start ollama`.

## Журнал версий

| Версия | Дата | Что в данных | Результат |
|---|---|---|---|
| anna-v1 | 08.10.2026 | эфир Анны, 300 карточек черновиков | 16/16 общий чат |
| anna-v2 | 21.10.2026 | + Таро-расклады | чат 16/16; расклады 12/18 |
| anna-v3 | 22.10.2026 | + чувствительные темы Таро | расклады 18/19; на натальных вопросах ошибки знаков |
| anna-v4 | 25.10.2026 | 242 примера: натальные, денежная методика, немного общего чата; без Таро | 12/12 натальных, чат 16/16; один ответ с тройным повтором |
| anna-v5 | 26.10.2026 | 332 примера: v4 + 96 новых (партнёр, самооценка, срывы, Северный узел, Венера, Марс, MC, страх не справиться, ретроград) на 48 новых картах | см. отчёт ниже |

Результаты v5 дописываются в этот раздел после проверок.
