"""QLoRA fine-tune of an open chat model on the dataset from build-dataset.js.

Teaches Anna's manner of explaining inside the live chat format; facts still come from the prompt.
Runs on one CUDA GPU (24 GB is comfortable for 7-14B in 4-bit; 8 GB is enough for a 4B smoke run).

Example:
  python training/train_lora.py --base Qwen/Qwen3-8B --data D:/AnnaAI/data/dataset --out D:/AnnaAI/adapters/anna-v1
Smoke run that only checks the pipeline:
  python training/train_lora.py --base <small model> --data <dir> --out <dir> --max-steps 5
"""
import argparse
import json
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from trl import SFTConfig, SFTTrainer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', required=True, help='Hugging Face id or local path of the base model')
    parser.add_argument('--data', required=True, help='folder with train.jsonl and optional eval.jsonl')
    parser.add_argument('--out', required=True, help='where to save the LoRA adapter')
    parser.add_argument('--epochs', type=float, default=3)
    parser.add_argument('--lr', type=float, default=1e-4)
    parser.add_argument('--rank', type=int, default=16)
    parser.add_argument('--max-length', type=int, default=2048)
    parser.add_argument('--batch', type=int, default=1)
    parser.add_argument('--grad-accum', type=int, default=8)
    parser.add_argument('--max-steps', type=int, default=-1)
    args = parser.parse_args()

    data = Path(args.data)
    files = {'train': str(data / 'train.jsonl')}
    eval_file = data / 'eval.jsonl'
    if eval_file.exists() and eval_file.stat().st_size:
        files['eval'] = str(eval_file)
    dataset = load_dataset('json', data_files=files)

    tokenizer = AutoTokenizer.from_pretrained(args.base)
    model = AutoModelForCausalLM.from_pretrained(
        args.base,
        quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4',
                                               bnb_4bit_compute_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
                                               bnb_4bit_use_double_quant=True),
        device_map='auto',
    )

    config = SFTConfig(
        output_dir=args.out,
        num_train_epochs=args.epochs,
        max_steps=args.max_steps,
        learning_rate=args.lr,
        lr_scheduler_type='cosine',
        warmup_steps=0.05,  # a float below 1 is a share of total steps
        per_device_train_batch_size=args.batch,
        gradient_accumulation_steps=args.grad_accum,
        gradient_checkpointing=True,
        max_length=args.max_length,
        # Prompt/completion data: learn only the assistant reply, not the long system prompt and context.
        completion_only_loss=True,
        bf16=torch.cuda.is_bf16_supported(),
        fp16=not torch.cuda.is_bf16_supported(),
        logging_steps=5,
        eval_strategy='epoch' if 'eval' in files else 'no',
        save_strategy='epoch',
        save_total_limit=2,
        report_to='none',
    )
    trainer = SFTTrainer(
        model=model,
        args=config,
        train_dataset=dataset['train'],
        eval_dataset=dataset.get('eval'),
        processing_class=tokenizer,
        peft_config=LoraConfig(r=args.rank, lora_alpha=args.rank * 2, lora_dropout=0.05, task_type='CAUSAL_LM',
                               target_modules='all-linear'),
    )
    trainer.train()
    trainer.save_model(args.out)
    (Path(args.out) / 'anna-training.json').write_text(json.dumps({
        'base': args.base, 'train_examples': len(dataset['train']), 'epochs': args.epochs, 'lr': args.lr,
        'rank': args.rank, 'max_steps': args.max_steps,
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'adapter saved to {args.out}')


if __name__ == '__main__':
    main()
