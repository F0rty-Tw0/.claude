import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptSubmitInput, TurnCompleteInput } from 'claude-code'

import { warning } from './register'

// The engine beneath the plugin: a context at `tokens` of a 300k compaction
// limit, recording toasts, the commands run and the context each prompt carried. Like the real engine, it
// rejects a command run while the turn still waits on its turn.complete hooks.
function world($: Engine, on: On) {
  const clock = mock.clock(on)
  const seen = { tokens: 0, toasts: [] as string[], commands: [] as string[], contexts: [] as (readonly string[])[] }
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
  on('session.id', () => ({ value: 's1' }) as never)
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
  on('tool.call', (_$, e) => (e.tool === 'Denied' ? { deny: 'no' } : { result: 'file' }) as never)
  on('prompt.submit', (_$, e) => {
    if (e.text === 'dropped') {
      return { drop: 'cleared' }
    }
    seen.contexts.push(e.context ?? [])
    return { text: e.text, context: e.context }
  })

  async function endTurn(extra: Partial<TurnCompleteInput> = {}) {
    isInTurn = true
    try {
      await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', ...extra } as TurnCompleteInput)
    } finally {
      isInTurn = false
    }
    await clock.settle()
  }

  async function useTool(agentId?: string, tool = 'Read') {
    const result = await $.tool.call({ tool, input: { file_path: '/x' }, agentId } as never)
    return (result as { context?: readonly string[] }).context ?? []
  }

  function submit(text: string, extra: Partial<PromptSubmitInput> = {}) {
    return $.prompt.submit({ text, wait: false, origin: { kind: 'composer' }, ...extra })
  }

  return { seen, endTurn, submit, useTool }
}

test('quiet below 80%, one nudge at 80%, nothing run at 90%', async ($, on) => {
  const { seen, endTurn } = world($, on)

  seen.tokens = 216_000 // 72%
  await endTurn()
  expect(seen.toasts).toEqual([])

  seen.tokens = 246_000 // 82%
  await endTurn()
  await endTurn()
  expect(seen.toasts.length).toBe(1)
  expect(seen.commands).toEqual([])

  seen.tokens = 273_000 // 91%
  await endTurn()
  await endTurn()
  expect(seen.toasts.length).toBe(1)
  expect(seen.commands).toEqual([])
})

test('a first look at 90% nudges once, runs nothing', async ($, on) => {
  const { seen, endTurn } = world($, on)

  seen.tokens = 273_000 // 91%
  await endTurn()
  await endTurn()
  expect(seen.toasts).toEqual(['Context at 91% of the compaction limit: consider /handoff (runs itself before auto-compaction)'])
  expect(seen.commands).toEqual([])
})

test('a new fill cycle after /clear nudges again, runs nothing', async ($, on) => {
  const { seen, endTurn } = world($, on)

  seen.tokens = 273_000
  await endTurn()
  seen.tokens = 20_000
  await endTurn()
  seen.tokens = 273_000
  await endTurn()
  expect(seen.toasts.length).toBe(2)
  expect(seen.commands).toEqual([])
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

test('the next prompt after the nudge carries the warning once', async ($, on) => {
  const { seen, endTurn, submit } = world($, on)

  seen.tokens = 216_000 // 72%
  await endTurn()
  await submit('below')
  seen.tokens = 246_000 // 82%
  await endTurn()
  await submit('first')
  await submit('second')
  expect(seen.contexts).toEqual([[], [warning(82)], []])
})

test('a slash command leaves the warning for the next prompt', async ($, on) => {
  const { seen, endTurn, submit } = world($, on)

  seen.tokens = 246_000
  await endTurn()
  await submit('/model', { command: { name: 'model' } } as Partial<PromptSubmitInput>)
  await submit('go on')
  expect(seen.contexts.at(-1)).toEqual([warning(82)])
})

test('a context back below 80% before the next prompt sends no warning', async ($, on) => {
  const { seen, endTurn, submit } = world($, on)

  seen.tokens = 246_000
  await endTurn()
  seen.tokens = 20_000
  await endTurn()
  await submit('fresh')
  expect(seen.contexts).toEqual([[]])
})

test('a dropped prompt leaves the warning for the next one', async ($, on) => {
  const { seen, endTurn, submit } = world($, on)

  seen.tokens = 246_000
  await endTurn()
  await submit('dropped')
  await submit('kept')
  expect(seen.contexts).toEqual([[warning(82)]])
})

test('a turn working on past 80% gets the warning on its next tool result, once', async ($, on) => {
  const { seen, endTurn, submit, useTool } = world($, on)

  seen.tokens = 216_000
  expect(await useTool()).toEqual([])
  seen.tokens = 246_000
  expect(await useTool()).toEqual([warning(82)])
  expect(await useTool()).toEqual([])
  await endTurn()
  await submit('next')
  expect(seen.toasts.length).toBe(1)
  expect(seen.contexts).toEqual([[]])
})

test("a subagent's tool result never carries the warning", async ($, on) => {
  const { seen, useTool, submit } = world($, on)

  seen.tokens = 246_000
  expect(await useTool('sub-1')).toEqual([])
  expect(seen.toasts).toEqual([])
  await submit('later')
  expect(seen.contexts).toEqual([[]])
})

test("a notification's prompt carries the warning; this mod's own does not", async ($, on) => {
  const { seen, endTurn, submit } = world($, on)

  seen.tokens = 246_000
  await endTurn()
  await submit('ping', { origin: { kind: 'plugin' } } as Partial<PromptSubmitInput>)
  await submit('agent done', { origin: { kind: 'task-notification' } } as Partial<PromptSubmitInput>)
  expect(seen.contexts).toEqual([[], [warning(82)]])
})

test('79% stays quiet, 80% nudges', async ($, on) => {
  const { seen, endTurn } = world($, on)

  seen.tokens = 237_000 // 79%
  await endTurn()
  expect(seen.toasts).toEqual([])
  seen.tokens = 240_000 // 80%
  await endTurn()
  expect(seen.toasts.length).toBe(1)
})

test('a warning armed before /clear never reaches the fresh context', async ($, on) => {
  const { seen, endTurn, submit } = world($, on)

  seen.tokens = 246_000
  await endTurn()
  seen.tokens = 5_000 // /clear or /compact: no turn ran
  await submit('fresh task')
  seen.tokens = 246_000
  await endTurn()
  await submit('full again')
  expect(seen.contexts).toEqual([[], [warning(82)]])
})

test('a denied tool call leaves the warning for the next result', async ($, on) => {
  const { seen, endTurn, useTool } = world($, on)

  seen.tokens = 246_000
  await endTurn()
  expect(await useTool(undefined, 'Denied')).toEqual([])
  expect(await useTool()).toEqual([warning(82)])
})

test('parallel tool calls past 80% carry one warning between them', async ($, on) => {
  const { seen, useTool } = world($, on)

  seen.tokens = 246_000
  const results = await Promise.all([useTool(), useTool(), useTool()])
  expect(results.flat()).toEqual([warning(82)])
  expect(seen.toasts.length).toBe(1)
})
