"""Merges a LoRA adapter into its base model and saves full weights, ready for `ollama create`.

Example:
  python training/merge_adapter.py --base Qwen/Qwen3.5-4B --adapter D:/AnnaAI/adapters/anna-v1 --out D:/AnnaAI/models/merged/anna-v1
Runs on the CPU in bfloat16 (about 10 GB of RAM for a 4B model), so it does not need the GPU.
"""
import argparse
import json
from pathlib import Path

import torch
from huggingface_hub import snapshot_download
from safetensors import safe_open
from safetensors.torch import save_file
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', required=True)
    parser.add_argument('--adapter', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    model = AutoModelForCausalLM.from_pretrained(args.base, dtype=torch.bfloat16, device_map='cpu', low_cpu_mem_usage=True)
    merged = PeftModel.from_pretrained(model, args.adapter).merge_and_unload()
    merged.save_pretrained(args.out, safe_serialization=True, max_shard_size='2GB')
    AutoTokenizer.from_pretrained(args.adapter).save_pretrained(args.out)
    copy_mtp(args.base, Path(args.out))
    print('merged model saved to', args.out)


# Qwen3.5 keeps a multi-token-prediction block (mtp.*) that the text model does not load, so merge_and_unload
# drops it; llama.cpp/Ollama still expect it as the last block. LoRA never touched it, so it is copied as is.
def copy_mtp(base, out):
    source = Path(snapshot_download(base, allow_patterns=['*.json', '*.safetensors']))
    weight_map = json.loads((source / 'model.safetensors.index.json').read_text())['weight_map']
    names = [name for name in weight_map if name.startswith('mtp.')]
    if not names:
        return
    tensors = {}
    for name in names:
        with safe_open(source / weight_map[name], framework='pt') as handle:
            tensors[name] = handle.get_tensor(name)
    save_file(tensors, out / 'model-mtp.safetensors', metadata={'format': 'pt'})
    index_path = out / 'model.safetensors.index.json'
    index = json.loads(index_path.read_text())
    index['weight_map'].update({name: 'model-mtp.safetensors' for name in names})
    index_path.write_text(json.dumps(index, indent=2))
    print(f'copied {len(names)} mtp tensors')


if __name__ == '__main__':
    main()
