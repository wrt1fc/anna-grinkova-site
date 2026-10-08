// Where the model runs: this machine by default, or the GPU server over a private network (OLLAMA_URL=http://10.0.0.2:11434).
export function ollamaGenerateUrl(base = process.env.OLLAMA_URL || 'http://127.0.0.1:11434') {
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('OLLAMA_URL must be an http(s) address');
  return new URL('/api/generate', url).toString();
}
