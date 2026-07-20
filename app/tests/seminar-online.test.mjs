import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const functionSource = fs.readFileSync(
  new URL('../../supabase/functions/seminar-chat/index.ts', import.meta.url),
  'utf8',
)
const clientSource = fs.readFileSync(
  new URL('../src/engine/seminarOnline.ts', import.meta.url),
  'utf8',
)

test('Seminar-Edge-Function nutzt kein am 17.07.2026 abgeschaltetes Groq-Modell', () => {
  assert.doesNotMatch(functionSource, /meta-llama\/llama-4-scout-17b-16e-instruct/)
  assert.match(functionSource, /openai\/gpt-oss-120b/)
  assert.match(functionSource, /reasoning_effort:\s*'low'/)
  assert.match(functionSource, /include_reasoning:\s*false/)
  assert.doesNotMatch(functionSource, /\breasoning_format\s*:/)
})

test('Seminar-Edge-Function streamt nur validierte Text-Deltas bis DONE', () => {
  assert.match(functionSource, /stream:\s*true/)
  assert.match(functionSource, /text\/event-stream/)
  assert.match(functionSource, /sanitizedGroqStream/)
  assert.match(functionSource, /data: \[DONE\]/)
  assert.match(functionSource, /X-Noesis-Model/)
  assert.match(functionSource, /TEXT_MAX_COMPLETION_TOKENS\s*=\s*170/)
  assert.match(functionSource, /VOICE_MAX_COMPLETION_TOKENS\s*=\s*110/)
  assert.doesNotMatch(functionSource, /await upstream\.json\(\)/)
})

test('Seminar-Client verarbeitet SSE gedrosselt und bleibt zum JSON-Rollout kompatibel', () => {
  assert.match(clientSource, /consumeSeminarSse/)
  assert.match(clientSource, /throttleMs:\s*40/)
  assert.match(clientSource, /responseMode:\s*prompt\.responseMode/)
  assert.match(clientSource, /streamVersion:\s*1/)
  assert.match(clientSource, /contentType\.includes\('application\/json'\)/)
  assert.match(clientSource, /controller\.signal/)
})

test('Seminar-Edge-Function bleibt zeitlich und mengenmäßig begrenzt', () => {
  assert.match(functionSource, /SEMINAR_ACTIVE_UNTIL/)
  assert.match(functionSource, /consume_seminar_rate_limits/)
  assert.match(functionSource, /p_participant_limit:\s*4/)
  assert.match(functionSource, /p_room_limit:\s*28/)
})
