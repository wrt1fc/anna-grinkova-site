"""CPU-only: stress the two longest complete training examples, with answers unchanged."""
import json
import sys
from pathlib import Path
from transformers import AutoTokenizer
from token_budget import sequence_length, inspect_budget, require_budget

source, target = map(Path, sys.argv[1:3])
max_length = int(sys.argv[3]) if len(sys.argv) > 3 else 3400
rows = [json.loads(line) for line in (source / 'train.jsonl').read_text().splitlines() if line.strip()]
tokenizer = AutoTokenizer.from_pretrained('Qwen/Qwen3.5-4B', local_files_only=True)
require_budget({'train': inspect_budget(tokenizer, rows, max_length)})
ranked = sorted([(sequence_length(tokenizer, row), row) for row in rows], key=lambda pair: pair[0], reverse=True)
selected = ranked[:2]
smoke = [dict(selected[i % 2][1], id=f"memory-smoke-{i}") for i in range(16)]
target.mkdir(parents=True, exist_ok=False)
(target / 'train.jsonl').write_text('\n'.join(json.dumps(row, ensure_ascii=False) for row in smoke) + '\n')
print(json.dumps({'count': 16, 'examples': [{'id': row['id'], 'tokens': n} for n, row in selected]}))
