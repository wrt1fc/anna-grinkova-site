# anna-v20 r4 — выделенная GPU без работающей v19

Пользователь2026-11-05 прямо попросил остановить работающую модель и начать
обучение. Это меняет предыдущий режим: Ollama полностью останавливается на
smoke/train/CPUmerge. anna-site и база не останавливаются, постоянный выбор
anna-v19 и learned invitations unset не меняется. Ответыv19 временно недоступны.
CPU serving, его прогрев и проверка скорости ответа в этой попытке не запускаются.

Root /home/ubuntu/natal-training-v20-r4, unit anna-v20-r4-training.service.
ENV ANNA_TRAINING_SERVING_MODE=offline, ANNA_TRAINING_ROOT/UNIT указываютr4.
Одна новая попытка от исходногоv19,1эпохаLR3e-6,rank16,batch1,gradaccum8,
half_embedding. Не продолжение smoke или незавершённых весов: v20/r2/r3
остановились до обучения. Их файлы/журналы не перезаписываются.
Данные1025train(931+94),246development,56controls(32открытых+24новых),
80натальных учителей сохранены, прежняя манера/system18/reference19/style19.
Подробный план по данным: repair-anna-v20-training.md.

Pipeline делает CPUtoken/prefix audit, проверенный reuse8baseline/parent
отчётовv10/v19 из первой попытки, backup SHA, затем stopOllama и проверку
пустого спискаGPUcompute процессов.10 шагов backward/optimizer smoke,
allocated<9GiB/reserved<9.6GiB. Веса smoke не используются в полном обучении.
Max3400,reserve32,rejecttrue,nonthinking,completion_only_loss/require_prefix_match.

GPU только на сервере. Дваflock, один конвейер,6часовRuntimeMaxSec — предел,
не ETA. Сначала RAMlimit8GiB, перед CPUmerge14GiB/MemoryHigh11GiB. Ollama
остаётся выключенной и при CPUmerge, чтобы не занимать дополнительную память.
export-eval.sh включает её при регистрации отдельнойanna-v20 и затем делает
оценочные прогоны. EXITtrap и ExecStopPost в offline-режиме всегда запускают
Ollama при завершении/ошибке; CPU override не создаётся. При техническом
падении не повторять запуск без нового разрешения.

Проверки355candidateответов/raw, каждыйid/регрессиикv10иv19,конечныеloss,
mask/meta/smoke/backup и обаhealth обязательны. RuntimefactguardOFF в оценке;
резервные ответы не считаются успешной генерацией. Результат отчёта явно
указывает serving-mode=offline и период недоступностиv19.
Итоги after-train-anna-v20-r4.{md,txt,json},reviewed-after-train-anna-v20-r4.*,
metadata и полезные детали сохраняются в D:/AnnaAI/reports.
Production после восстановления —v19; v20 не подключается автоматически.
Все ограничения открытых вопросов,24переформулировок,неполныхсмысловыхпаттернов,
справочника и syntheticdraft,неодобренныхАнной,сохраняются.100%небезошибочность.
