#!/bin/bash
# One separate v26 candidate from immutable v19. Never changes the selected production model.
set -Eeuo pipefail
ROOT=/home/ubuntu/natal-training-v26-r1
PY=/home/ubuntu/natal-bench/venv/bin/python
PARENT=/home/ubuntu/natal-training-v19/anna-v19
PARENT_SHA=309fb7c9b9f90fe691f41dbea4f00b37232dc54d1efedfd725a0174495820325
OVERRIDE=/run/systemd/system/anna-site.service.d/90-training-v26.conf
RESTORE="$ROOT/eval-code/training/server/restore-v26-serving.sh"
KNOWLEDGE=/home/ubuntu/natal-training-v4/knowledge
exec 9>"$ROOT/reports/pipeline.lock"; flock -n 9 || exit 73
exec 8>/home/ubuntu/anna-training-gpu.lock; flock -n 8 || exit 73
STAGE=preflight
cleanup() {
  result=$?; trap - EXIT
  sudo -n /bin/bash "$RESTORE" >> "$ROOT/reports/serving-restore.log" 2>&1 || result=75
  if [ "$result" -ne 0 ]; then printf 'FAILED stage=%s code=%s %s\n' "$STAGE" "$result" "$(date -Is)" > "$ROOT/reports/status.txt"; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 143' TERM INT
stage() { STAGE=$1; printf 'RUNNING %s %s\n' "$STAGE" "$(date -Is)" > "$ROOT/reports/status.txt"; }
run_check() { local code=0; "$@" || code=$?; test "$code" -le 1; }
export HF_HOME=/home/ubuntu/natal-bench/hf HF_HUB_OFFLINE=1 PYTHONUNBUFFERED=1 OMP_NUM_THREADS=8 MKL_NUM_THREADS=8
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True CHAT_LEARNING_SIGNALS=1 CHAT_MODEL_PROTOCOL=19 ANNA_EVAL_DATE=2026-11-09 ANNA_TRAINING_PROMPT_VERSION=18 ANNA_REFERENCE_KNOWLEDGE=19
export ANNA_METHODICS_FILE="$ROOT/methodics.json" ANNA_METHODICS_SHA256=16089c6fb654a2e81c451094b5d85eda65d6692002dcbf281a1ea90f918de06e
export CHAT_FACT_GUARD=0 ANNA_CHART_FOCUS=26
cd "$ROOT/eval-code"
test ! -e "$ROOT/anna-v26/adapter_model.safetensors"
test ! -e "$ROOT/anna-v26-q8_0.gguf"
test ! -e "$OVERRIDE"
test "$(sha256sum "$PARENT/adapter_model.safetensors" | cut -d' ' -f1)" = "$PARENT_SHA"
sha256sum "$PARENT/adapter_model.safetensors" > "$ROOT/reports/parent-before.sha256"
(cd "$ROOT" && sha256sum -c input-sha256.txt) > "$ROOT/reports/input-check.log"
stage token-preflight
USE_TORCH=0 "$PY" training/count-learning-tokens.py "$ROOT/data" "$ROOT/reports/token-counts.json" 4096 > "$ROOT/reports/token-preflight.log" 2>&1
stage completion-mask-preflight
USE_TORCH=0 "$PY" training/audit_completion_mask.py "$ROOT/data" "$ROOT/reports/completion-mask-audit.json" > "$ROOT/reports/completion-mask-audit.log" 2>&1
USE_TORCH=0 "$PY" training/prepare-memory-smoke.py "$ROOT/data" "$ROOT/smoke-data" 4096 > "$ROOT/reports/memory-smoke-plan.json" 2>&1
stage baseline-fresh
run_check node training/eval-learning.mjs anna-v19 "$ROOT/holdout.jsonl" "$ROOT/reports/parent-fresh" > "$ROOT/reports/parent-fresh.log" 2>&1
stage baseline-serving
CHAT_FACT_GUARD=1 run_check node training/eval-serving.mjs anna-v19 "$ROOT/holdout.jsonl" "$ROOT/reports/parent-serving" > "$ROOT/reports/parent-serving.log" 2>&1
stage baseline-chat
CHAT_LEARNING_SIGNALS=0 run_check node training/eval-chat.js anna-v19 "$ROOT/reports/parent-chat.md" > "$ROOT/reports/parent-chat.log" 2>&1
stage baseline-natal
CHAT_LEARNING_SIGNALS=0 run_check node training/eval-natal.js anna-v19 "$ROOT/natal-plan.json" "$ROOT/reports/parent-natal.md" --knowledge "$KNOWLEDGE" > "$ROOT/reports/parent-natal.log" 2>&1
stage dedicated-gpu-window
printf 'CHAT_LOCAL_MODEL=\nFORECAST_LOCAL_MODEL=\n' > "$ROOT/serving-disabled.env"
printf '[Service]\nEnvironmentFile=%s/serving-disabled.env\n' "$ROOT" > "$ROOT/runtime-disable.conf"
sudo -n mkdir -p /run/systemd/system/anna-site.service.d
sudo -n install -m 644 "$ROOT/runtime-disable.conf" "$OVERRIDE"
sudo -n systemctl daemon-reload
sudo -n systemctl restart anna-site
curl -fsS --retry 15 --retry-connrefused --retry-delay 1 --retry-max-time 30 --max-time 5 http://127.0.0.1:3000/api/health > "$ROOT/reports/site-health-during-training.json"
sudo -n systemctl stop ollama
for _ in $(seq 1 10); do
  test -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader)" && break
  sleep 1
done
test -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader)"
date -Is > "$ROOT/reports/model-unavailable-since.txt"
stage memory-smoke
"$PY" training/train_lora.py --base Qwen/Qwen3.5-4B --data "$ROOT/smoke-data" --out "$ROOT/smoke-adapter" --init-adapter "$PARENT" --max-steps 10 --lr 1e-5 --max-length 4096 --reject-truncation --require-prefix-match --grad-accum 1 --half-embedding --timing --logging-steps 1 > "$ROOT/reports/memory-smoke.log" 2>&1
"$PY" training/check-memory-smoke.py "$ROOT/smoke-adapter/anna-training.json" 4096 > "$ROOT/reports/memory-smoke-result.json"
stage training
"$PY" training/train_lora.py --base Qwen/Qwen3.5-4B --data "$ROOT/data" --out "$ROOT/anna-v26" --init-adapter "$PARENT" --epochs 2 --lr 1e-5 --max-length 4096 --reject-truncation --require-prefix-match --grad-accum 8 --half-embedding --timing --eval-first --logging-steps 1 > "$ROOT/reports/train.log" 2>&1
stage export-and-regression
CHAT_LEARNING_SIGNALS=0 bash training/server/export-eval.sh v26 "$KNOWLEDGE" natal-plan.json > "$ROOT/reports/export.log" 2>&1
test "$(cat "$ROOT/reports/eval-natal-anna-v26.exit")" -le 1
test "$(cat "$ROOT/reports/eval-chat-anna-v26.exit")" -le 1
stage candidate-learning
run_check node training/eval-learning.mjs anna-v26 "$ROOT/cards.jsonl" "$ROOT/reports/learning" > "$ROOT/reports/learning.log" 2>&1
stage candidate-fresh
run_check node training/eval-learning.mjs anna-v26 "$ROOT/holdout.jsonl" "$ROOT/reports/fresh" > "$ROOT/reports/fresh.log" 2>&1
stage candidate-serving
CHAT_FACT_GUARD=1 run_check node training/eval-serving.mjs anna-v26 "$ROOT/holdout.jsonl" "$ROOT/reports/serving" > "$ROOT/reports/serving.log" 2>&1
stage exposed-regression
CHAT_FACT_GUARD=1 run_check node training/eval-serving.mjs anna-v26 "$ROOT/regression.jsonl" "$ROOT/reports/exposed-regression" > "$ROOT/reports/exposed-regression.log" 2>&1
stage final-integrity
sha256sum -c "$ROOT/reports/parent-before.sha256" > "$ROOT/reports/parent-final-check.log"
sha256sum "$ROOT/anna-v26/adapter_model.safetensors" "$ROOT/anna-v26-q8_0.gguf" > "$ROOT/reports/candidate-sha256.txt"
node training/report-repair-v26.mjs "$ROOT" > "$ROOT/reports/final-summary.log" 2>&1
sudo -n /bin/bash "$RESTORE" >> "$ROOT/reports/serving-restore.log" 2>&1
curl -fsS --max-time 15 http://127.0.0.1:3000/api/health > "$ROOT/reports/site-health.json"
curl -fsS --max-time 20 https://xn--80axddamoif3i.xn--p1ai/api/health > "$ROOT/reports/public-health.json"
date -Is > "$ROOT/reports/model-restored-at.txt"
printf 'CHECKS_COMPLETE_REVIEW_REQUIRED %s\n' "$(date -Is)" > "$ROOT/reports/status.txt"
