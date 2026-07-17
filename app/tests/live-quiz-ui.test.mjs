import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const quizSource = fs.readFileSync(new URL('../src/views/LiveQuiz.tsx', import.meta.url), 'utf8')
const appSource = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('QR-Einladung wartet auf Spitzname und nutzt getrennte Quiz-Kanäle', () => {
  assert.match(quizSource, /useState<Role>\('landing'\)/)
  assert.match(quizSource, /LiveTransport\.connectQuizHost/)
  assert.match(quizSource, /LiveTransport\.connectQuizPlayer/)
  assert.match(quizSource, /await transport\.send\('join', \{ player \}\)/)
  assert.doesNotMatch(quizSource, /await transport\.send\('sync-request'\)/)
})

test('Host drosselt State-Fanout und begrenzt den Raum auf zwanzig Personen', () => {
  assert.match(quizSource, /MAX_PLAYERS\s*=\s*20/)
  assert.match(quizSource, /STATE_BROADCAST_INTERVAL_MS\s*=\s*600/)
  assert.match(quizSource, /LiveQuizStateOutbox/)
  assert.match(quizSource, /stateOutboxRef\.current\.enqueue/)
  assert.match(quizSource, /current\.players\.length >= MAX_PLAYERS/)
})

test('Revision, Leave und Exit schützen die QR-Sitzung vor alten oder verwaisten Zuständen', () => {
  assert.match(quizSource, /isNewerLiveQuizState/)
  assert.match(quizSource, /revision:\s*current \? current\.revision \+ 1/)
  assert.match(quizSource, /transport\.send\('leave'/)
  assert.match(quizSource, /aus der Lobby entfernen/)
  assert.match(quizSource, /connectAttemptRef/)
  assert.match(quizSource, /exitToNoesis/)
  assert.doesNotMatch(appSource, /const sharedSession = liveQuiz \|\|/)
})

test('Geschwindigkeitsbonus verwendet ausschließlich die Host-Uhr', () => {
  assert.match(quizSource, /const receivedAt = Date\.now\(\)/)
  assert.match(quizSource, /deadlineMs \?\? receivedAt\) - receivedAt/)
  assert.doesNotMatch(quizSource, /deadlineMs \?\? payload\.at\) - payload\.at/)
})

test('Live-Quiz läuft in einer fokussierten App-Sitzung ohne Seitennavigation', () => {
  assert.match(appSource, /view === 'livequiz'/)
  assert.match(appSource, /shared-session-app/)
  assert.match(appSource, /<LiveQuiz onExit=/)
})
