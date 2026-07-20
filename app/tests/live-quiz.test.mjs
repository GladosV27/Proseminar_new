import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import ts from '../node_modules/typescript/lib/typescript.js'

let source = fs.readFileSync(new URL('../src/engine/liveQuiz.ts', import.meta.url), 'utf8')
source = source.replace(
  /^import \{ createClient, type RealtimeChannel \} from '@supabase\/supabase-js'\r?$/m,
  [
    'type RealtimeChannel = any',
    'const createClient = (...args: any[]) => (globalThis as any).__liveQuizCreateClient(...args)',
  ].join('\n'),
)
source = source.replace(
  /^import \{ shareableAppUrl \} from '\.\/appUrl'\r?$/m,
  "const shareableAppUrl = () => new URL('https://gladosv27.github.io/Proseminar_new/')",
)
source = source.replace(
  /^const SUPABASE_URL = .*\r?\nconst SUPABASE_PUBLISHABLE_KEY = .*$/m,
  [
    "const SUPABASE_URL: string | undefined = 'https://test.supabase.co'",
    "const SUPABASE_PUBLISHABLE_KEY: string | undefined = 'sb_publishable_test'",
  ].join('\n'),
)

const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const live = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`)

function validState(overrides = {}) {
  return {
    version: 1,
    revision: 1,
    roomCode: 'ABC234',
    hostId: 'host-1',
    phase: 'lobby',
    questionIndex: 0,
    totalQuestions: 5,
    question: null,
    deadlineMs: null,
    answerCount: 0,
    players: [],
    reveal: null,
    updatedAt: Date.now(),
    ...overrides,
  }
}

function validQuestion() {
  return {
    id: 'question-1',
    category: 'Werkstatt',
    prompt: 'Wer schrieb das Werk?',
    options: [
      { id: 'kant', title: 'Immanuel Kant' },
      { id: 'hegel', title: 'Georg Wilhelm Friedrich Hegel' },
    ],
  }
}

function realtimeHarness() {
  const eventHandlers = new Map()
  let subscribeHandler = null
  let channelConfig = null
  let channelTopic = null
  const channel = {
    on(_type, filter, handler) {
      eventHandlers.set(filter.event, handler)
      return channel
    },
    subscribe(handler) {
      subscribeHandler = handler
      handler('SUBSCRIBED')
      return channel
    },
    async send() { return 'ok' },
    async unsubscribe() { return 'ok' },
  }
  return {
    createClient() {
      return {
        channel(topic, config) {
          channelTopic = topic
          channelConfig = config
          return channel
        },
      }
    },
    emit(event, payload) { eventHandlers.get(event)?.({ payload }) },
    status(value) { subscribeHandler?.(value) },
    get config() { return channelConfig },
    get topic() { return channelTopic },
  }
}

function routedRealtimeHarness() {
  const channels = []
  const httpMessages = []
  const websocketMessages = []

  function makeChannel(topic, config) {
    const eventHandlers = new Map()
    let subscribeHandler = null
    const record = {
      topic,
      config,
      subscribed: false,
      eventHandlers,
      channel: null,
    }
    const channel = {
      on(_type, filter, handler) {
        eventHandlers.set(filter.event, handler)
        return channel
      },
      subscribe(handler) {
        record.subscribed = true
        subscribeHandler = handler
        handler('SUBSCRIBED')
        return channel
      },
      async send(message) {
        websocketMessages.push({ topic, message })
        return 'ok'
      },
      async httpSend(event, payload, options) {
        httpMessages.push({ topic, event, payload, options })
        for (const target of channels) {
          if (!target.subscribed || target.topic !== topic) continue
          target.eventHandlers.get(event)?.({ payload })
        }
        return { success: true }
      },
      async unsubscribe() {
        record.subscribed = false
        return 'ok'
      },
    }
    record.channel = channel
    record.status = (value) => subscribeHandler?.(value)
    channels.push(record)
    return channel
  }

  return {
    createClient() {
      return { channel: (topic, config) => makeChannel(topic, config) }
    },
    channels,
    httpMessages,
    websocketMessages,
    subscribed(topic) { return channels.filter((channel) => channel.topic === topic && channel.subscribed) },
    unSubscribed(topic) { return channels.filter((channel) => channel.topic === topic && !channel.subscribed) },
  }
}

globalThis.window = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
}

test('normalisiert und validiert sechsstellige Raumcodes', () => {
  assert.equal(live.normalizeLiveRoomCode(' abc234 '), 'ABC234')
  assert.equal(live.isLiveRoomCode('ABC234'), true)
  assert.equal(live.isLiveRoomCode('ABC23'), false)
  assert.equal(live.isLiveRoomCode('ABC-34'), false)
  assert.equal(live.isLiveRoomCode('abc234'), false)
})

test('validiert einen vollständigen Spielstand und isoliert ihn nach Raumcode', () => {
  assert.equal(live.isLiveQuizState(validState(), 'abc234'), true)
  assert.equal(live.isLiveQuizState(validState({ revision: 0 })), false)
  assert.equal(live.isLiveQuizState(validState({ roomCode: 'XYZ789' }), 'ABC234'), false)
  assert.equal(live.isLiveQuizState(validState({ phase: 'unknown' })), false)
  assert.equal(live.isLiveQuizState(validState({ players: [{ id: 'p1' }] })), false)
  assert.equal(live.isLiveQuizState(validState({ answerCount: 1 })), false)
})

test('prüft phasenabhängige Frage- und Auflösungsdaten', () => {
  const question = validQuestion()
  const questionState = validState({
    phase: 'question',
    question,
    deadlineMs: Date.now() + 18_000,
  })
  assert.equal(live.isLiveQuizState(questionState), true)
  assert.equal(live.isLiveQuizState({ ...questionState, deadlineMs: null }), false)
  assert.equal(live.isLiveQuizState({
    ...questionState,
    phase: 'reveal',
    deadlineMs: null,
    reveal: {
      correctId: 'kant',
      explanation: 'Kant schrieb das Werk.',
      classification: 'Direktes Werkswissen',
      graphNodeIds: ['kant', 'werk'],
    },
  }), true)
  assert.equal(live.isLiveQuizState({
    ...questionState,
    phase: 'reveal',
    deadlineMs: null,
    reveal: {
      correctId: 'nicht-vorhanden',
      explanation: 'Ungültig',
      classification: 'Ungültig',
      graphNodeIds: [],
    },
  }), false)
})

test('validiert Join-, Antwort- und Themen-Payloads defensiv', () => {
  assert.equal(live.isLiveJoinPayload({ player: { id: 'p-1', name: 'Ada', color: '#D45D43' } }), true)
  assert.equal(live.isLiveJoinPayload({ player: { id: 'p-1', name: '', color: 'red' } }), false)

  assert.equal(live.isLiveAnswerPayload({ playerId: 'p-1', questionId: 'q-1', optionId: 'a', at: Date.now() }), true)
  assert.equal(live.isLiveAnswerPayload({ playerId: 'p-1', questionId: 'q-1', optionId: 'a', at: Number.NaN }), false)

  assert.equal(live.isLiveLeavePayload({ playerId: 'p-1' }), true)
  assert.equal(live.isLiveLeavePayload({ playerId: '' }), false)

  assert.equal(live.isTopicSuggestionPayload({ id: 's-1', playerId: 'p-1', playerName: 'Ada', topic: 'Hannah Arendt' }), true)
  assert.equal(live.isTopicSuggestionPayload({ id: 's-1', playerId: 'p-1', playerName: 'Ada', topic: 'x'.repeat(81) }), false)

  assert.equal(live.isTopicDecisionPayload({ id: 's-1', topic: 'Hannah Arendt', accepted: true, message: 'Übernommen.' }), true)
  assert.equal(live.isTopicDecisionPayload({ id: 's-1', topic: 'Hannah Arendt', accepted: 'ja', message: 'Übernommen.' }), false)
})

test('ordnet Phasenwechsel, coalesct Zwischenstände und verwirft alte Revisionen', () => {
  const lobby = validState({ revision: 1 })
  const joined = validState({ revision: 2, players: [{ id: 'p-1', name: 'Ada', color: '#D45D43', score: 0, streak: 0, answered: false }] })
  const question = validState({ revision: 3, phase: 'question', question: validQuestion(), deadlineMs: Date.now() + 18_000 })
  const reveal = validState({
    revision: 4,
    phase: 'reveal',
    question: validQuestion(),
    reveal: { correctId: 'kant', explanation: 'Kant schrieb das Werk.', classification: 'Direktes Wissen', graphNodeIds: ['kant'] },
  })
  const nextQuestion = validState({ revision: 5, phase: 'question', questionIndex: 1, question: validQuestion(), deadlineMs: Date.now() + 18_000 })
  const outbox = new live.LiveQuizStateOutbox()

  outbox.enqueue(lobby, true)
  outbox.enqueue(joined, false)
  outbox.enqueue(question, live.isLiveQuizTransition(joined, question))
  outbox.enqueue(reveal, live.isLiveQuizTransition(question, reveal))
  outbox.enqueue(nextQuestion, live.isLiveQuizTransition(reveal, nextQuestion))

  assert.deepEqual(
    [outbox.dequeue(), outbox.dequeue(), outbox.dequeue(), outbox.dequeue()].map((state) => state?.revision ?? null),
    [1, 3, 4, 5],
  )
  assert.equal(outbox.hasPending(), false)
  assert.equal(live.isNewerLiveQuizState(reveal, nextQuestion), true)
  assert.equal(live.isNewerLiveQuizState(nextQuestion, reveal), false)
})

test('fordert Broadcast-Acks an und meldet nur spätere Verbindungsänderungen', async () => {
  const harness = realtimeHarness()
  globalThis.__liveQuizCreateClient = harness.createClient
  const statuses = []

  const transport = await live.LiveTransport.connect('abc234', {
    onState: () => undefined,
    onConnectionStatus: (status) => statuses.push(status),
  })

  assert.equal(harness.topic, 'graph-rag-live:ABC234')
  assert.deepEqual(harness.config, { config: { broadcast: { self: false, ack: true } } })
  assert.deepEqual(statuses, [])

  harness.status('CHANNEL_ERROR')
  harness.status('SUBSCRIBED')
  harness.status('TIMED_OUT')
  harness.status('CLOSED')
  assert.deepEqual(statuses, ['error', 'connected', 'timed-out', 'disconnected'])

  transport.close()
  harness.status('CLOSED')
  assert.deepEqual(statuses, ['error', 'connected', 'timed-out', 'disconnected'])
})

test('leitet nur validierte Broadcast-Payloads an Handler weiter', async () => {
  const harness = realtimeHarness()
  globalThis.__liveQuizCreateClient = harness.createClient
  const received = { states: 0, joins: 0, answers: 0, suggestions: 0, decisions: 0 }

  await live.LiveTransport.connect('ABC234', {
    onState: () => { received.states += 1 },
    onJoin: () => { received.joins += 1 },
    onAnswer: () => { received.answers += 1 },
    onTopicSuggestion: () => { received.suggestions += 1 },
    onTopicDecision: () => { received.decisions += 1 },
  })

  harness.emit('state', validState())
  harness.emit('state', validState({ roomCode: 'XYZ789' }))
  harness.emit('join', { player: { id: 'p-1', name: 'Ada', color: '#D45D43' } })
  harness.emit('join', { player: { id: 'p-2', name: '', color: 'red' } })
  harness.emit('answer', { playerId: 'p-1', questionId: 'q-1', optionId: 'a', at: Date.now() })
  harness.emit('answer', { playerId: 'p-1', questionId: 'q-1', optionId: 'a', at: null })
  harness.emit('topic-suggest', { id: 's-1', playerId: 'p-1', playerName: 'Ada', topic: 'Hannah Arendt' })
  harness.emit('topic-suggest', { id: 's-2', playerId: 'p-1', playerName: 'Ada', topic: '' })
  harness.emit('topic-decision', { id: 's-1', topic: 'Hannah Arendt', accepted: true, message: 'Übernommen.' })
  harness.emit('topic-decision', { id: 's-2', topic: 'Hannah Arendt', accepted: 'ja', message: 'Ungültig.' })

  assert.deepEqual(received, { states: 1, joins: 1, answers: 1, suggestions: 1, decisions: 1 })
})

test('Quiz-Transport trennt Host- und State-Topic und sendet ausschließlich per HTTP', async () => {
  const harness = routedRealtimeHarness()
  globalThis.__liveQuizCreateClient = harness.createClient
  const hostTopic = 'graph-rag-live:ABC234:host'
  const stateTopic = 'graph-rag-live:ABC234:state'

  const host = await live.LiveTransport.connectQuizHost('abc234', {})
  assert.equal(harness.subscribed(hostTopic).length, 1)
  assert.equal(harness.subscribed(stateTopic).length, 0)
  assert.equal(harness.unSubscribed(stateTopic).length, 1)

  await host.send('state', validState())
  assert.deepEqual(harness.httpMessages.at(-1), {
    topic: stateTopic,
    event: 'state',
    payload: validState({ updatedAt: harness.httpMessages.at(-1).payload.updatedAt }),
    options: { timeout: 8_000 },
  })
  await assert.rejects(
    host.send('answer', { playerId: 'p-1', questionId: 'q-1', optionId: 'a', at: Date.now() }),
    /Quiz-Host/,
  )

  const player = await live.LiveTransport.connectQuizPlayer('ABC234', { onState: () => undefined })
  assert.equal(harness.subscribed(stateTopic).length, 1)
  assert.equal(harness.unSubscribed(hostTopic).length, 1)
  await player.send('join', { player: { id: 'p-1', name: 'Ada', color: '#D45D43' } })
  await player.send('answer', { playerId: 'p-1', questionId: 'q-1', optionId: 'a', at: Date.now() })
  await player.send('leave', { playerId: 'p-1' })
  await player.send('sync-request')
  assert.deepEqual(harness.httpMessages.slice(-4).map(({ topic, event }) => ({ topic, event })), [
    { topic: hostTopic, event: 'join' },
    { topic: hostTopic, event: 'answer' },
    { topic: hostTopic, event: 'leave' },
    { topic: hostTopic, event: 'sync-request' },
  ])
  assert.equal(harness.websocketMessages.length, 0)
  await assert.rejects(player.send('state', validState()), /Quiz-Spieler/)
  await assert.rejects(player.send('sync-request', { unexpected: true }), /Synchronisationsanfrage/)
})

test('Quizantworten erreichen nur den Host und werden nicht an andere Spieler aufgefächert', async () => {
  const harness = routedRealtimeHarness()
  globalThis.__liveQuizCreateClient = harness.createClient
  let hostAnswers = 0
  let hostLeaves = 0
  let hostSyncRequests = 0
  let playerAStates = 0
  let playerBStates = 0

  const host = await live.LiveTransport.connectQuizHost('ABC234', {
    onAnswer: () => { hostAnswers += 1 },
    onLeave: () => { hostLeaves += 1 },
    onSyncRequest: () => { hostSyncRequests += 1 },
  })
  const playerA = await live.LiveTransport.connectQuizPlayer('ABC234', {
    onState: () => { playerAStates += 1 },
  })
  await live.LiveTransport.connectQuizPlayer('ABC234', {
    onState: () => { playerBStates += 1 },
  })

  await playerA.send('answer', { playerId: 'p-1', questionId: 'q-1', optionId: 'kant', at: Date.now() })
  await playerA.send('leave', { playerId: 'p-1' })
  await playerA.send('sync-request')
  assert.equal(hostAnswers, 1)
  assert.equal(hostLeaves, 1)
  assert.equal(hostSyncRequests, 1)
  assert.equal(playerAStates, 0)
  assert.equal(playerBStates, 0)

  await host.send('state', validState())
  assert.equal(playerAStates, 1)
  assert.equal(playerBStates, 1)
  assert.equal(hostAnswers, 1)

  const beforeInvalid = harness.httpMessages.length
  await assert.rejects(
    playerA.send('answer', { playerId: 'p-1', questionId: 'q-1', optionId: 'kant', at: Number.NaN }),
    /ungültig/,
  )
  assert.equal(harness.httpMessages.length, beforeInvalid)

  const playerHostHttpChannel = harness.unSubscribed('graph-rag-live:ABC234:host')[0].channel
  await playerHostHttpChannel.httpSend('answer', { playerId: '', questionId: 'q-1', optionId: 'kant', at: Date.now() })
  await playerHostHttpChannel.httpSend('sync-request', { unexpected: true })
  assert.equal(hostAnswers, 1)
  assert.equal(hostSyncRequests, 1)
})
