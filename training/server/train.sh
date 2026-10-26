#!/bin/bash
# Trains one LoRA adapter on the GPU server. Run from a version folder prepared as described in docs/server-training.md:
#   /home/ubuntu/natal-training-vN/{data/train.jsonl,data/eval.jsonl,eval-code/ (this repository's code),reports/}
# Usage: nohup bash eval-code/training/server/train.sh <version> <init-adapter> [epochs] [learning-rate] &
# Example: bash eval-code/training/server/train.sh v5 /home/ubuntu/natal-training-v4/anna-v4 2 3e-5
# The GPU must be free: stop Ollama first (sudo systemctl stop ollama), start it again after the export.
set -Eeuo pipefail
VERSION=${1:?version, for example v5}
INIT_ADAPTER=${2:?adapter to continue from}
EPOCHS=${3:-2}
LEARNING_RATE=${4:-3e-5}
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
PY=${PY:-/home/ubuntu/natal-bench/venv/bin/python}
export HF_HOME=${HF_HOME:-/home/ubuntu/natal-bench/hf} HF_HUB_OFFLINE=1 PYTHONUNBUFFERED=1
STATUS="$ROOT/reports/status.txt"
mkdir -p "$ROOT/reports"
if [ "$(ollama ps 2>/dev/null | wc -l)" -gt 1 ]; then echo "Ollama holds the GPU: stop it first (sudo systemctl stop ollama)" >&2; exit 2; fi
trap 'printf "FAILED train code=%s %s\n" "$?" "$(date -Is)" > "$STATUS"' ERR
printf 'RUNNING train %s\n' "$(date -Is)" > "$STATUS"
# 4B model in 4-bit, answers up to 3400 tokens kept whole, 8 examples per step (batch 1 x 8 accumulation), BF16-free (2080 Ti): see docs/server-training.md
"$PY" "$ROOT/eval-code/training/train_lora.py" --base Qwen/Qwen3.5-4B --data "$ROOT/data" --out "$ROOT/anna-$VERSION" \
  --init-adapter "$INIT_ADAPTER" --epochs "$EPOCHS" --lr "$LEARNING_RATE" --max-length 3400 --grad-accum 8 \
  --half-embedding --timing --eval-first --logging-steps 1 > "$ROOT/reports/train.log" 2>&1
test -s "$ROOT/anna-$VERSION/adapter_model.safetensors"
printf 'TRAINING_COMPLETE %s\n' "$(date -Is)" > "$STATUS"
