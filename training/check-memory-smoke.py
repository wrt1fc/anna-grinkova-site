"""A real backward/optimizer smoke run must finish with headroom before full training."""
import json
import math
import sys
from pathlib import Path

meta = json.loads(Path(sys.argv[1]).read_text())
max_length = int(sys.argv[2]) if len(sys.argv) > 2 else 3400
assert meta['max_length'] == max_length and meta['max_steps'] == 10
assert meta['processed_train_examples'] == 16 and meta['reject_truncation'] is True
assert math.isfinite(meta['training_metrics']['train_loss'])
assert meta['peak_cuda_allocated_gib'] < 9.0, 'Less than expected GPU headroom'
assert meta['peak_cuda_reserved_gib'] < 9.6, 'Reserved memory too close to GPU capacity'
print(json.dumps({'status': 'PASS', 'max_length': max_length, 'steps': 10,
                  'peak_allocated_gib': meta['peak_cuda_allocated_gib'],
                  'peak_reserved_gib': meta['peak_cuda_reserved_gib']}))
