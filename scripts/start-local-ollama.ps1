param(
  [string]$OllamaExe = 'D:\AnnaAI\runtime\ollama.exe',
  [string]$ModelsPath = 'D:\AnnaAI\models'
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $OllamaExe -PathType Leaf)) {
  throw "Ollama executable not found: $OllamaExe"
}
New-Item -ItemType Directory -Force -Path $ModelsPath | Out-Null
$env:OLLAMA_MODELS = (Resolve-Path -LiteralPath $ModelsPath).Path
$env:OLLAMA_HOST = '127.0.0.1:11434'
$env:OLLAMA_NO_CLOUD = '1'
$env:OLLAMA_MAX_LOADED_MODELS = '1'
& $OllamaExe serve
