import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../src/engine/llm.ts', import.meta.url), 'utf8')

test('CPU-Fallback bleibt Vulkan-unabhängig und offline cachebar', () => {
  assert.match(source, /class WasmLLMEngine/)
  assert.match(source, /n_gpu_layers:\s*0/)
  assert.match(source, /n_threads:\s*1/)
  assert.match(source, /WASM_LLM_CONTEXT_TOKENS\s*=\s*4096/)
  assert.match(source, /compactWasmPrompt/)
  assert.match(source, /options\.maxTokens/)
  assert.match(source, /useCache:\s*true/)
  assert.match(source, /Qwen\/Qwen2\.5-0\.5B-Instruct-GGUF/)
})

test('Produktchat begrenzt CPU-Arbeit ohne die Experimentdefaults zu ändern', () => {
  const conversation = fs.readFileSync(new URL('../src/views/Conversation.tsx', import.meta.url), 'utf8')
  const graphRag = fs.readFileSync(new URL('../src/engine/graphRag.ts', import.meta.url), 'utf8')
  assert.match(conversation, /maxNodes:\s*8/)
  assert.match(conversation, /maxTokens:\s*compactLocal\s*\?\s*144\s*:\s*170/)
  assert.match(conversation, /'auto'\s*\|\s*'vector'\s*\|\s*'graph'\s*\|\s*'hybrid'/)
  assert.match(graphRag, /maxNodes:\s*14/)
})
