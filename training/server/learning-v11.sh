#!/bin/bash
# Isolated v11 pipeline. Run as ubuntu in /home/ubuntu/natal-training-v11.
# Never changes the production model or site.env. The user must approve activation separately.
set -Eeuo pipefail
ROOT=/home/ubuntu/natal-training-v11
BACKUP=/home/ubuntu/model-backups/anna-v10-before-learning-v11-20261102
PY=/home/ubuntu/natal-bench/venv/bin/python
KNOWLEDGE=/home/ubuntu/natal-training-v4/knowledge
exec 9>"$ROOT/reports/pipeline.lock"
flock -n 9 || exit 73
STAGE=preflight
cleanup() { result=$?; trap - EXIT; sudo -n systemctl start ollama || true; if [ "$result" -ne 0 ]; then printf 'FAILED stage=%s code=%s %s\n' "$STAGE" "$result" "$(date -Is)" > "$ROOT/reports/status.txt"; fi; exit "$result"; }
trap cleanup EXIT
trap 'exit 143' TERM INT
stage() { STAGE=$1; printf 'RUNNING %s %s\n' "$STAGE" "$(date -Is)" > "$ROOT/reports/status.txt"; }
export HF_HOME=/home/ubuntu/natal-bench/hf HF_HUB_OFFLINE=1 PYTHONUNBUFFERED=1 OMP_NUM_THREADS=4
test -s "$BACKUP/BACKUP_COMPLETE"
test -s "$BACKUP/anna-v10-q8_0.gguf"
test -s /home/ubuntu/natal-training-v10/anna-v10/adapter_model.safetensors
test ! -e "$ROOT/anna-v11/adapter_model.safetensors"
test "$(df --output=avail -BG "$ROOT" | tail -1 | tr -dc 0-9)" -ge 30
cd "$ROOT/eval-code"
"$PY" -m py_compile training/train_lora.py
"$PY" -c 'import json;from pathlib import Path;p=Path("/home/ubuntu/natal-training-v11/reports/token-counts.json");x=json.loads(p.read_text());assert x["train"]["count"]==137;assert max(x["train"]["max_total"],x["eval"]["max_total"])<=4224'
run_check() { local code=0; "$@" || code=$?; test "$code" -le 1; }
stage baseline-learning
run_check node training/eval-learning.mjs anna-v10 "$ROOT/learning-v11.cards.jsonl" "$ROOT/reports/learning-anna-v10" > "$ROOT/reports/baseline-learning.log" 2>&1
test -s "$ROOT/reports/learning-anna-v10.json"
stage baseline-natal
run_check node training/eval-natal.js anna-v10 "$ROOT/natal-plan-eval-v10.json" "$ROOT/reports/natal-base.md" --knowledge "$KNOWLEDGE" > "$ROOT/reports/baseline-natal.log" 2>&1
test -s "$ROOT/reports/natal-base.md"
stage baseline-chat
run_check node training/eval-chat.js anna-v10 "$ROOT/reports/chat-base.md" > "$ROOT/reports/baseline-chat.log" 2>&1
test -s "$ROOT/reports/chat-base.md"
stage training
sudo -n systemctl stop ollama
sleep 3
"$PY" training/train_lora.py --base Qwen/Qwen3.5-4B --data "$ROOT/data" --out "$ROOT/anna-v11" \
 --init-adapter /home/ubuntu/natal-training-v10/anna-v10 --epochs 2 --lr 2e-5 --max-length 4224 --grad-accum 8 \
 --half-embedding --timing --eval-first --logging-steps 1 > "$ROOT/reports/train.log" 2>&1
test -s "$ROOT/anna-v11/adapter_model.safetensors"
stage export-and-regression
CHAT_LEARNING_SIGNALS=1 bash training/server/export-eval.sh v11 "$KNOWLEDGE" natal-plan-eval-v10.json > "$ROOT/reports/export.log" 2>&1
stage candidate-learning
run_check node training/eval-learning.mjs anna-v11 "$ROOT/learning-v11.cards.jsonl" "$ROOT/reports/learning-anna-v11" > "$ROOT/reports/candidate-learning.log" 2>&1
test -s "$ROOT/reports/learning-anna-v11.json"
stage report
sha256sum "$ROOT/anna-v11-q8_0.gguf" "$ROOT/anna-v11/adapter_model.safetensors" > "$ROOT/reports/candidate-sha256.txt"
test "$(sha256sum /home/ubuntu/natal-training-v10/anna-v10/adapter_model.safetensors | cut -d' ' -f1)" = "$(tail -1 "$BACKUP/source-sha256.txt" | cut -d' ' -f1)"
node training/report-learning-run.mjs "$ROOT" > "$ROOT/reports/final-summary.log" 2>&1
curl -sf http://127.0.0.1:3000/api/health > "$ROOT/reports/site-health.json"
