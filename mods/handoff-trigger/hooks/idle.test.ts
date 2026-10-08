import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { FsStat, On, PromptSubmitResult, TurnCompleteInput } from 'claude-code'

import { HANDOFF_ARGS, PING_TEXT } from './idle'

// TTL_MS − LEAD_MS in idle.ts: how long an armed timer waits.
const WAKE_MS = 55 * 60_000
const TTL_MS = 60 * 60_000
const HOME = 'C:\\Users\\me'
const HANDOFF = `${HOME}\\.claude\\handoffs\\2026-10-08-1200-task.md`
const COLD_DROP = 'Cache cold: clearing and continuing from the handoff with your prompt.'
const PENDING_DROP = 'Added to your prompt that is being continued from the handoff.'
const RESENT_DROP = 'Already sent after clearing.'

type Submit = {
  readonly text: string
  readonly origin: string
  readonly asUser?: true
}

// register.test.ts's world, plus what idle.ts reads: a clock past the epoch,
// the home folder, files by path (either slash) with their mtimes, and a
// session id that changes on /clear, which ends the session like the real one
// (`clear` set to 'stuck' keeps the id, 'rejected' throws). Records submits,
// commands (and their args) and toasts; a plugin's submit is dropped with
// `drop` when it is set, rejects when `isRejecting` is, and an `asUser` one
// stays in flight for `holdMs`, as does a /clear after its session.end, and a
// ping for `pingHoldMs`.
// /handoff rejects when `isHandoffRejecting` is; holdUsage() parks every
// session.usage call until the function it returns is called.
function world($: Engine, on: On) {
  const clock = mock.clock(on, { now: 1_000_000_000 })
  const seen = {
    tokens: 100_000,
    toasts: [] as string[],
    commands: [] as string[],
    args: [] as string[],
    submits: [] as Submit[],
    files: new Map<string, number>(),
    drop: undefined as string | undefined,
    isRejecting: false,
    isHandoffRejecting: false,
    clear: 'new' as 'new' | 'stuck' | 'rejected',
    holdMs: 0,
    pingHoldMs: 0,
  }
  let isInTurn = false
  let sessions = 0
  let usageGate: Promise<void> | undefined
  mock.env(on, { USERPROFILE: HOME })
  on('session.usage', async () => {
    await usageGate

    return { value: {
      startedAt: 0,
      rateLimits: [],
      context: {
        tokens: seen.tokens,
        window: 1_000_000,
        breakdown: { autoCompactThreshold: 300_000 },
      },
    } } as never
  })
  on('session.id', () => ({ value: `session-${sessions}` }))
  on('fs.stat', (_$, e) => {
    const mtimeMs = seen.files.get(slashed(e.path))
    if (mtimeMs === undefined) return { deny: `ENOENT: ${e.path}` }

    const stat: FsStat = { kind: 'file', size: 1, mtimeMs, isLink: false }

    return { value: stat }
  })
  on('ui.toast', (_$, e) => {
    seen.toasts.push(String((e as { text: string }).text))
    return { value: undefined } as never
  })
  on('command.run', async (_$, e) => {
    if (isInTurn) {
      throw new Error('command.run inside a hook the turn is waiting on')
    }
    seen.commands.push(e.command)
    seen.args.push(e.args)
    if (e.command === 'clear' && seen.clear === 'rejected') throw new Error('clear rejected')
    if (e.command === 'handoff' && seen.isHandoffRejecting) throw new Error('handoff rejected')
    if (e.command === 'clear' && seen.clear === 'new') {
      const sessionId = `session-${sessions}`
      sessions += 1
      await $.session.end({ reason: 'clear', sessionId, resume: { id: sessionId } })
      if (seen.holdMs > 0) await clock.sleep(seen.holdMs)
    }
    return { text: '' } as never
  })
  on('prompt.submit', async (_$, e) => {
    const isPlugin = e.origin.kind === 'plugin'
    const asUser = e.origin.kind === 'plugin' ? e.origin.asUser : undefined
    seen.submits.push({ text: e.text, origin: e.origin.kind, asUser })
    if (asUser && seen.holdMs > 0) await clock.sleep(seen.holdMs)
    if (isPlugin && !asUser && seen.pingHoldMs > 0) await clock.sleep(seen.pingHoldMs)
    if (isPlugin && seen.isRejecting) throw new Error('submit rejected')
    if (isPlugin && seen.drop !== undefined) return { drop: seen.drop }

    return { text: e.text }
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))

  // A file written now, during the turn about to run, or `ageMs` before it.
  function write(path: string, ageMs = 0) {
    seen.files.set(slashed(path), clock.now() - ageMs)
  }

  async function startTurn() {
    await $.turn.start({ text: '', turnId: 't' })
  }

  async function completeTurn(extra: Partial<TurnCompleteInput> = {}) {
    isInTurn = true
    try {
      await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', ...extra } as TurnCompleteInput)
    } finally {
      isInTurn = false
    }
    await clock.settle()
  }

  async function endTurn(extra: Partial<TurnCompleteInput> = {}) {
    await startTurn()
    await completeTurn(extra)
  }

  async function type(text: string, turnId?: string): Promise<PromptSubmitResult> {
    return $.prompt.submit({ text, wait: false, origin: { kind: 'composer' }, turnId })
  }

  async function idle() {
    await clock.advance(WAKE_MS)
  }

  // A handoff turn (which does not arm), then a full TTL with nobody there.
  async function goCold() {
    write(HANDOFF)
    await endTurn({ answer: `Handoff written to ${HANDOFF}` })
    await clock.advance(TTL_MS)
  }

  // Composer submits that reached the world: prompts the mod passed.
  function passed() {
    return seen.submits.filter(submit => submit.origin === 'composer').map(submit => submit.text)
  }

  function resubmits() {
    return seen.submits.filter(submit => submit.asUser).map(submit => submit.text)
  }

  // PINGS (2) wakes that ping, each ping answered by its turn, then the
  // handoff wake.
  async function idleUntilHandoff() {
    for (let wake = 0; wake < 3; wake += 1) {
      await endTurn()
      await idle()
    }
  }

  // Framed submits of PING_TEXT: how many wakes pinged.
  function pings() {
    return seen.submits.filter(isPing).length
  }

  function holdUsage() {
    let release = () => {}
    usageGate = new Promise<void>(resolve => {
      release = resolve
    })

    return release
  }

  return { clock, seen, write, startTurn, completeTurn, endTurn, type, idle, idleUntilHandoff, pings, goCold, passed, resubmits, holdUsage }
}

// What continueFresh submits for a prompt the cold path dropped.
function resubmit(text: string) {
  return `Continue from the handoff in ${HANDOFF}: read it and run its Verify command, then\n`
    + `act on my new request below. It overrides the handoff's Next step.\n\n${text}`
}

function failed(text: string) {
  return `Couldn't continue from the handoff. Your prompt: ${text}`
}

function slashed(path: string) {
  return path.replaceAll('\\', '/')
}

function isPing(submit: Submit) {
  return submit.text === PING_TEXT && submit.origin === 'plugin' && submit.asUser === undefined
}

test('an answer turn at MIN_TOKENS arms the idle wake; below it, nothing', async ($, on) => {
  const { seen, endTurn, idle, pings } = world($, on)

  seen.tokens = 49_999
  await endTurn()
  await idle()
  expect(pings()).toBe(0)

  seen.tokens = 50_000
  await endTurn()
  await idle()
  expect(pings()).toBe(1)
})

test('a reply naming a handoff written before the turn is not a handoff', async ($, on) => {
  const { write, endTurn, idle, pings } = world($, on)

  write(HANDOFF, 1)
  await endTurn({ answer: `Continue from ${HANDOFF}` })
  await idle()
  expect(pings()).toBe(1)
})

test('a fresh handoff counts in its ~/ and C:\\ spellings, and the turn does not arm', async ($, on) => {
  const { write, endTurn, idle, pings } = world($, on)

  write(`${HOME}/.claude/handoffs/a.md`)
  await endTurn({ answer: 'Handoff written to ~/.claude/handoffs/a.md' })
  await idle()
  expect(pings()).toBe(0)

  write(HANDOFF)
  await endTurn({ answer: `Handoff written to ${HANDOFF}` })
  await idle()
  expect(pings()).toBe(0)
})

test('a /clear (session.end) cancels the armed wake', async ($, on) => {
  const { endTurn, idle, pings } = world($, on)

  await endTurn()
  await $.session.end({ reason: 'clear', sessionId: 'session-0', resume: { id: 'session-0' } })
  await idle()
  expect(pings()).toBe(0)
})

test('turn.start cancels the armed wake', async ($, on) => {
  const { endTurn, startTurn, idle, pings } = world($, on)

  await endTurn()
  await startTurn()
  await idle()
  expect(pings()).toBe(0)
})

test('a prompt typed into the handoff turn: no handoff recorded, the turn arms', async ($, on) => {
  const { write, startTurn, completeTurn, type, idle, pings } = world($, on)

  await startTurn()
  write(HANDOFF)
  await type('also check the tests', 't')
  await completeTurn({ answer: `Handoff written to ${HANDOFF}` })
  await idle()
  expect(pings()).toBe(1)
})

test('a 90% /handoff turn naming a fresh path does not arm', async ($, on) => {
  const { seen, write, endTurn, idle, pings } = world($, on)

  seen.tokens = 273_000 // 91%: register.ts runs /handoff
  await endTurn()
  expect(seen.commands).toEqual(['handoff'])

  write(HANDOFF)
  await endTurn({ answer: `Handoff written to ${HANDOFF}` })
  await idle()
  expect(pings()).toBe(0)
})

test('a path in **…**, (…) or a markdown link is found without the markup', async ($, on) => {
  const { write, endTurn, idle, pings } = world($, on)
  const replies = [
    `Handoff: **${HANDOFF}**`,
    `Handoff written (${HANDOFF}).`,
    `See [the handoff](~/.claude/handoffs/2026-10-08-1200-task.md).`,
  ]

  for (const answer of replies) {
    write(HANDOFF)
    await endTurn({ answer })
    await idle()
  }
  expect(pings()).toBe(0)
})

test('idle wakes ping, ping, then run /handoff once; each ping turn re-arms, the handoff turn does not', async ($, on) => {
  const { seen, write, endTurn, idle, pings } = world($, on)

  await endTurn()
  await idle()
  expect(pings()).toBe(1)

  await endTurn() // the ping's own turn
  await idle()
  expect(pings()).toBe(2)
  expect(seen.commands).toEqual([])

  await endTurn()
  await idle()
  expect(seen.commands).toEqual(['handoff'])

  write(HANDOFF)
  await endTurn({ answer: `Handoff written to ${HANDOFF}` })
  await idle()
  expect(pings()).toBe(2)
  expect(seen.commands).toEqual(['handoff'])
})

test('a handoff whose path is missed does not re-arm; a person prompt clears that', async ($, on) => {
  const { seen, endTurn, type, idle, idleUntilHandoff, pings } = world($, on)

  await idleUntilHandoff()
  await endTurn({ answer: 'Handoff written somewhere' })
  await idle()
  expect(pings()).toBe(2)
  expect(seen.commands).toEqual(['handoff'])

  await type('back again')
  await endTurn()
  await idle()
  expect(pings()).toBe(3)
})

test('a person prompt after one ping resets the count: the next spell pings twice again', async ($, on) => {
  const { seen, endTurn, type, idle, pings } = world($, on)

  await endTurn()
  await idle()
  await endTurn()
  await type('back again')
  for (let wake = 0; wake < 2; wake += 1) {
    await endTurn()
    await idle()
  }
  expect(pings()).toBe(3)
  expect(seen.commands).toEqual([])
})

test('a ping dropped for another reason runs /handoff on the same wake', async ($, on) => {
  const { seen, endTurn, idle, pings } = world($, on)

  seen.drop = 'other'
  await endTurn()
  await idle()
  expect(pings()).toBe(1)
  expect(seen.commands).toEqual(['handoff'])
})

test('a rejected ping runs /handoff with HANDOFF_ARGS on the same wake', async ($, on) => {
  const { seen, endTurn, idle } = world($, on)

  seen.isRejecting = true
  await endTurn()
  await idle()
  expect(seen.submits.length).toBe(1)
  expect(seen.commands).toEqual(['handoff'])
  expect(seen.args).toEqual([HANDOFF_ARGS])
})

test('pings are framed PING_TEXT submits and pass the mod without resetting the count', async ($, on) => {
  const { seen, idleUntilHandoff } = world($, on)
  const ping: Submit = { text: PING_TEXT, origin: 'plugin', asUser: undefined }

  await idleUntilHandoff()
  expect(seen.submits).toEqual([ping, ping])
  expect(seen.commands).toEqual(['handoff'])
})

test('a ping dropped by cold-cache, bare or prefixed, ends the spell with no /handoff', async ($, on) => {
  const { seen, endTurn, type, idle, pings } = world($, on)

  for (const drop of ['Prompt cache expired: x', 'Hook blocked: Prompt cache expired: x']) {
    seen.drop = drop
    await type('back again')
    await endTurn()
    await idle()
    await endTurn()
    await idle()
  }
  expect(pings()).toBe(2)
  expect(seen.commands).toEqual([])
})

test('a person prompt with no turn.start while armed: the wake sends nothing', async ($, on) => {
  const { seen, endTurn, type, idle, pings } = world($, on)

  await endTurn()
  await type('queued while idle')
  await idle()
  expect(pings()).toBe(0)
  expect(seen.commands).toEqual([])
})

test('the idle /handoff runs with HANDOFF_ARGS', async ($, on) => {
  const { seen, idleUntilHandoff } = world($, on)

  await idleUntilHandoff()
  expect(seen.args).toEqual([HANDOFF_ARGS])
})

test('a ping turn ending in error runs /handoff on the next tick; ending aborted, nothing', async ($, on) => {
  const { seen, endTurn, type, idle, pings } = world($, on)

  await endTurn()
  await idle()
  await endTurn({ reason: 'error' }) // the ping's own turn
  expect(pings()).toBe(1)
  expect(seen.commands).toEqual(['handoff'])
  expect(seen.args).toEqual([HANDOFF_ARGS])

  await type('back again')
  await endTurn()
  await idle()
  await endTurn({ reason: 'aborted' }) // a person interrupted the ping's turn
  await idle()
  expect(pings()).toBe(2)
  expect(seen.commands).toEqual(['handoff'])
})

test('a ping turn failing after the cache went cold runs no /handoff (the sleep guard)', async ($, on) => {
  const { clock, seen, startTurn, completeTurn, endTurn, idle, pings } = world($, on)

  await endTurn()
  await idle()
  await startTurn() // the ping's own turn, 10 minutes long
  await clock.advance(10 * 60_000)
  await completeTurn({ reason: 'error' })
  await clock.advance(0)
  expect(pings()).toBe(1)
  expect(seen.commands).toEqual([])
})

test('a ping queued behind a person turn re-arms once: one /handoff, no loop', async ($, on) => {
  const { seen, endTurn, type, idle, pings } = world($, on)

  await endTurn()
  await idle()
  await type('typed as the ping went out')
  await endTurn() // the person's turn
  await endTurn() // the queued ping's turn
  for (let wake = 0; wake < 3; wake += 1) {
    await idle()
    await endTurn()
  }
  await idle()
  expect(pings()).toBe(3)
  expect(seen.commands).toEqual(['handoff'])
})

test('a warm prompt passes untouched, even with a handoff', async ($, on) => {
  const { clock, seen, write, endTurn, type, passed } = world($, on)

  write(HANDOFF)
  await endTurn({ answer: `Handoff written to ${HANDOFF}` })
  await clock.advance(TTL_MS - 1)
  const result = await type('next step')
  await clock.settle()
  expect(result.drop).toBeUndefined()
  expect(passed()).toEqual(['next step'])
  expect(seen.commands).toEqual([])
})

test('a cold prompt with a handoff is dropped, then /clear and an asUser resubmit carry the path and the prompt', async ($, on) => {
  const { clock, seen, type, goCold, passed, resubmits } = world($, on)

  await goCold()
  expect(await type('fix the bug')).toEqual({ drop: COLD_DROP })
  await clock.settle()
  expect(seen.commands).toEqual(['clear'])
  expect(resubmits()).toEqual([resubmit('fix the bug')])
  expect(passed()).toEqual([])
  expect(seen.toasts).toEqual([])
})

test('/ commands, attachments and non-person prompts pass a cold handoff untouched', async ($, on) => {
  const { clock, seen, type, goCold, passed } = world($, on)

  await goCold()
  await type('/context')
  await $.prompt.submit({ text: 'see the image', wait: false, origin: { kind: 'composer' }, attachments: [{ type: 'image' }] })
  await $.prompt.submit({ text: 'from a peer', wait: false, origin: { kind: 'peer' } })
  await clock.settle()
  expect(passed()).toEqual(['/context', 'see the image'])
  expect(seen.submits.map(submit => submit.text)).toContain('from a peer')
  expect(seen.commands).toEqual([])
  expect(await type('fix the bug')).toEqual({ drop: COLD_DROP })
})

test('a turn without a handoff after a handoff turn: a later cold prompt passes', async ($, on) => {
  const { clock, seen, write, endTurn, type, passed } = world($, on)

  seen.tokens = 1_000 // no wake
  write(HANDOFF)
  await endTurn({ answer: `Handoff written to ${HANDOFF}` })
  await endTurn()
  await clock.advance(TTL_MS)
  await type('back again')
  await clock.settle()
  expect(passed()).toEqual(['back again'])
  expect(seen.commands).toEqual([])
})

test('a manual /handoff 55 min after the answer moves lastResponseAt: a prompt at 70 min is warm', async ($, on) => {
  const { clock, seen, write, endTurn, type, passed } = world($, on)

  seen.tokens = 1_000 // no wake
  await endTurn()
  await clock.advance(55 * 60_000)
  write(HANDOFF)
  await endTurn({ answer: `Handoff written to ${HANDOFF}` })
  await clock.advance(15 * 60_000)
  await type('back again')
  await clock.settle()
  expect(passed()).toEqual(['back again'])
  expect(seen.commands).toEqual([])
})

test('a user /clear (session.end) forgets the handoff: a later cold prompt passes', async ($, on) => {
  const { clock, seen, write, endTurn, type, passed } = world($, on)

  write(HANDOFF)
  await endTurn({ answer: `Handoff written to ${HANDOFF}` })
  await $.session.end({ reason: 'clear', sessionId: 'session-0', resume: { id: 'session-0' } })
  await clock.advance(TTL_MS)
  await type('back again')
  await clock.settle()
  expect(passed()).toEqual(['back again'])
  expect(seen.commands).toEqual([])
})

test('re-sends while the cold path is pending are dropped and appended once: one resubmit', async ($, on) => {
  const { clock, seen, type, goCold, passed, resubmits } = world($, on)

  await goCold()
  expect(await type('fix the bug')).toEqual({ drop: COLD_DROP })
  expect(await type('fix the bug')).toEqual({ drop: PENDING_DROP })
  expect(await type('/also the tests')).toEqual({ drop: PENDING_DROP })
  await clock.settle()
  expect(resubmits()).toEqual([resubmit('fix the bug\n\n/also the tests')])
  expect(seen.commands).toEqual(['clear'])
  expect(passed()).toEqual([])
})

test('the same prompt re-sent within DUP_MS of the resubmit is dropped; after it, it passes', async ($, on) => {
  const { clock, type, goCold, passed, resubmits } = world($, on)

  await goCold()
  await type('fix the bug')
  await clock.settle()
  expect(await type(' fix the bug ')).toEqual({ drop: RESENT_DROP })
  await clock.advance(5 * 60_000)
  await type('fix the bug')
  expect(resubmits().length).toBe(1)
  expect(passed()).toEqual(['fix the bug'])
})

test('a /clear that keeps the session id, or rejects: toast with the prompt, no resubmit, pending cleared', async ($, on) => {
  const { clock, seen, type, goCold, passed, resubmits } = world($, on)

  for (const clear of ['stuck', 'rejected'] as const) {
    seen.clear = clear
    await goCold()
    await type('fix the bug')
    await clock.settle()
    await type('again')
  }
  expect(seen.toasts).toEqual([failed('fix the bug'), failed('fix the bug')])
  expect(resubmits()).toEqual([])
  expect(passed()).toEqual(['again', 'again'])
})

test('a resubmit dropped beneath: toast with the prompt, and a re-send is not a duplicate', async ($, on) => {
  const { clock, seen, type, goCold, passed, resubmits } = world($, on)

  seen.drop = 'blocked'
  await goCold()
  await type('fix the bug')
  await clock.settle()
  expect(resubmits()).toEqual([resubmit('fix the bug')])
  expect(seen.toasts).toEqual([failed('fix the bug')])
  await type('fix the bug')
  expect(passed()).toEqual(['fix the bug'])
})

test('a re-send while the resubmit is in flight is a duplicate, not appended', async ($, on) => {
  const { clock, seen, type, goCold, resubmits } = world($, on)

  seen.holdMs = 1_000
  await goCold()
  await type('fix the bug')
  await clock.advance(1_000) // the /clear
  expect(await type('fix the bug')).toEqual({ drop: RESENT_DROP })
  await clock.advance(1_000)
  expect(resubmits()).toEqual([resubmit('fix the bug')])
  expect(seen.toasts).toEqual([])
})

test('a re-send while /clear runs is appended: pending outlives the session.end', async ($, on) => {
  const { clock, seen, type, goCold, resubmits } = world($, on)

  seen.holdMs = 1_000
  await goCold()
  await type('fix the bug')
  await clock.settle()
  expect(await type('and the tests')).toEqual({ drop: PENDING_DROP })
  await clock.advance(2_000)
  expect(resubmits()).toEqual([resubmit('fix the bug\n\nand the tests')])
})

test('a / command typed during an idle wait leaves the wake in place', async ($, on) => {
  const { clock, endTurn, type, pings } = world($, on)

  await endTurn()
  await clock.advance(10 * 60_000)
  await type('/context')
  await clock.advance(WAKE_MS - 10 * 60_000)
  expect(pings()).toBe(1)
})

test('a turn starting while the last one settles cancels that wake: no ping inside the running turn', async ($, on) => {
  const { clock, startTurn, completeTurn, holdUsage, idle, pings } = world($, on)

  await startTurn()
  const release = holdUsage()
  const completing = completeTurn()
  await clock.settle()
  await startTurn() // the next turn, still running at the wake
  release()
  await completing
  await idle()
  expect(pings()).toBe(0)
})

test('two turns settling together arm one wake: one ping on the first wake', async ($, on) => {
  const { clock, startTurn, completeTurn, holdUsage, idle, pings } = world($, on)

  await startTurn()
  const release = holdUsage()
  const first = completeTurn()
  await clock.settle()
  await startTurn()
  const second = completeTurn()
  await clock.settle()
  release()
  await Promise.all([first, second])
  await idle()
  expect(pings()).toBe(1)
})

test('an idle /handoff that rejects shows a toast', async ($, on) => {
  const { seen, idleUntilHandoff } = world($, on)

  seen.isHandoffRejecting = true
  await idleUntilHandoff()
  expect(seen.commands).toEqual(['handoff'])
  expect(seen.toasts.at(-1)).toBe('Idle: /handoff could not run')
})

test('the same prompt sent again after the resubmitted turn answered passes', async ($, on) => {
  const { clock, endTurn, type, goCold, passed } = world($, on)

  await goCold()
  await type('continue')
  await clock.settle()
  await endTurn() // the resubmit's turn
  await clock.advance(2 * 60_000)
  expect((await type('continue')).drop).toBeUndefined()
  expect(passed()).toEqual(['continue'])
})

test('the idle /handoff turn ending in error runs no second /handoff', async ($, on) => {
  const { seen, endTurn, idle, idleUntilHandoff } = world($, on)

  await idleUntilHandoff()
  await endTurn({ reason: 'error' }) // the /handoff's own turn
  await idle()
  expect(seen.commands).toEqual(['handoff'])
})

test('a subagent turn leaves the idle state alone: no handoff recorded, no failed ping', async ($, on) => {
  const { seen, write, endTurn, completeTurn, idle, pings } = world($, on)

  await endTurn()
  write(HANDOFF)
  await completeTurn({ answer: `Handoff written to ${HANDOFF}`, agentId: 'sub-1' })
  await idle()
  expect(pings()).toBe(1)

  await completeTurn({ reason: 'error', agentId: 'sub-1' })
  expect(seen.commands).toEqual([])
})

test('a ping turn ending in refusal runs /handoff on the next tick', async ($, on) => {
  const { seen, endTurn, idle } = world($, on)

  await endTurn()
  await idle()
  await endTurn({ reason: 'refusal', refusal: { category: null, explanation: null } }) // the ping's own turn
  expect(seen.commands).toEqual(['handoff'])
})

test('a prompt typed into a turn past the TTL since a handoff passes: no /clear mid-turn', async ($, on) => {
  const { clock, seen, write, startTurn, endTurn, type, passed, resubmits } = world($, on)

  write(HANDOFF)
  await endTurn({ answer: `Handoff written to ${HANDOFF}` })
  await clock.advance(50 * 60_000)
  await type('implement the parser')
  await startTurn()
  await clock.advance(11 * 60_000)
  const result = await type('also add a test', 't')
  await clock.settle()
  expect(result.drop).toBeUndefined()
  expect(passed()).toEqual(['implement the parser', 'also add a test'])
  expect(seen.commands).toEqual([])
  expect(resubmits()).toEqual([])
})

test('the same prompt sent again after the resubmitted turn ended in error or aborted passes', async ($, on) => {
  const { clock, type, goCold, endTurn, passed } = world($, on)

  for (const reason of ['error', 'aborted'] as const) {
    await goCold()
    await type('fix the bug')
    await clock.settle()
    await endTurn({ reason }) // the resubmit's turn
    expect((await type('fix the bug')).drop).toBeUndefined()
  }
  expect(passed()).toEqual(['fix the bug', 'fix the bug'])
})

test('a person prompt while the ping is in flight: a ping dropped for another reason runs no /handoff', async ($, on) => {
  const { clock, seen, endTurn, type, idle, pings } = world($, on)

  seen.drop = 'other'
  seen.pingHoldMs = 1_000
  await endTurn()
  await idle()
  await type('back again')
  await clock.advance(1_000)
  expect(pings()).toBe(1)
  expect(seen.commands).toEqual([])
})

test('a cold Remote Control (bridge) prompt with a handoff takes the cold path', async ($, on) => {
  const { clock, seen, goCold, passed, resubmits } = world($, on)

  await goCold()
  const result = await $.prompt.submit({ text: 'from phone', wait: false, origin: { kind: 'bridge' } })
  await clock.settle()
  expect(result).toEqual({ drop: COLD_DROP })
  expect(seen.commands).toEqual(['clear'])
  expect(resubmits()).toEqual([resubmit('from phone')])
  expect(passed()).toEqual([])
})

test('two completions parked together with no turn.start between arm one wake', async ($, on) => {
  const { clock, startTurn, completeTurn, holdUsage, idle, pings } = world($, on)

  await startTurn()
  const release = holdUsage()
  const first = completeTurn()
  await clock.settle()
  const second = completeTurn()
  await clock.settle()
  release()
  await Promise.all([first, second])
  await idle()
  expect(pings()).toBe(1)
})
