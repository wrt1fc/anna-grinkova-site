#!/bin/bash
# One child of immutable v27. Both v19 and v27 remain untouched and unselected.
set -Eeuo pipefail
ROOT=/home/ubuntu/natal-training-v28-r1
PY=/home/ubuntu/natal-bench/venv/bin/python
PARENT=/home/ubuntu/natal-training-v27-r1/anna-v27
PARENT_SHA=62edafbe44d5110035ec6f2ca992c5d8b0d8ef8c6cfbdc0d26c752b745cdaa7c
V19=/home/ubuntu/natal-training-v19/anna-v19
V19_SHA=309fb7c9b9f90fe691f41dbea4f00b37232dc54d1efedfd725a0174495820325
OVERRIDE=/run/systemd/system/anna-site.service.d/90-training-v28.conf
RESTORE="$ROOT/eval-code/training/server/restore-v28-serving.sh"
KNOWLEDGE=/home/ubuntu/natal-training-v4/knowledge
exec 9>"$ROOT/reports/pipeline.lock"; flock -n 9 || exit 73
exec 8>/home/ubuntu/anna-training-gpu.lock; flock -n 8 || exit 73
STAGE=preflight
cleanup() {
  result=$?; trap - EXIT
  # FD8 still holds the global lock throughout restoration.
  sudo -n /bin/bash "$RESTORE" >> "$ROOT/reports/serving-restore.log" 2>&1 || result=75
  if [ "$result" -ne 0 ]; then printf 'FAILED stage=%s code=%s %s\n' "$STAGE" "$result" "$(date -Is)" > "$ROOT/reports/status.txt"; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 143' TERM INT
stage() { STAGE=$1; printf 'RUNNING %s %s\n' "$STAGE" "$(date -Is)" > "$ROOT/reports/status.txt"; }
run_check() { local code=0; "$@" || code=$?; test "$code" -le 1; }
export HF_HOME=/home/ubuntu/natal-bench/hf HF_HUB_OFFLINE=1 PYTHONUNBUFFERED=1 OMP_NUM_THREADS=8 MKL_NUM_THREADS=8
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True CHAT_LEARNING_SIGNALS=0 CHAT_MODEL_PROTOCOL=19 CHAT_FACT_GUARD=1
export ANNA_EVAL_DATE=2026-11-12 ANNA_TRAINING_PROMPT_VERSION=18 ANNA_REFERENCE_KNOWLEDGE=19 ANNA_CHART_FOCUS=26
export ANNA_METHODICS_FILE="$ROOT/methodics.json" ANNA_METHODICS_SHA256=16089c6fb654a2e81c451094b5d85eda65d6692002dcbf281a1ea90f918de06e
test -d "$ROOT/eval-code" && test ! -L "$ROOT/eval-code"
cd "$ROOT/eval-code"
test "$(cat "$ROOT/reports/status.txt")" = PREPARED_NOT_STARTED
test ! -e "$ROOT/anna-v28/adapter_model.safetensors"
test ! -e "$ROOT/anna-v28-q8_0.gguf"
test ! -e "$OVERRIDE"
test ! -e "$ROOT/reports/lease-owned"
test ! -e "$ROOT/reports/restore-needed"
test "$(sha256sum "$PARENT/adapter_model.safetensors" | cut -d' ' -f1)" = "$PARENT_SHA"
test "$(sha256sum "$V19/adapter_model.safetensors" | cut -d' ' -f1)" = "$V19_SHA"
sha256sum "$PARENT/adapter_model.safetensors" "$V19/adapter_model.safetensors" > "$ROOT/reports/ancestors-before.sha256"
(cd "$ROOT" && sha256sum -c input-sha256.txt) > "$ROOT/reports/input-check.log"
sha256sum -c "$ROOT/source-sha256.txt" > "$ROOT/reports/source-check.log"
node --input-type=module - "$ROOT" <<'JS'
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=process.argv[2];
const rows=name=>fs.readFileSync(`${root}/${name}`,'utf8').trim().split(/\r?\n/u).map(JSON.parse);
const cards=rows('cards.jsonl');
assert.equal(cards.filter(r=>r.split==='train').length,506);
assert.equal(cards.filter(r=>r.split==='eval').length,246);
assert.equal(rows('holdout.jsonl').length,29);
assert.equal(rows('regression.jsonl').length,88);
assert.equal(rows('data/train.jsonl').length,506);
assert.equal(rows('data/eval.jsonl').length,246);
JS
stage token-preflight
USE_TORCH=0 "$PY" training/count-learning-tokens.py "$ROOT/data" "$ROOT/reports/token-counts.json" 4096 > "$ROOT/reports/token-preflight.log" 2>&1
stage completion-mask-preflight
USE_TORCH=0 "$PY" training/audit_completion_mask.py "$ROOT/data" "$ROOT/reports/completion-mask-audit.json" > "$ROOT/reports/completion-mask-audit.log" 2>&1
USE_TORCH=0 "$PY" training/prepare-memory-smoke.py "$ROOT/data" "$ROOT/smoke-data" 4096 > "$ROOT/reports/memory-smoke-plan.json" 2>&1
stage dedicated-gpu-window
: > "$ROOT/reports/lease-owned"
: > "$ROOT/reports/restore-needed"
printf 'CHAT_LOCAL_MODEL=\nFORECAST_LOCAL_MODEL=\n' > "$ROOT/serving-disabled.env"
printf '[Service]\nEnvironmentFile=%s/serving-disabled.env\n' "$ROOT" > "$ROOT/runtime-disable.conf"
sudo -n mkdir -p /run/systemd/system/anna-site.service.d
sudo -n install -m 644 "$ROOT/runtime-disable.conf" "$OVERRIDE"
sudo -n systemctl daemon-reload
sudo -n systemctl restart anna-site
curl -fsS --retry 15 --retry-connrefused --retry-delay 1 --retry-max-time 30 --max-time 5 http://127.0.0.1:3000/api/health > "$ROOT/reports/site-health-during-training.json"
sudo -n systemctl start ollama
curl -fsS --retry 15 --retry-connrefused --retry-delay 1 --retry-max-time 30 --max-time 5 http://127.0.0.1:11434/api/tags > "$ROOT/reports/ollama-tags-before.json"
for set in 'holdout fresh' 'regression exposed' 'cards development'; do
  read -r input label <<< "$set"; stage "parent-$label"
  run_check node training/eval-serving.mjs anna-v27 "$ROOT/$input.jsonl" "$ROOT/reports/parent-$label" > "$ROOT/reports/parent-$label.log" 2>&1
done
stage parent-raw-focus
node training/eval-raw-v28.mjs anna-v27 "$ROOT" "$ROOT/reports/parent-raw-focus" > "$ROOT/reports/parent-raw-focus.log" 2>&1
stage parent-chat
run_check node training/eval-chat.js anna-v27 "$ROOT/reports/parent-chat.md" > "$ROOT/reports/parent-chat.log" 2>&1
stage parent-natal
run_check node training/eval-natal.js anna-v27 "$ROOT/natal-plan.json" "$ROOT/reports/parent-natal.md" --knowledge "$KNOWLEDGE" > "$ROOT/reports/parent-natal.log" 2>&1
stage free-gpu
sudo -n systemctl stop ollama
for _ in $(seq 1 10); do
  test -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader)" && break
  sleep 1
done
test -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader)"
date -Is > "$ROOT/reports/model-unavailable-since.txt"
stage memory-smoke
"$PY" training/train_lora.py --base Qwen/Qwen3.5-4B --data "$ROOT/smoke-data" --out "$ROOT/smoke-adapter" --init-adapter "$PARENT" --max-steps 10 --lr 5e-6 --max-length 4096 --reject-truncation --require-prefix-match --grad-accum 1 --half-embedding --timing --logging-steps 1 > "$ROOT/reports/memory-smoke.log" 2>&1
"$PY" training/check-memory-smoke.py "$ROOT/smoke-adapter/anna-training.json" 4096 > "$ROOT/reports/memory-smoke-result.json"
stage training
"$PY" training/train_lora.py --base Qwen/Qwen3.5-4B --data "$ROOT/data" --out "$ROOT/anna-v28" --init-adapter "$PARENT" --epochs 2 --lr 5e-6 --max-length 4096 --reject-truncation --require-prefix-match --grad-accum 8 --half-embedding --timing --eval-first --logging-steps 1 > "$ROOT/reports/train.log" 2>&1
stage export-and-regression
bash training/server/export-eval.sh v28 "$KNOWLEDGE" natal-plan.json > "$ROOT/reports/export.log" 2>&1
test "$(cat "$ROOT/reports/eval-natal-anna-v28.exit")" -le 1
test "$(cat "$ROOT/reports/eval-chat-anna-v28.exit")" -le 1
# Export already generated these controls; retain the same responses for comparison.
for kind in chat natal; do
  cp "$ROOT/reports/eval-$kind-anna-v28.json" "$ROOT/reports/candidate-$kind.json"
  cp "$ROOT/reports/eval-$kind-anna-v28.md" "$ROOT/reports/candidate-$kind.md"
done
for set in 'holdout fresh' 'regression exposed' 'cards development'; do
  read -r input label <<< "$set"; stage "candidate-$label"
  run_check node training/eval-serving.mjs anna-v28 "$ROOT/$input.jsonl" "$ROOT/reports/candidate-$label" > "$ROOT/reports/candidate-$label.log" 2>&1
done
stage candidate-raw-focus
node training/eval-raw-v28.mjs anna-v28 "$ROOT" "$ROOT/reports/candidate-raw-focus" > "$ROOT/reports/candidate-raw-focus.log" 2>&1
stage final-integrity
sha256sum -c "$ROOT/reports/ancestors-before.sha256" > "$ROOT/reports/ancestors-final-check.log"
(cd "$ROOT" && sha256sum -c input-sha256.txt) > "$ROOT/reports/input-final-check.log"
sha256sum -c "$ROOT/source-sha256.txt" > "$ROOT/reports/source-final-check.log"
sha256sum "$ROOT/anna-v28/adapter_model.safetensors" "$ROOT/anna-v28-q8_0.gguf" > "$ROOT/reports/candidate-sha256.txt"
printf 'REVIEW_REQUIRED: compare parent/candidate reports and raw attempts; no automatic promotion\n' > "$ROOT/reports/summary.log"
sudo -n /bin/bash "$RESTORE" >> "$ROOT/reports/serving-restore.log" 2>&1
curl -fsS --max-time 15 http://127.0.0.1:3000/api/health > "$ROOT/reports/site-health.json"
curl -fsS --max-time 20 https://xn--80axddamoif3i.xn--p1ai/api/health > "$ROOT/reports/public-health.json"
date -Is > "$ROOT/reports/model-restored-at.txt"
printf 'SERVING_CHECKS_COMPLETE_REVIEW_REQUIRED %s\n' "$(date -Is)" > "$ROOT/reports/status.txt"
