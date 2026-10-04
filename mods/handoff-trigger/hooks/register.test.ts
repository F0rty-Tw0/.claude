import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

// The engine beneath the plugin: a context at `tokens` of a 300k compaction
// limit, recording toasts and the commands run.
function world(on: On) {
  const clock = mock.clock(on)
  const seen = { tokens: 0, toasts: [] as string[], commands: [] as string[] }
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
    seen.commands.push(e.command)
    return { text: '' } as never
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  return { clock, seen }
}

async function endTurn($: Engine, clock: { settle: () => Promise<void> }, agentId?: string) {
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', ...(agentId ? { agentId } : {}) })
  await clock.settle()
}

test('quiet below 70%, one nudge at 70%, one run at 90%', async ($, on) => {
  const { clock, seen } = world(on)

  seen.tokens = 150_000 // 50%
  await endTurn($, clock)
  expect(seen.toasts).toEqual([])

  seen.tokens = 216_000 // 72%
  await endTurn($, clock)
  await endTurn($, clock)
  expect(seen.toasts.length).toBe(1)
  expect(seen.commands).toEqual([])

  seen.tokens = 273_000 // 91%
  await endTurn($, clock)
  await endTurn($, clock)
  expect(seen.commands).toEqual(['handoff'])
})

test('a new fill cycle after /clear nudges and runs again', async ($, on) => {
  const { clock, seen } = world(on)

  seen.tokens = 273_000
  await endTurn($, clock)
  seen.tokens = 20_000
  await endTurn($, clock)
  seen.tokens = 273_000
  await endTurn($, clock)
  expect(seen.commands).toEqual(['handoff', 'handoff'])
})

test("a subagent's turn never triggers", async ($, on) => {
  const { clock, seen } = world(on)

  seen.tokens = 290_000
  await endTurn($, clock, 'sub-1')
  expect(seen.toasts).toEqual([])
  expect(seen.commands).toEqual([])
})
