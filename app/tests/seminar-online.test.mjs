import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const functionSource = fs.readFileSync(
  new URL('../../supabase/functions/seminar-chat/index.ts', import.meta.url),
  'utf8',
)

test('Seminar-Edge-Function nutzt kein am 17.07.2026 abgeschaltetes Groq-Modell', () => {
  assert.doesNotMatch(functionSource, /meta-llama\/llama-4-scout-17b-16e-instruct/)
  assert.match(functionSource, /openai\/gpt-oss-120b/)
  assert.match(functionSource, /reasoning_effort:\s*'low'/)
  assert.match(functionSource, /reasoning_format:\s*'hidden'/)
})

test('Seminar-Edge-Function bleibt zeitlich und mengenmäßig begrenzt', () => {
  assert.match(functionSource, /SEMINAR_ACTIVE_UNTIL/)
  assert.match(functionSource, /consume_seminar_rate_limits/)
  assert.match(functionSource, /p_participant_limit:\s*4/)
  assert.match(functionSource, /p_room_limit:\s*28/)
})
