import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, TurnCompleteInput } from 'claude-code'

// The engine beneath the plugin: a context at `tokens` of a 300k compaction
// limit, recording toasts and the commands run. Like the real engine, it
// rejects a command run while the turn still waits on its turn.complete hooks.
function world($: Engine, on: On) {
  const clock = mock.clock(on)
  const seen = { tokens: 0, toasts: [] as string[], commands: [] as string[] }
  let isInTurn = false
  on('session.usage', () => ({ value: {
    startedAt: 0,
    rateLimits: [],
    context: {
      tokens: seen.tokens,
      window: 1_000_000,
      breakdown: { autoCompactThreshold: 300_000 },
    },
  } }) as never)
  on('ui.toast', (_$, e) => {
    seen.toasts.push(String((e as { text: string }).text))
    return { value: undefined } as never
  })
  on('command.run', (_$, e) => {
    if (isInTurn) {
      throw new Error('command.run inside a hook the turn is waiting on')
    }
    seen.commands.push(e.command)
    return { text: '' } as never
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))

  async function endTurn(extra: Partial<TurnCompleteInput> = {}) {
    isInTurn = true
    try {
      await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', ...extra } as TurnCompleteInput)
    } finally {
      isInTurn = false
    }
    await clock.settle()
  }

  return { seen, endTurn }
}

test('quiet below 70%, one nudge at 70%, one run at 90%', async ($, on) => {
  const { seen, endTurn } = world($, on)

  seen.tokens = 150_000 // 50%
  await endTurn()
  expect(seen.toasts).toEqual([])

  seen.tokens = 216_000 // 72%
  await endTurn()
  await endTurn()
  expect(seen.toasts.length).toBe(1)
  expect(seen.commands).toEqual([])

  seen.tokens = 273_000 // 91%
  await endTurn()
  await endTurn()
  expect(seen.commands).toEqual(['handoff'])
})

test('a first look at 90% or more runs once, with no nudge after it', async ($, on) => {
  const { seen, endTurn } = world($, on)

  seen.tokens = 273_000 // 91%
  await endTurn()
  await endTurn()
  expect(seen.toasts.length).toBe(1)
  expect(seen.commands).toEqual(['handoff'])
})

test('a new fill cycle after /clear nudges and runs again', async ($, on) => {
  const { seen, endTurn } = world($, on)

  seen.tokens = 273_000
  await endTurn()
  seen.tokens = 20_000
  await endTurn()
  seen.tokens = 273_000
  await endTurn()
  expect(seen.commands).toEqual(['handoff', 'handoff'])
})

test("a subagent's turn never triggers", async ($, on) => {
  const { seen, endTurn } = world($, on)

  seen.tokens = 290_000
  await endTurn({ agentId: 'sub-1' })
  expect(seen.toasts).toEqual([])
  expect(seen.commands).toEqual([])
})

test('an interrupted or failed turn never triggers', async ($, on) => {
  const { seen, endTurn } = world($, on)

  seen.tokens = 290_000
  await endTurn({ reason: 'aborted', isAborted: true })
  await endTurn({ reason: 'error' })
  expect(seen.toasts).toEqual([])
  expect(seen.commands).toEqual([])
})
