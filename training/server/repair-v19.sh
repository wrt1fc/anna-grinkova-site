#!/bin/bash
# One isolated, bounded candidate. Production model and environment are untouched.
set -Eeuo pipefail
ROOT=/home/ubuntu/natal-training-v19
PARENT=/home/ubuntu/natal-training-v18/anna-v18
PY=/home/ubuntu/natal-bench/venv/bin/python
BACKUP=/home/ubuntu/model-backups/anna-v10-before-learning-v11-20261102
KNOWLEDGE=/home/ubuntu/natal-training-v4/knowledge
exec 9>"$ROOT/reports/pipeline.lock"; flock -n 9 || exit 73
exec 8>/home/ubuntu/anna-training-gpu.lock; flock -n 8 || exit 73
STAGE=preflight
cleanup() { result=$?; trap - EXIT; sudo -n systemctl start ollama || true; if [ "$result" -ne 0 ]; then printf 'FAILED stage=%s code=%s %s\n' "$STAGE" "$result" "$(date -Is)" > "$ROOT/reports/status.txt"; fi; exit "$result"; }
trap cleanup EXIT
trap 'exit 143' TERM INT
stage() { STAGE=$1; printf 'RUNNING %s %s\n' "$STAGE" "$(date -Is)" > "$ROOT/reports/status.txt"; }
run_check() { local code=0; "$@" || code=$?; test "$code" -le 1; }
export HF_HOME=/home/ubuntu/natal-bench/hf HF_HUB_OFFLINE=1 PYTHONUNBUFFERED=1 OMP_NUM_THREADS=4
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True CHAT_LEARNING_SIGNALS=1 ANNA_EVAL_DATE=2026-11-02 ANNA_TRAINING_PROMPT_VERSION=18 ANNA_REFERENCE_KNOWLEDGE=19
export ANNA_METHODICS_FILE="$ROOT/methodics.json" ANNA_METHODICS_SHA256=b81c9b842b2986e5864853234f6d043773612334f1ec8d2b205d611608792a3b
test ! -e "$ROOT/anna-v19/adapter_model.safetensors"
test -s "$BACKUP/BACKUP_COMPLETE"
test "$(df --output=avail -BG "$ROOT" | tail -1 | tr -dc 0-9)" -ge 30
test "$(sha256sum "$PARENT/adapter_model.safetensors" | cut -d' ' -f1)" = 140e653e4d302bfd727fa30a626ff147cf45a57756013433bc27ec1309ba56a7
cd "$ROOT"; sha256sum -c input-sha256.txt > reports/input-check.log
cd "$ROOT/eval-code"
node --input-type=module -e 'import fs from "node:fs";import {loadMethodics} from "./server/methodic-reference.js";const p=JSON.parse(fs.readFileSync(process.argv[1])),m=JSON.parse(fs.readFileSync(process.argv[2]));if(p.train!==931||p.eval!==246||p.fresh!==32||p.initAdapter!=="anna-v18"||p.referenceVersion!==19||m.referenceVersion!==19||m.train!==931||m.eval!==246||loadMethodics().length!==61)throw Error("Data/reference contract");' "$ROOT/preparation.json" "$ROOT/data/manifest.json"
stage token-preflight
USE_TORCH=0 "$PY" training/count-learning-tokens.py "$ROOT/data" "$ROOT/reports/token-counts.json" 3400 > "$ROOT/reports/token-preflight.log" 2>&1
stage completion-mask-preflight
USE_TORCH=0 "$PY" training/audit_completion_mask.py "$ROOT/data" "$ROOT/reports/completion-mask-audit.json" > "$ROOT/reports/completion-mask-audit.log" 2>&1
USE_TORCH=0 "$PY" training/prepare-memory-smoke.py "$ROOT/data" "$ROOT/smoke-data" > "$ROOT/reports/memory-smoke-plan.json" 2>&1
for pair in 'anna-v10 baseline' 'anna-v18 parent'; do
 read -r model prefix <<< "$pair"
 stage "$prefix-learning"; run_check node training/eval-learning.mjs "$model" "$ROOT/cards.jsonl" "$ROOT/reports/$prefix-learning" > "$ROOT/reports/$prefix-learning.log" 2>&1
 stage "$prefix-fresh"; run_check node training/eval-learning.mjs "$model" "$ROOT/holdout.jsonl" "$ROOT/reports/$prefix-fresh" > "$ROOT/reports/$prefix-fresh.log" 2>&1
 stage "$prefix-natal"; run_check node training/eval-natal.js "$model" "$ROOT/natal-plan.json" "$ROOT/reports/$prefix-natal.md" --knowledge "$KNOWLEDGE" > "$ROOT/reports/$prefix-natal.log" 2>&1
 stage "$prefix-chat"; run_check node training/eval-chat.js "$model" "$ROOT/reports/$prefix-chat.md" > "$ROOT/reports/$prefix-chat.log" 2>&1
done
stage backup-check
(cd "$BACKUP" && sha256sum -c SHA256SUMS) > "$ROOT/reports/backup-check.log" 2>&1
stage memory-smoke
sudo -n systemctl stop ollama
sleep 3
test -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader)"
"$PY" training/train_lora.py --base Qwen/Qwen3.5-4B --data "$ROOT/smoke-data" --out "$ROOT/smoke-adapter" --init-adapter "$PARENT" --max-steps 10 --lr 5e-6 --max-length 3400 --reject-truncation --require-prefix-match --grad-accum 1 --half-embedding --timing --logging-steps 1 > "$ROOT/reports/memory-smoke.log" 2>&1
"$PY" training/check-memory-smoke.py "$ROOT/smoke-adapter/anna-training.json" > "$ROOT/reports/memory-smoke-result.json"
stage training
"$PY" training/train_lora.py --base Qwen/Qwen3.5-4B --data "$ROOT/data" --out "$ROOT/anna-v19" --init-adapter "$PARENT" --epochs 1 --lr 5e-6 --max-length 3400 --reject-truncation --require-prefix-match --grad-accum 8 --half-embedding --timing --eval-first --logging-steps 1 > "$ROOT/reports/train.log" 2>&1
stage export-and-regression
bash training/server/export-eval.sh v19 "$KNOWLEDGE" natal-plan.json > "$ROOT/reports/export.log" 2>&1
test "$(cat "$ROOT/reports/eval-natal-anna-v19.exit")" -le 1
test "$(cat "$ROOT/reports/eval-chat-anna-v19.exit")" -le 1
stage candidate-learning
run_check node training/eval-learning.mjs anna-v19 "$ROOT/cards.jsonl" "$ROOT/reports/learning" > "$ROOT/reports/learning.log" 2>&1
stage candidate-fresh
run_check node training/eval-learning.mjs anna-v19 "$ROOT/holdout.jsonl" "$ROOT/reports/fresh" > "$ROOT/reports/fresh.log" 2>&1
stage final-integrity
sha256sum "$ROOT/anna-v19-q8_0.gguf" "$ROOT/anna-v19/adapter_model.safetensors" > "$ROOT/reports/candidate-sha256.txt"
(cd "$BACKUP" && sha256sum -c SHA256SUMS) > "$ROOT/reports/backup-final-check.log" 2>&1
test "$(sha256sum "$PARENT/adapter_model.safetensors" | cut -d' ' -f1)" = 140e653e4d302bfd727fa30a626ff147cf45a57756013433bc27ec1309ba56a7
curl -fsS --max-time 15 http://127.0.0.1:3000/api/health > "$ROOT/reports/site-health.json"
curl -fsS --max-time 20 https://xn--80axddamoif3i.xn--p1ai/api/health > "$ROOT/reports/public-health.json"
stage report
node training/report-repair-v19.mjs "$ROOT" > "$ROOT/reports/final-summary.log" 2>&1
