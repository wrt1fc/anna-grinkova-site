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
import time
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig, PeftModel, prepare_model_for_kbit_training
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, TrainerCallback
from trl import SFTConfig, SFTTrainer


class StepTiming(TrainerCallback):
    """Prints the seconds and the peak GPU memory of every optimizer step (--timing), so a slow run is visible early."""

    def on_step_begin(self, args, state, control, **kwargs):
        torch.cuda.synchronize()
        self.started = time.perf_counter()

    def on_step_end(self, args, state, control, **kwargs):
        torch.cuda.synchronize()
        print('STEP', state.global_step, 'seconds', round(time.perf_counter() - self.started, 2),
              'peak_GiB', round(torch.cuda.max_memory_allocated() / 2**30, 2), flush=True)


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
    parser.add_argument('--init-adapter', help='continue training an existing LoRA adapter instead of starting a new one')
    parser.add_argument('--frozen-embedding-bf16', action='store_true',
                        help='keep the frozen token embedding in BF16 to reduce VRAM; requires native BF16 support')
    parser.add_argument('--half-embedding', action='store_true',
                        help='keep the frozen token embedding in half precision (BF16, or FP16 on GPUs without BF16 such as the RTX 2080 Ti) '
                             'and train the LoRA weights in FP32; this is what fits a 4B model into 11 GB (docs/server-training.md)')
    parser.add_argument('--timing', action='store_true', help='print the seconds and peak memory of every step')
    parser.add_argument('--logging-steps', type=int, default=5)
    parser.add_argument('--eval-first', action='store_true',
                        help='measure the eval loss before training: with --init-adapter it is the loss of the adapter being continued, the baseline for the new one')
    args = parser.parse_args()
    # Turing cards (2080 Ti) report BF16 as available through emulation, which is far too slow: only native support counts.
    bf16_native = torch.cuda.is_bf16_supported(including_emulation=False)

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
                                               bnb_4bit_compute_dtype=torch.bfloat16 if bf16_native else torch.float16,
                                               bnb_4bit_use_double_quant=True),
        device_map='auto',
    )
    if args.init_adapter:
        # Further training of an earlier adapter on a focused set: the adapter keeps what it learned and is updated, not replaced.
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
        model = PeftModel.from_pretrained(model, args.init_adapter, is_trainable=True)

    config = SFTConfig(
        output_dir=args.out,
        num_train_epochs=args.epochs,
        max_steps=args.max_steps,
        learning_rate=args.lr,
        lr_scheduler_type='cosine',
        warmup_steps=0.05,  # a float below 1 is a share of total steps
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=args.grad_accum,
        gradient_checkpointing=True,
        max_length=args.max_length,
        # Prompt/completion data: learn only the assistant reply, not the long system prompt and context.
        completion_only_loss=True,
        bf16=bf16_native,
        fp16=not bf16_native,
        logging_steps=args.logging_steps,
        eval_strategy='epoch' if 'eval' in files else 'no',
        save_strategy='epoch',
        # With a held-out set the adapter from the epoch with the lowest eval loss is kept, not simply the last one.
        load_best_model_at_end='eval' in files,
        metric_for_best_model='eval_loss',
        greater_is_better=False,
        save_total_limit=2,
        report_to='none',
    )
    trainer = SFTTrainer(
        model=model,
        args=config,
        train_dataset=dataset['train'],
        eval_dataset=dataset.get('eval'),
        processing_class=tokenizer,
        peft_config=None if args.init_adapter else LoraConfig(r=args.rank, lora_alpha=args.rank * 2, lora_dropout=0.05, task_type='CAUSAL_LM',
                                                              target_modules='all-linear'),
    )
    if args.half_embedding:
        embedding = model.get_input_embeddings()
        if embedding.weight.requires_grad:
            raise ValueError('cannot cast a trainable token embedding')
        embedding.to(dtype=torch.bfloat16 if bf16_native else torch.float16)
        # Mixed precision with FP16 needs the trained (LoRA) weights in FP32.
        for parameter in model.parameters():
            if parameter.requires_grad:
                parameter.data = parameter.data.float()
        torch.cuda.empty_cache()
        print('Frozen token embedding:', embedding.weight.dtype, '(full training examples retained)', flush=True)
    if args.timing:
        trainer.add_callback(StepTiming())
    if args.frozen_embedding_bf16:
        if not bf16_native:
            raise ValueError('--frozen-embedding-bf16 requires a BF16-capable GPU')
        embedding = model.get_input_embeddings()
        if embedding.weight.requires_grad:
            raise ValueError('cannot cast a trainable token embedding')
        # PEFT preparation promotes non-quantized weights to FP32. This large,
        # frozen table can stay in BF16; leave normalization and LoRA weights alone.
        embedding.to(dtype=torch.bfloat16)
        torch.cuda.empty_cache()
        print('Frozen token embedding: BF16 (full training examples retained)', flush=True)
    if args.eval_first and 'eval' in files:
        print('EVAL_BEFORE', trainer.evaluate(), flush=True)
    trainer.train()
    trainer.save_model(args.out)
    (Path(args.out) / 'anna-training.json').write_text(json.dumps({
        'base': args.base, 'train_examples': len(dataset['train']), 'epochs': args.epochs, 'lr': args.lr,
        'rank': args.rank, 'max_steps': args.max_steps, 'init_adapter': args.init_adapter,
        'frozen_embedding_bf16': args.frozen_embedding_bf16, 'half_embedding': args.half_embedding,
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'adapter saved to {args.out}')


if __name__ == '__main__':
    main()
