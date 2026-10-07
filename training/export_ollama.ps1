# Turns a trained LoRA adapter into an Ollama model: merge -> GGUF (q8_0) -> ollama create.
# Ollama on Windows cannot import or quantize safetensors itself (that path needs MLX), so llama.cpp's converter is used.
# Example:
#   powershell -File training/export_ollama.ps1 -Name anna-v1 -Adapter D:\AnnaAI\adapters\anna-v1
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [Parameter(Mandatory = $true)][string]$Adapter,
  [string]$Base = 'Qwen/Qwen3.5-4B',
  [string]$Root = 'D:\AnnaAI',
  [ValidateSet('q8_0', 'f16', 'bf16')][string]$OutType = 'q8_0'
)
$ErrorActionPreference = 'Stop'
$python = Join-Path $Root 'venvs\train\Scripts\python.exe'
$ollama = Join-Path $Root 'runtime\ollama.exe'
$converter = Join-Path $Root 'tools\llama.cpp\convert_hf_to_gguf.py'
$merged = Join-Path $Root "models\merged\$Name"
$gguf = Join-Path $Root "models\merged\$Name-$OutType.gguf"
$modelfile = Join-Path $Root "models\merged\Modelfile.$Name"
foreach ($path in @($python, $ollama, $converter, $Adapter)) { if (-not (Test-Path $path)) { throw "Not found: $path" } }

# Everything stays on D: (model cache and temporary files).
$env:HF_HOME = Join-Path $Root 'models\hf'
$env:HF_HUB_OFFLINE = '1'
$env:TMP = Join-Path $Root 'tmp'
$env:TEMP = $env:TMP

& $python (Join-Path $PSScriptRoot 'merge_adapter.py') --base $Base --adapter $Adapter --out $merged
if ($LASTEXITCODE) { throw 'merge failed' }
& $python $converter $merged --outtype $OutType --outfile $gguf
if ($LASTEXITCODE) { throw 'GGUF conversion failed' }
@"
FROM $($gguf -replace '\\', '/')
RENDERER qwen3.5
PARSER qwen3.5
PARAMETER temperature 0.25
PARAMETER top_k 20
PARAMETER top_p 0.95
"@ | Set-Content -Encoding ascii $modelfile
& $ollama create $Name -f $modelfile
if ($LASTEXITCODE) { throw 'ollama create failed (is the Ollama server running? scripts/start-local-ollama.ps1)' }
Write-Host "Ollama model '$Name' is ready. Check it: node training/eval-chat.js $Name"
