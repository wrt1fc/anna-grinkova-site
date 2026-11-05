#!/bin/bash
# One bounded candidate, preserving live v19 CPU serving during GPU training.
set -Eeuo pipefail
ROOT=${ANNA_TRAINING_ROOT:-/home/ubuntu/natal-training-v20}
UNIT=${ANNA_TRAINING_UNIT:-anna-v20-training.service}
SERVING_MODE=${ANNA_TRAINING_SERVING_MODE:-cpu}
case "$SERVING_MODE" in cpu|offline) ;; *) exit 64 ;; esac
PARENT=/home/ubuntu/natal-training-v19/anna-v19
PY=/home/ubuntu/natal-bench/venv/bin/python
BACKUP=/home/ubuntu/model-backups/anna-v10-before-learning-v11-20261102
KNOWLEDGE=/home/ubuntu/natal-training-v4/knowledge
CPU_WINDOW="$ROOT/eval-code/training/server/v20-cpu-window.py"
exec 9>"$ROOT/reports/pipeline.lock"; flock -n 9 || exit 73
exec 8>/home/ubuntu/anna-training-gpu.lock; flock -n 8 || exit 73
STAGE=preflight
restore_serving() { if [ "$SERVING_MODE" = offline ]; then sudo -n systemctl start ollama; else sudo -n /usr/bin/python3 "$CPU_WINDOW" restore; fi; }
cleanup() { result=$?; trap - EXIT; restore_serving >> "$ROOT/reports/serving-restore.log" 2>&1 || result=75; if [ "$result" -ne 0 ]; then printf 'FAILED stage=%s code=%s %s\n' "$STAGE" "$result" "$(date -Is)" > "$ROOT/reports/status.txt"; fi; exit "$result"; }
trap cleanup EXIT
trap 'exit 143' TERM INT
stage() { STAGE=$1; printf 'RUNNING %s %s\n' "$STAGE" "$(date -Is)" > "$ROOT/reports/status.txt"; }
run_check() { local code=0; "$@" || code=$?; test "$code" -le 1; }
export HF_HOME=/home/ubuntu/natal-bench/hf HF_HUB_OFFLINE=1 PYTHONUNBUFFERED=1 OMP_NUM_THREADS=4
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True CHAT_LEARNING_SIGNALS=1 ANNA_EVAL_DATE=2026-11-02 ANNA_TRAINING_PROMPT_VERSION=18 ANNA_REFERENCE_KNOWLEDGE=19
unset CHAT_FACT_GUARD
export ANNA_METHODICS_FILE="$ROOT/methodics.json" ANNA_METHODICS_SHA256=16089c6fb654a2e81c451094b5d85eda65d6692002dcbf281a1ea90f918de06e
test ! -e "$ROOT/anna-v20/adapter_model.safetensors"
test -s "$BACKUP/BACKUP_COMPLETE"
test "$(df --output=avail -BG "$ROOT" | tail -1 | tr -dc 0-9)" -ge 30
test "$(sha256sum "$PARENT/adapter_model.safetensors" | cut -d' ' -f1)" = 309fb7c9b9f90fe691f41dbea4f00b37232dc54d1efedfd725a0174495820325
cd "$ROOT"; sha256sum -c input-sha256.txt > reports/input-check.log
cd "$ROOT/eval-code"
stage token-preflight
USE_TORCH=0 "$PY" training/count-learning-tokens.py "$ROOT/data" "$ROOT/reports/token-counts.json" 3400 > "$ROOT/reports/token-preflight.log" 2>&1
stage completion-mask-preflight
USE_TORCH=0 "$PY" training/audit_completion_mask.py "$ROOT/data" "$ROOT/reports/completion-mask-audit.json" > "$ROOT/reports/completion-mask-audit.log" 2>&1
USE_TORCH=0 "$PY" training/prepare-memory-smoke.py "$ROOT/data" "$ROOT/smoke-data" > "$ROOT/reports/memory-smoke-plan.json" 2>&1
if [ -n "${ANNA_BASELINE_REUSE_ROOT:-}" ]; then
 stage baseline-integrity-reuse
 node training/reuse-v20-baselines.mjs "$ANNA_BASELINE_REUSE_ROOT" "$ROOT" > "$ROOT/reports/baseline-reuse.log" 2>&1
else
for pair in 'anna-v10 baseline' 'anna-v19 parent'; do
 read -r model prefix <<< "$pair"
 stage "$prefix-learning"; run_check node training/eval-learning.mjs "$model" "$ROOT/cards.jsonl" "$ROOT/reports/$prefix-learning" > "$ROOT/reports/$prefix-learning.log" 2>&1
 stage "$prefix-fresh"; run_check node training/eval-learning.mjs "$model" "$ROOT/holdout.jsonl" "$ROOT/reports/$prefix-fresh" > "$ROOT/reports/$prefix-fresh.log" 2>&1
 stage "$prefix-natal"; run_check node training/eval-natal.js "$model" "$ROOT/natal-plan.json" "$ROOT/reports/$prefix-natal.md" --knowledge "$KNOWLEDGE" > "$ROOT/reports/$prefix-natal.log" 2>&1
 stage "$prefix-chat"; run_check node training/eval-chat.js "$model" "$ROOT/reports/$prefix-chat.md" > "$ROOT/reports/$prefix-chat.log" 2>&1
done
fi
stage backup-check
(cd "$BACKUP" && sha256sum -c SHA256SUMS) > "$ROOT/reports/backup-check.log" 2>&1
printf '{"mode":"%s","productionModel":"anna-v19","automaticDeployment":false}\n' "$SERVING_MODE" > "$ROOT/reports/serving-mode.json"
if [ "$SERVING_MODE" = offline ]; then
 stage dedicated-gpu-window
 sudo -n systemctl stop ollama
 sleep 3
 test -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader)"
 stage memory-smoke
 "$PY" training/train_lora.py --base Qwen/Qwen3.5-4B --data "$ROOT/smoke-data" --out "$ROOT/smoke-adapter" --init-adapter "$PARENT" --max-steps 10 --lr 3e-6 --max-length 3400 --reject-truncation --require-prefix-match --grad-accum 1 --half-embedding --timing --logging-steps 1 > "$ROOT/reports/memory-smoke.log" 2>&1
else
stage cpu-serving-window
sudo -n /usr/bin/python3 "$CPU_WINDOW" enable > "$ROOT/reports/cpu-serving-window.json" 2>&1
CHAT_LEARNING_SIGNALS=0 CHAT_MODEL_PROTOCOL=19 CHAT_FACT_GUARD=1 node training/server/v20-serving-probe.mjs "$ROOT/reports/cpu-serving-before-load.json" > "$ROOT/reports/cpu-serving-before-load.log" 2>&1
test -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader)"
stage memory-smoke
"$PY" training/train_lora.py --base Qwen/Qwen3.5-4B --data "$ROOT/smoke-data" --out "$ROOT/smoke-adapter" --init-adapter "$PARENT" --max-steps 10 --lr 3e-6 --max-length 3400 --reject-truncation --require-prefix-match --grad-accum 1 --half-embedding --timing --logging-steps 1 > "$ROOT/reports/memory-smoke.log" 2>&1 &
smoke_pid=$!
for _ in $(seq 1 90); do
 grep -q '^STEP 1 ' "$ROOT/reports/memory-smoke.log" && break
 kill -0 "$smoke_pid" 2>/dev/null || break
 sleep 2
done
grep -q '^STEP 1 ' "$ROOT/reports/memory-smoke.log" || { kill "$smoke_pid" || true; wait "$smoke_pid" || true; exit 77; }
CHAT_LEARNING_SIGNALS=0 CHAT_MODEL_PROTOCOL=19 CHAT_FACT_GUARD=1 node training/server/v20-serving-probe.mjs "$ROOT/reports/cpu-serving-under-load.json" > "$ROOT/reports/cpu-serving-under-load.log" 2>&1 || { kill "$smoke_pid" || true; wait "$smoke_pid" || true; exit 76; }
wait "$smoke_pid"
fi
"$PY" training/check-memory-smoke.py "$ROOT/smoke-adapter/anna-training.json" > "$ROOT/reports/memory-smoke-result.json"
stage training
"$PY" training/train_lora.py --base Qwen/Qwen3.5-4B --data "$ROOT/data" --out "$ROOT/anna-v20" --init-adapter "$PARENT" --epochs 1 --lr 3e-6 --max-length 3400 --reject-truncation --require-prefix-match --grad-accum 8 --half-embedding --timing --eval-first --logging-steps 1 > "$ROOT/reports/train.log" 2>&1
if [ "$SERVING_MODE" = cpu ]; then
 stage restore-gpu-serving
 restore_serving > "$ROOT/reports/serving-restore.log" 2>&1
fi
# In offline mode export-eval restores Ollama after CPU merge/conversion,
# preserving RAM for the merge and keeping it off throughout GPU training.
sudo -n systemctl set-property --runtime "$UNIT" MemoryHigh=11G MemoryMax=14G
stage export-and-regression
bash training/server/export-eval.sh v20 "$KNOWLEDGE" natal-plan.json > "$ROOT/reports/export.log" 2>&1
test "$(cat "$ROOT/reports/eval-natal-anna-v20.exit")" -le 1
test "$(cat "$ROOT/reports/eval-chat-anna-v20.exit")" -le 1
stage candidate-learning
run_check node training/eval-learning.mjs anna-v20 "$ROOT/cards.jsonl" "$ROOT/reports/learning" > "$ROOT/reports/learning.log" 2>&1
stage candidate-fresh
run_check node training/eval-learning.mjs anna-v20 "$ROOT/holdout.jsonl" "$ROOT/reports/fresh" > "$ROOT/reports/fresh.log" 2>&1
stage final-integrity
sha256sum "$ROOT/anna-v20-q8_0.gguf" "$ROOT/anna-v20/adapter_model.safetensors" > "$ROOT/reports/candidate-sha256.txt"
(cd "$BACKUP" && sha256sum -c SHA256SUMS) > "$ROOT/reports/backup-final-check.log" 2>&1
test "$(sha256sum "$PARENT/adapter_model.safetensors" | cut -d' ' -f1)" = 309fb7c9b9f90fe691f41dbea4f00b37232dc54d1efedfd725a0174495820325
curl -fsS --max-time 15 http://127.0.0.1:3000/api/health > "$ROOT/reports/site-health.json"
curl -fsS --max-time 20 https://xn--80axddamoif3i.xn--p1ai/api/health > "$ROOT/reports/public-health.json"
stage report
node training/report-repair-v20.mjs "$ROOT" > "$ROOT/reports/final-summary.log" 2>&1
