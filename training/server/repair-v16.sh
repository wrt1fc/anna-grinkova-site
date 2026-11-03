#!/bin/bash
# Prepared only. Invoke explicitly for one isolated run; never changes production config.
set -Eeuo pipefail
ROOT=/home/ubuntu/natal-training-v16
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
export HF_HOME=/home/ubuntu/natal-bench/hf HF_HUB_OFFLINE=1 PYTHONUNBUFFERED=1 OMP_NUM_THREADS=4 CHAT_LEARNING_SIGNALS=1
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
export ANNA_EVAL_DATE=2026-11-02
test ! -e "$ROOT/anna-v16/adapter_model.safetensors"
test -s "$BACKUP/BACKUP_COMPLETE"
test "$(df --output=avail -BG "$ROOT" | tail -1 | tr -dc 0-9)" -ge 30
test "$(sha256sum /home/ubuntu/natal-training-v10/anna-v10/adapter_model.safetensors | cut -d' ' -f1)" = 99568d4c1cc1ef9669d565e058301e056b5b3e771e9f6a05fd76fdb43f48741f
cd "$ROOT"
sha256sum -c input-sha256.txt > reports/input-check.log
cd "$ROOT/eval-code"
node --input-type=module -e 'import fs from "node:fs"; const p=JSON.parse(fs.readFileSync(process.argv[1]));const m=JSON.parse(fs.readFileSync(process.argv[2]));if(p.train!==499||p.eval!==89||p.fresh!==30||m.train!==p.train||m.eval!==p.eval||p.initAdapter!=="anna-v10")throw Error("Unexpected data contract");' "$ROOT/preparation.json" "$ROOT/data/manifest.json"
stage token-preflight
USE_TORCH=0 "$PY" training/count-learning-tokens.py "$ROOT/data" "$ROOT/reports/token-counts.json" 3400 > "$ROOT/reports/token-preflight.log" 2>&1
USE_TORCH=0 "$PY" training/prepare-memory-smoke.py "$ROOT/data" "$ROOT/smoke-data" > "$ROOT/reports/memory-smoke-plan.json" 2>&1
stage baseline-learning
run_check node training/eval-learning.mjs anna-v10 "$ROOT/cards.jsonl" "$ROOT/reports/baseline-learning" > "$ROOT/reports/baseline-learning.log" 2>&1
stage baseline-fresh
run_check node training/eval-learning.mjs anna-v10 "$ROOT/holdout.jsonl" "$ROOT/reports/baseline-fresh" > "$ROOT/reports/baseline-fresh.log" 2>&1
stage baseline-natal
run_check node training/eval-natal.js anna-v10 "$ROOT/natal-plan.json" "$ROOT/reports/baseline-natal.md" --knowledge "$KNOWLEDGE" > "$ROOT/reports/baseline-natal.log" 2>&1
stage baseline-chat
run_check node training/eval-chat.js anna-v10 "$ROOT/reports/baseline-chat.md" > "$ROOT/reports/baseline-chat.log" 2>&1
stage backup-check
(cd "$BACKUP" && sha256sum -c SHA256SUMS) > "$ROOT/reports/backup-check.log" 2>&1
stage memory-smoke
sudo -n systemctl stop ollama
sleep 3
test -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader)"
"$PY" training/train_lora.py --base Qwen/Qwen3.5-4B --data "$ROOT/smoke-data" --out "$ROOT/smoke-adapter" \
 --init-adapter /home/ubuntu/natal-training-v10/anna-v10 --max-steps 10 --lr 1e-5 --max-length 3400 --reject-truncation --grad-accum 1 --half-embedding --timing --logging-steps 1 > "$ROOT/reports/memory-smoke.log" 2>&1
"$PY" training/check-memory-smoke.py "$ROOT/smoke-adapter/anna-training.json" > "$ROOT/reports/memory-smoke-result.json"
stage training
"$PY" training/train_lora.py --base Qwen/Qwen3.5-4B --data "$ROOT/data" --out "$ROOT/anna-v16" \
 --init-adapter /home/ubuntu/natal-training-v10/anna-v10 --epochs 2 --lr 1e-5 --max-length 3400 --reject-truncation --grad-accum 8 --half-embedding --timing --eval-first --logging-steps 1 > "$ROOT/reports/train.log" 2>&1
stage export-and-regression
bash training/server/export-eval.sh v16 "$KNOWLEDGE" natal-plan.json > "$ROOT/reports/export.log" 2>&1
test "$(cat "$ROOT/reports/eval-natal-anna-v16.exit")" -le 1
test "$(cat "$ROOT/reports/eval-chat-anna-v16.exit")" -le 1
stage candidate-learning
run_check node training/eval-learning.mjs anna-v16 "$ROOT/cards.jsonl" "$ROOT/reports/learning" > "$ROOT/reports/learning.log" 2>&1
stage candidate-fresh
run_check node training/eval-learning.mjs anna-v16 "$ROOT/holdout.jsonl" "$ROOT/reports/fresh" > "$ROOT/reports/fresh.log" 2>&1
stage final-integrity
sha256sum "$ROOT/anna-v16-q8_0.gguf" "$ROOT/anna-v16/adapter_model.safetensors" > "$ROOT/reports/candidate-sha256.txt"
(cd "$BACKUP" && sha256sum -c SHA256SUMS) > "$ROOT/reports/backup-final-check.log" 2>&1
test "$(sha256sum /home/ubuntu/natal-training-v10/anna-v10/adapter_model.safetensors | cut -d' ' -f1)" = 99568d4c1cc1ef9669d565e058301e056b5b3e771e9f6a05fd76fdb43f48741f
curl -fsS --max-time 15 http://127.0.0.1:3000/api/health > "$ROOT/reports/site-health.json"
stage report
node training/report-repair-v16.mjs "$ROOT" > "$ROOT/reports/final-summary.log" 2>&1
