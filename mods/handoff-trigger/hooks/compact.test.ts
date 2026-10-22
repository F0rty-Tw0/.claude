import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, FsStat, On, SessionCompactInput, SessionCompactResult, SessionMessage, SessionSendInput, SessionSendResult, ToolCallInput, TurnCompleteInput } from 'claude-code'

import { HANDOFF_ARGS, PING_TEXT } from './idle'

// FLOW_MS in idle.ts: how long a vetoed flow may take before it times out.
const FLOW_MS = 10 * 60_000
// CHECK_MS in idle.ts: how long the done check waits for answers.
const CHECK_MS = 90_000
// TTL_MS − LEAD_MS in idle.ts: how long an armed idle timer waits.
const WAKE_MS = 55 * 60_000
const HOME = 'C:\\Users\\me'
const SUMMARY: SessionMessage = { role: 'user', text: 'summary', toolUses: [] }
const TRANSCRIPT: SessionMessage = { role: 'user', text: 'hello', toolUses: [] }
const SKIPPED: SessionCompactResult = { skip: 'handoff-trigger: handing off instead of compacting' }
// The engine refuses an empty compaction: one message at least, in and out.
const COMPACTED: SessionCompactResult = { messages: [SUMMARY] }
const VETO_TOAST = 'Handing off instead of compacting'
const TIMED_OUT_TOAST = 'Handoff timed out; auto-compaction allowed again'
const FAILED_TOAST = 'Handoff failed; auto-compaction allowed again'
const MARKER = '[handoff-trigger:compact]'
const ALIVE = 'Alive agents (they survive /clear; their notices arrive in the new session; reach one with SendMessage <id>):'
const ENDED = 'Ended agents:'
const HANDOFF = `${HOME}\\.claude\\handoffs\\2026-10-10-1200-task.md`
const CONTINUE = `Continue from the handoff in ${HANDOFF}: read it, run its Verify command, then do its Next step.`
const DONE_CHECK = 'Handoff check from the handoff-trigger mod: is the task you were given finished? Reply with exactly DONE if it is, or NOT DONE: <one line on what is left>. Do nothing else.'

type Submit = {
  readonly text: string
  readonly origin: string
  readonly asUser?: true
}

// idle.test.ts's world (clock, home folder, files by path with their mtimes, a
// session id that changes on /clear, which ends the session like the real one;
// `clear` set to 'stuck' keeps the id, 'rejected' throws), plus the core
// beneath the compaction flow: a compaction that answers COMPACTED, the agents
// `agent.list` returns (`lists` counts the calls), sends recorded with a
// per-agent `delivery`, and tool calls recorded with `stopResult` (one inside a
// waited-on turn hook throws). `isUsageRejecting` makes session.usage throw;
// `rejects` names the calls that throw (`agent.list`, `session.send`, or a
// command); `submitDrop` makes prompt.submit answer `{ drop }`. `lagMs` moves
// the clock inside the next `clear` or `session.id` call, once, before it answers.
// `totalTokens` is the breakdown's tokens in use (`tokens` when unset). `once`
// runs a callback inside the next call of that name (`clear`, `agent.list`,
// `session.send`, `tool.call`, `session.id`) before it answers. `lateMs` makes
// every FLOW_MS timer fire that much late, as after the machine slept.
function world($: Engine, on: On) {
  const seen = {
    tokens: 100_000,
    totalTokens: undefined as number | undefined,
    once: {} as Record<string, () => Promise<unknown>>,
    lateMs: 0,
    toasts: [] as string[],
    commands: [] as string[],
    args: [] as string[],
    submits: [] as Submit[],
    files: new Map<string, number>(),
    agents: [] as AgentInfo[],
    lists: 0,
    sends: [] as SessionSendInput[],
    delivery: {} as Record<string, SessionSendResult>,
    tools: [] as ToolCallInput[],
    stopResult: undefined as unknown,
    clear: 'new' as 'new' | 'stuck' | 'rejected',
    isUsageRejecting: false,
    rejects: [] as string[],
    submitDrop: undefined as string | undefined,
    lagMs: { clear: 0, id: 0 },
  }
  let isInTurn = false
  let sessions = 0
  // Before mock.clock: the hook registered first answers first.
  on('clock.after', { ms: FLOW_MS }, (_$, e, next) => next({ ...e, ms: e.ms + seen.lateMs }))
  const clock = mock.clock(on, { now: 1_000_000_000 })
  mock.env(on, { USERPROFILE: HOME })
  on('session.usage', () => {
    if (seen.isUsageRejecting) throw new Error('usage rejected')

    return { value: {
      startedAt: 0,
      rateLimits: [],
      context: {
        tokens: seen.tokens,
        window: 1_000_000,
        breakdown: { autoCompactThreshold: 300_000, totalTokens: seen.totalTokens ?? seen.tokens },
      },
    } } as never
  })
  on('session.id', async () => {
    await lag('id')
    await runOnce('session.id')

    return { value: `session-${sessions}` }
  })
  on('fs.stat', (_$, e) => {
    // The engine resolves a path that isn't absolute on this host against the cwd; on Linux, C:\… is one.
    const mtimeMs = seen.files.get(slashed(e.path).replace(/^.*?(?=[A-Za-z]:\/)/, ''))
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
    if (seen.rejects.includes(e.command)) throw new Error(`${e.command} rejected`)
    if (e.command === 'clear' && seen.clear === 'rejected') throw new Error('clear rejected')
    if (e.command === 'clear') await lag('clear')
    if (e.command === 'clear') await runOnce('clear')
    if (e.command === 'clear' && seen.clear === 'new') {
      const sessionId = `session-${sessions}`
      sessions += 1
      await $.session.end({ reason: 'clear', sessionId, resume: { id: sessionId } })
    }
    return { text: '' } as never
  })
  on('prompt.submit', (_$, e) => {
    const asUser = e.origin.kind === 'plugin' ? e.origin.asUser : undefined
    seen.submits.push({ text: e.text, origin: e.origin.kind, asUser })
    if (seen.submitDrop) return { drop: seen.submitDrop }

    return { text: e.text }
  })
  on('session.compact', () => COMPACTED)
  on('agent.list', async () => {
    seen.lists += 1
    if (seen.rejects.includes('agent.list')) throw new Error('agent.list rejected')
    await runOnce('agent.list')

    return { value: seen.agents } as never
  })
  on('session.send', async (_$, e) => {
    seen.sends.push(e)
    if (seen.rejects.includes('session.send')) throw new Error('session.send rejected')
    await runOnce('session.send')

    return seen.delivery[e.to] ?? { isDelivered: true }
  })
  on('tool.call', async (_$, e) => {
    if (isInTurn) {
      throw new Error('tool.call inside a hook the turn is waiting on')
    }
    seen.tools.push(e)
    await runOnce('tool.call')
    // A tool.call hook must answer { result } or { deny }; isError passes through.
    const stoppedResult = { result: { message: 'stopped', task_id: 'task_id' in e ? e.task_id : '', task_type: 'local_agent' } }

    return (seen.stopResult ?? stoppedResult) as never
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))

  async function lag(call: 'clear' | 'id') {
    const ms = seen.lagMs[call]
    seen.lagMs[call] = 0
    if (ms > 0) await clock.advance(ms)
  }

  async function runOnce(call: string) {
    const callback = seen.once[call]
    delete seen.once[call]
    await callback?.()
  }

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

  async function idle() {
    await clock.advance(WAKE_MS)
  }

  // A compaction as the engine raises it, main conversation unless `agentId`.
  async function compactNow(extra: Partial<SessionCompactInput> = {}): Promise<SessionCompactResult> {
    return $.session.compact({ trigger: 'auto', messages: [TRANSCRIPT], ...extra })
  }

  // Framed submits of PING_TEXT: how many idle wakes pinged.
  function pings() {
    return seen.submits.filter(isPing).length
  }

  // A message an agent's own loop sends to the main conversation.
  async function agentSends(agentId: string, text: string) {
    await $.session.send({ to: 'team-lead', text, origin: { kind: 'model' }, agentId })
    await clock.settle()
  }

  // The agent ids the done check went to, in send order.
  function doneChecks() {
    return seen.sends.filter((send) => send.text === DONE_CHECK).map((send) => send.to)
  }

  // The task ids TaskStop was called with.
  function stops() {
    return seen.tools.flatMap((call) => call.tool === 'TaskStop' ? [call.task_id] : [])
  }

  // The args of every /handoff run, in order.
  function handoffs() {
    return seen.commands.flatMap((command, i) => command === 'handoff' ? [seen.args[i]] : [])
  }

  // A prompt the person typed: the unattended cap resets.
  async function person(text = 'back') {
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
  }

  // A /clear the person typed: the session ends, the mod ran no command.
  async function userClear() {
    await $.session.end({ reason: 'clear', sessionId: 'session-x', resume: { id: 'session-x' } })
    await clock.settle()
  }

  // The turn /handoff runs, with the marker in its text, writing `path` fresh.
  async function handoffTurn(extra: Partial<TurnCompleteInput> = {}, path = HANDOFF) {
    await $.turn.start({ text: `${MARKER}\nAlive agents: …`, turnId: 'h' })
    write(path)
    await completeTurn({ turnId: 'h', answer: `Handoff written to ${path}`, ...extra })
  }

  return { clock, seen, write, startTurn, completeTurn, endTurn, idle, compactNow, pings, agentSends, doneChecks, stops, handoffs, person, userClear, handoffTurn }
}

// The /handoff args: the marker, the agent lines, HANDOFF_ARGS last.
function args(...lines: string[]) {
  return [MARKER, ...lines, HANDOFF_ARGS].join('\n')
}

function agent(id: string, status: AgentInfo['status'] = 'idle', type = 'general-purpose'): AgentInfo {
  return { id, status, type, description: `task ${id}` }
}

function slashed(path: string) {
  return path.replaceAll('\\', '/')
}

function isPing(submit: Submit) {
  return submit.text === PING_TEXT && submit.origin === 'plugin' && submit.asUser === undefined
}

test('a main auto compaction is vetoed with a toast', async ($, on) => {
  const { seen, compactNow } = world($, on)

  expect(await compactNow()).toEqual(SKIPPED)
  expect(seen.toasts).toEqual([VETO_TOAST])
})

test('manual, plugin, precompute and a subagent auto compaction pass to the core', async ($, on) => {
  const { seen, compactNow } = world($, on)

  for (const trigger of ['manual', 'plugin', 'precompute'] as const) {
    expect(await compactNow({ trigger })).toEqual(COMPACTED)
  }
  expect(await compactNow({ agentId: 'a1' })).toEqual(COMPACTED)
  expect(seen.toasts).toEqual([])
})

test('auto while vetoed is skipped again; FLOW_MS after the check starts it times out, passes once, then a new flow vetoes', async ($, on) => {
  const { clock, seen, endTurn, compactNow } = world($, on)

  expect(await compactNow()).toEqual(SKIPPED)
  expect(await compactNow()).toEqual(SKIPPED)
  await endTurn()
  await clock.advance(FLOW_MS)
  expect(seen.toasts).toEqual([VETO_TOAST, TIMED_OUT_TOAST])
  expect(await compactNow()).toEqual(COMPACTED)
  expect(await compactNow()).toEqual(SKIPPED)
  // Past the old flow's deadline: the new veto has none of its own yet.
  await clock.advance(1)
  expect(await compactNow()).toEqual(SKIPPED)
})

test('auto at 90% of the model window passes to the core: a prompt too long is never vetoed', async ($, on) => {
  const { seen, compactNow } = world($, on)

  seen.tokens = 900_000
  expect(await compactNow()).toEqual(COMPACTED)
  expect(seen.toasts).toEqual([])
})

test('an error inside the veto hook passes the compaction to the core', async ($, on) => {
  const { seen, compactNow } = world($, on)

  seen.isUsageRejecting = true
  expect(await compactNow()).toEqual(COMPACTED)
})

test('while vetoed with no main turn running, the idle wake pings as usual', async ($, on) => {
  const { clock, endTurn, compactNow, pings } = world($, on)

  await endTurn()
  await clock.advance(50 * 60_000)
  await compactNow()
  await clock.advance(5 * 60_000)
  expect(pings()).toBe(1)
})

test('once the check has started the idle wake sends no ping; after the time-out it pings again', async ($, on) => {
  const { clock, seen, endTurn, idle, compactNow, pings } = world($, on)

  // The deadline fires late, so the flow is still handing off at the wake.
  seen.lateMs = WAKE_MS
  await compactNow()
  await endTurn()
  await idle()
  expect(pings()).toBe(0)

  await clock.advance(FLOW_MS)
  expect(seen.toasts.at(-1)).toBe(TIMED_OUT_TOAST)
  await endTurn()
  await idle()
  expect(pings()).toBe(1)
})

test('the idle /handoff turn ending while the flow is active runs no hands-free /clear', async ($, on) => {
  const { seen, write, startTurn, completeTurn, endTurn, idle, compactNow } = world($, on)

  // Two pings, then the idle /handoff.
  for (let wake = 0; wake < 3; wake += 1) {
    await endTurn()
    await idle()
  }
  await startTurn()
  expect(await compactNow()).toEqual(SKIPPED)
  write(HANDOFF)
  await completeTurn({ answer: `Handoff written to ${HANDOFF}` })
  // Not the submit text: clearAndContinue sends the same one.
  expect(seen.commands).not.toContain('clear')
})

test('a veto turn ending aborted starts no check; the next answer turn starts it after the tick', async ($, on) => {
  const { clock, seen, startTurn, endTurn, compactNow } = world($, on)

  await compactNow()
  await endTurn({ reason: 'aborted' })
  expect(seen.lists).toBe(0)

  await startTurn()
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' })
  expect(seen.lists).toBe(0)
  await clock.settle()
  // The check's list, then /handoff's re-read: no agents settles it at once.
  expect(seen.lists).toBe(2)
})

test('each idle agent gets one done check and a running one none; only DONE replies are stopped', async ($, on) => {
  const { clock, seen, completeTurn, endTurn, compactNow, agentSends, doneChecks, stops } = world($, on)

  seen.agents = ['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => agent(id)).concat(agent('r1', 'running'))
  await compactNow()
  await endTurn()
  expect(doneChecks()).toEqual(['a1', 'a2', 'a3', 'a4', 'a5'])

  await completeTurn({ agentId: 'a1', answer: 'DONE' })
  await agentSends('a2', 'done')
  await completeTurn({ agentId: 'a3', answer: 'NOT DONE: tests left' })
  await completeTurn({ agentId: 'a4', answer: 'sure, will do' })
  await clock.advance(CHECK_MS)
  // Past CHECK_MS: a5 is kept without an answer, so a late DONE stops nothing.
  await completeTurn({ agentId: 'a5', answer: 'DONE' })
  expect(stops()).toEqual(['a1', 'a2'])
  expect(doneChecks()).toEqual(['a1', 'a2', 'a3', 'a4', 'a5'])
})

test('an undelivered done check stops nothing for that agent', async ($, on) => {
  const { seen, completeTurn, endTurn, compactNow, doneChecks, stops } = world($, on)

  seen.agents = [agent('a1'), agent('a2')]
  seen.delivery = { a1: { isDelivered: false, reason: 'gone' } }
  await compactNow()
  await endTurn()
  await completeTurn({ agentId: 'a1', answer: 'DONE' })
  await completeTurn({ agentId: 'a2', answer: 'DONE' })
  expect(doneChecks()).toEqual(['a1', 'a2'])
  expect(stops()).toEqual(['a2'])
})

test('a TaskStop that resolves isError is called once and throws nothing', async ($, on) => {
  const { seen, completeTurn, endTurn, compactNow, stops } = world($, on)

  seen.agents = [agent('a1')]
  seen.stopResult = { result: 'No task found with ID: a1', isError: true }
  await compactNow()
  await endTurn()
  await completeTurn({ agentId: 'a1', answer: 'DONE' })
  expect(stops()).toEqual(['a1'])
})

test('no idle agents: the check lists agents and sends nothing', async ($, on) => {
  const { seen, endTurn, compactNow } = world($, on)

  seen.agents = [agent('r1', 'running'), agent('w1', 'waiting')]
  await compactNow()
  await endTurn()
  // The check's list, then /handoff's re-read.
  expect(seen.lists).toBe(2)
  expect(seen.sends).toEqual([])
})

test('after the check, /handoff lists alive agents with their notes and ended ones, a stopped agent off the list included', async ($, on) => {
  const { clock, seen, completeTurn, endTurn, compactNow, agentSends, handoffs } = world($, on)

  const a3: AgentInfo = { ...agent('a3'), name: 'tester' }
  seen.agents = [agent('a1'), agent('a2'), a3, agent('a4'), agent('a5'), agent('r1', 'running')]
  await compactNow()
  await endTurn()
  await completeTurn({ agentId: 'a1', answer: 'DONE' })
  await agentSends('a2', 'done')
  await completeTurn({ agentId: 'a3', answer: 'NOT DONE: tests left' })
  await completeTurn({ agentId: 'a4', answer: 'sure, will do' })
  // The re-read: a1 has dropped off, a2 shows killed, c1 ended on its own.
  seen.agents = [{ ...agent('a2'), status: 'killed' }, a3, agent('a4'), agent('a5'), agent('r1', 'running'), agent('c1', 'completed')]
  expect(handoffs()).toEqual([])

  await clock.advance(CHECK_MS)
  expect(handoffs()).toEqual([args(
    ALIVE,
    'a3 · tester · general-purpose · idle · "task a3" · tests left',
    'a4 · - · general-purpose · idle · "task a4" · unclear reply: sure, will do',
    'a5 · - · general-purpose · idle · "task a5" · no answer to the done check',
    'r1 · - · general-purpose · running · "task r1" · -',
    ENDED,
    'a2 · general-purpose · killed · "task a2" · stopped by the handoff check',
    'c1 · general-purpose · completed · "task c1"',
    'a1 · general-purpose · stopped · "task a1" · stopped by the handoff check',
  )])
})

test('an undelivered check and a failed stop keep their agents alive with a note; no ended agents prints none', async ($, on) => {
  const { seen, completeTurn, endTurn, compactNow, handoffs } = world($, on)

  seen.agents = [agent('a1'), agent('a2')]
  seen.delivery = { a1: { isDelivered: false, reason: 'gone' } }
  seen.stopResult = { result: 'No task found with ID: a2', isError: true }
  await compactNow()
  await endTurn()
  await completeTurn({ agentId: 'a2', answer: 'DONE' })
  expect(handoffs()).toEqual([args(
    ALIVE,
    'a1 · - · general-purpose · idle · "task a1" · not delivered: gone',
    'a2 · - · general-purpose · idle · "task a2" · stop failed',
    ENDED,
    'none',
  )])
})

test('a bare NOT DONE prints its note as -', async ($, on) => {
  const { seen, completeTurn, endTurn, compactNow, handoffs } = world($, on)

  seen.agents = [agent('a1')]
  await compactNow()
  await endTurn()
  await completeTurn({ agentId: 'a1', answer: 'NOT DONE' })
  expect(handoffs()).toEqual([args(ALIVE, 'a1 · - · general-purpose · idle · "task a1" · -', ENDED, 'none')])
})

test('an idle reviewer is stopped without a done check; other idle agents still get one, a running reviewer neither', async ($, on) => {
  const { seen, endTurn, compactNow, doneChecks, stops } = world($, on)

  const reviewers = ['critic', 'code-reviewer', 'quality-reviewer', 'security-reviewer', 'performance-reviewer', 'architect', 'verifier', 'Explore']
  seen.agents = [...reviewers.map((type) => agent(type, 'idle', type)), agent('a1'), agent('e1', 'idle', 'executor'), agent('r1', 'running', 'code-reviewer')]
  await compactNow()
  await endTurn()
  expect(stops()).toEqual(reviewers)
  expect(doneChecks()).toEqual(['a1', 'e1'])
})

test('only idle reviewers: they are stopped and /handoff runs with no done check sent', async ($, on) => {
  const { seen, endTurn, compactNow, doneChecks, handoffs } = world($, on)

  seen.agents = [agent('c1', 'idle', 'critic')]
  await compactNow()
  await endTurn()
  expect(doneChecks()).toEqual([])
  expect(handoffs()).toHaveLength(1)
  expect(handoffs()[0]).toContain('c1 · critic · stopped · "task c1" · stopped by the handoff check')
})

test('every agent stopped: alive prints none and the stopped one is ended though off the list', async ($, on) => {
  const { seen, completeTurn, endTurn, compactNow, handoffs } = world($, on)

  seen.agents = [agent('a1')]
  await compactNow()
  await endTurn()
  seen.agents = []
  await completeTurn({ agentId: 'a1', answer: 'DONE' })
  expect(handoffs()).toEqual([args(ALIVE, 'none', ENDED, 'a1 · general-purpose · stopped · "task a1" · stopped by the handoff check')])
})

test('no agents at all: both headers become No agents.', async ($, on) => {
  const { endTurn, compactNow, handoffs } = world($, on)

  await compactNow()
  await endTurn()
  expect(handoffs()).toEqual([args('No agents.')])
})

test('a check that settles while a main turn runs hands off only after that turn completes, whatever its reason', async ($, on) => {
  const { seen, startTurn, completeTurn, endTurn, compactNow, handoffs } = world($, on)

  seen.agents = [agent('a1')]
  await compactNow()
  await endTurn()
  await startTurn()
  await completeTurn({ agentId: 'a1', answer: 'NOT DONE: tests left' })
  expect(handoffs()).toEqual([])

  await completeTurn({ reason: 'aborted' })
  expect(handoffs()).toHaveLength(1)
})

test('after a hands-free idle continue, an idle auto compaction passes to the core: one unattended chain per person prompt', async ($, on) => {
  const { seen, write, endTurn, idle, compactNow, handoffTurn } = world($, on)

  // Two pings, then the idle /handoff, whose turn clears and continues alone.
  for (let wake = 0; wake < 3; wake += 1) {
    await endTurn()
    await idle()
  }
  write(HANDOFF)
  await endTurn({ answer: `Handoff written to ${HANDOFF}` })
  expect(seen.commands).toEqual(['handoff', 'clear'])

  expect(await compactNow()).toEqual(COMPACTED)
  await endTurn()
  await handoffTurn()
  expect(seen.commands).toEqual(['handoff', 'clear'])
})

test('a continue from the compaction flow is unattended too: the next idle auto passes to the core until a person prompts', async ($, on) => {
  const { seen, compactNow, endTurn, handoffTurn, person } = world($, on)

  expect(await compactNow()).toEqual(SKIPPED)
  await endTurn()
  await handoffTurn()
  expect(seen.commands).toEqual(['handoff', 'clear'])

  expect(await compactNow()).toEqual(COMPACTED)
  await person()
  expect(await compactNow()).toEqual(SKIPPED)
})

test('after a flow continue, an auto inside the continued run still hands off: the cap is for idle compactions only', async ($, on) => {
  const { seen, compactNow, startTurn, endTurn, handoffTurn } = world($, on)

  await compactNow()
  await endTurn()
  await handoffTurn()
  expect(seen.commands).toEqual(['handoff', 'clear'])

  await startTurn()
  expect(await compactNow()).toEqual(SKIPPED)
})

test('a mid-turn flow continue takes no cap: the idle /handoff after it still clears and continues hands-free', async ($, on) => {
  const { seen, write, startTurn, completeTurn, endTurn, idle, compactNow, handoffTurn } = world($, on)

  await startTurn()
  expect(await compactNow()).toEqual(SKIPPED)
  await completeTurn()
  await handoffTurn()
  expect(seen.commands).toEqual(['handoff', 'clear'])

  for (let wake = 0; wake < 3; wake += 1) {
    await endTurn()
    await idle()
  }
  write(HANDOFF)
  await endTurn({ answer: `Handoff written to ${HANDOFF}` })
  expect(seen.commands).toEqual(['handoff', 'clear', 'handoff', 'clear'])
})

test('a person prompt during an idle flow keeps the cap off: the next idle auto hands off again', async ($, on) => {
  const { seen, compactNow, endTurn, handoffTurn, person } = world($, on)

  expect(await compactNow()).toEqual(SKIPPED)
  await person()
  await endTurn()
  await handoffTurn()
  expect(seen.commands).toEqual(['handoff', 'clear'])

  expect(await compactNow()).toEqual(SKIPPED)
})

test('after a hands-free idle continue, an auto inside a keepalive ping turn passes to the core: a ping is no work', async ($, on) => {
  const { seen, write, startTurn, endTurn, idle, compactNow, pings } = world($, on)

  for (let wake = 0; wake < 3; wake += 1) {
    await endTurn()
    await idle()
  }
  write(HANDOFF)
  await endTurn({ answer: `Handoff written to ${HANDOFF}` })
  expect(seen.commands).toEqual(['handoff', 'clear'])

  await endTurn()
  await idle()
  expect(pings()).toBe(3)
  await startTurn()
  expect(await compactNow()).toEqual(COMPACTED)
})

test('a notice turn after /handoff is ignored; the turn naming a fresh handoff clears and continues as the user, flow off', async ($, on) => {
  const { seen, endTurn, compactNow, handoffTurn, person } = world($, on)

  await compactNow()
  await endTurn()
  expect(seen.commands).toEqual(['handoff'])
  // A teammate's reply delivered as a main-loop notice turn: no fresh file.
  await endTurn({ answer: 'teammate a1: all tests pass' })
  expect(seen.commands).toEqual(['handoff'])

  await handoffTurn()
  expect(seen.commands).toEqual(['handoff', 'clear'])
  expect(seen.submits).toEqual([{ text: CONTINUE, origin: 'plugin', asUser: true }])
  await person()
  expect(await compactNow()).toEqual(SKIPPED)
  expect(seen.toasts).toEqual([VETO_TOAST, VETO_TOAST])
})

test('the handoff turn with no marker in its turn.start text still clears and continues', async ($, on) => {
  const { seen, write, startTurn, completeTurn, endTurn, compactNow } = world($, on)

  await compactNow()
  await endTurn()
  await startTurn()
  write(HANDOFF)
  await completeTurn({ answer: `Handoff written to ${HANDOFF}` })
  expect(seen.commands).toEqual(['handoff', 'clear'])
  expect(seen.submits).toEqual([{ text: CONTINUE, origin: 'plugin', asUser: true }])
})

for (const [ending, extra] of [['without a fresh file', { answer: 'I could not write it' }], ['in error', { reason: 'error' }]] as const) {
  test(`the marked turn ending ${ending} fails: the next auto compaction runs`, async ($, on) => {
    const { seen, endTurn, compactNow, handoffTurn } = world($, on)

    await compactNow()
    await endTurn()
    await handoffTurn(extra)
    expect(seen.commands.at(-1)).toBe('handoff')
    expect(seen.toasts.at(-1)).toBe(FAILED_TOAST)
    expect(await compactNow()).toEqual(COMPACTED)
  })
}

test('a rejected /handoff fails: the next auto compaction runs', async ($, on) => {
  const { seen, endTurn, compactNow } = world($, on)

  seen.rejects = ['handoff']
  await compactNow()
  await endTurn()
  expect(seen.toasts.at(-1)).toBe(FAILED_TOAST)
  expect(await compactNow()).toEqual(COMPACTED)
})

for (const call of ['agent.list', 'session.send']) {
  test(`a rejected ${call} in the check fails: the next auto compaction runs`, async ($, on) => {
    const { seen, endTurn, compactNow, handoffs } = world($, on)

    seen.agents = [agent('a1')]
    seen.rejects = [call]
    await compactNow()
    await endTurn()
    expect(handoffs()).toEqual([])
    expect(seen.toasts.at(-1)).toBe(FAILED_TOAST)
    expect(await compactNow()).toEqual(COMPACTED)
  })
}

for (const clear of ['rejected', 'stuck'] as const) {
  test(`a /clear that is ${clear} toasts the continue line: the next auto compaction runs`, async ($, on) => {
    const { seen, endTurn, compactNow, handoffTurn } = world($, on)

    seen.clear = clear
    await compactNow()
    await endTurn()
    await handoffTurn()
    expect(seen.submits).toEqual([])
    expect(seen.toasts.at(-1)).toContain(CONTINUE)
    expect(await compactNow()).toEqual(COMPACTED)
  })
}

test('a dropped continue after a good /clear toasts the continue line; the flow is off', async ($, on) => {
  const { seen, endTurn, compactNow, handoffTurn } = world($, on)

  seen.submitDrop = 'blocked'
  await compactNow()
  await endTurn()
  await handoffTurn()
  expect(seen.commands).toEqual(['handoff', 'clear'])
  expect(seen.toasts.at(-1)).toContain(CONTINUE)
  expect(await compactNow()).toEqual(SKIPPED)
})

test('a user /clear during the check cancels it: CHECK_MS later no /handoff runs', async ($, on) => {
  const { clock, seen, endTurn, compactNow, userClear, handoffs } = world($, on)

  seen.agents = [agent('a1')]
  await compactNow()
  await endTurn()
  await userClear()
  await clock.advance(CHECK_MS)
  expect(handoffs()).toEqual([])
  expect(await compactNow()).toEqual(SKIPPED)
})

test('a user /clear also resets a failed flow: the next auto compaction is vetoed again', async ($, on) => {
  const { clock, endTurn, compactNow, userClear } = world($, on)

  await compactNow()
  await endTurn()
  await clock.advance(FLOW_MS)
  await userClear()
  expect(await compactNow()).toEqual(SKIPPED)
})

test('the deadline firing while the handoff waits on a running turn cancels it', async ($, on) => {
  const { clock, seen, startTurn, completeTurn, endTurn, compactNow, handoffs } = world($, on)

  seen.agents = [agent('a1')]
  await compactNow()
  await endTurn()
  await startTurn()
  await completeTurn({ agentId: 'a1', answer: 'NOT DONE: tests left' })
  await clock.advance(FLOW_MS)
  expect(seen.toasts.at(-1)).toBe(TIMED_OUT_TOAST)
  await completeTurn()
  expect(handoffs()).toEqual([])
})

for (const [call, window] of [['clear', 'during the mod\'s own /clear'], ['id', 'between clearing and the deferred /clear']] as const) {
  test(`the deadline landing ${window} still clears and continues; the flow ends off`, async ($, on) => {
    const { clock, seen, endTurn, compactNow, handoffTurn, person } = world($, on)

    await compactNow()
    await endTurn()
    seen.lagMs[call] = FLOW_MS
    await handoffTurn()
    // An advance inside a timer's own callback lets the outer settle return
    // before that callback ends: settle again for the rest of clearAndContinue.
    await clock.settle()
    expect(seen.commands).toEqual(['handoff', 'clear'])
    expect(seen.submits).toEqual([{ text: CONTINUE, origin: 'plugin', asUser: true }])
    expect(seen.toasts).not.toContain(TIMED_OUT_TOAST)
    await person()
    expect(await compactNow()).toEqual(SKIPPED)
  })
}

test('a paste that takes the context past 90% since the last response passes to the core: the guard reads tokens in use', async ($, on) => {
  const { seen, compactNow } = world($, on)

  seen.tokens = 250_000
  seen.totalTokens = 920_000
  expect(await compactNow()).toEqual(COMPACTED)
  expect(seen.toasts).toEqual([])
})

test('only a bare DONE stops an agent; a first line that starts with Done is kept as unclear', async ($, on) => {
  const { seen, completeTurn, endTurn, compactNow, stops, handoffs } = world($, on)

  seen.agents = [agent('a1'), agent('a2')]
  await compactNow()
  await endTurn()
  await completeTurn({ agentId: 'a1', answer: 'Done with the parser; the tests are still failing.' })
  await completeTurn({ agentId: 'a2', answer: ' Done.\nAll green.' })
  seen.agents = [agent('a1')]
  expect(stops()).toEqual(['a2'])
  expect(handoffs()).toEqual([args(
    ALIVE,
    'a1 · - · general-purpose · idle · "task a1" · unclear reply: Done with the parser; the tests are still failing.',
    ENDED,
    'a2 · general-purpose · stopped · "task a2" · stopped by the handoff check',
  )])
})

test('a veto inside a running turn has no deadline: autos well past FLOW_MS are still skipped, nothing times out', async ($, on) => {
  const { clock, seen, startTurn, compactNow } = world($, on)

  await startTurn()
  expect(await compactNow()).toEqual(SKIPPED)
  await clock.advance(3 * FLOW_MS)
  expect(await compactNow()).toEqual(SKIPPED)
  expect(await compactNow()).toEqual(SKIPPED)
  expect(seen.toasts).toEqual([VETO_TOAST])
})

test('the deadline starts with the check: FLOW_MS after the veto turn answers, with no answers, the flow times out', async ($, on) => {
  const { clock, seen, startTurn, completeTurn, compactNow } = world($, on)

  seen.agents = [agent('a1')]
  await startTurn()
  await compactNow()
  await clock.advance(2 * FLOW_MS)
  await completeTurn()
  expect(seen.sends).toHaveLength(1)
  await clock.advance(FLOW_MS - 1)
  expect(seen.toasts).toEqual([VETO_TOAST])

  await clock.advance(1)
  expect(seen.toasts).toEqual([VETO_TOAST, TIMED_OUT_TOAST])
  expect(await compactNow()).toEqual(COMPACTED)
})

test('an auto past a deadline whose timer is late passes to the core silently; the next fill cycle is vetoed again', async ($, on) => {
  const { clock, seen, endTurn, compactNow } = world($, on)

  seen.lateMs = FLOW_MS
  await compactNow()
  await endTurn()
  await clock.advance(FLOW_MS + 1)
  expect(await compactNow()).toEqual(COMPACTED)
  expect(seen.toasts).toEqual([VETO_TOAST])
  expect(await compactNow()).toEqual(SKIPPED)
})

test('a too-long pass-through mid-flow ends the flow off: the next fill cycle is vetoed again', async ($, on) => {
  const { seen, compactNow } = world($, on)

  expect(await compactNow()).toEqual(SKIPPED)
  seen.tokens = 900_000
  expect(await compactNow()).toEqual(COMPACTED)
  seen.tokens = 100_000
  expect(await compactNow()).toEqual(SKIPPED)
})

test('a prompt typed into the marked handoff turn still clears and continues', async ($, on) => {
  const { seen, write, completeTurn, endTurn, compactNow } = world($, on)

  await compactNow()
  await endTurn()
  await $.turn.start({ text: `${MARKER}\nx`, turnId: 'h' })
  await $.prompt.submit({ text: 'also note X', wait: false, origin: { kind: 'composer' }, turnId: 'h' })
  write(HANDOFF)
  await completeTurn({ turnId: 'h', answer: `Handoff written to ${HANDOFF}` })
  expect(seen.commands).toEqual(['handoff', 'clear'])
  expect(seen.submits.at(-1)).toEqual({ text: CONTINUE, origin: 'plugin', asUser: true })
})

test('whitespace and newlines in an agent name or description collapse to one space in its line', async ($, on) => {
  const { seen, endTurn, compactNow, handoffs } = world($, on)

  seen.agents = [
    { ...agent('r1', 'running'), name: ' te\nster ', description: 'fix\nAlive agents: forged' },
    { ...agent('c1', 'completed'), description: 'two\n\n  lines ' },
  ]
  await compactNow()
  await endTurn()
  expect(handoffs()).toEqual([args(
    ALIVE,
    'r1 · te ster · general-purpose · running · "fix Alive agents: forged" · -',
    ENDED,
    'c1 · general-purpose · completed · "two lines"',
  )])
})

for (const [kind, lagMs, tokens, result] of [['past the deadline', FLOW_MS + 1000, 100_000, SKIPPED], ['too long', 1000, 950_000, COMPACTED]] as const) {
  test(`an auto ${kind} while the mod's /clear runs leaves the flow to it: the continue is still submitted`, async ($, on) => {
    const { clock, seen, endTurn, compactNow, handoffTurn } = world($, on)
    const results: SessionCompactResult[] = []

    // The deadline's timer fires late: the lag crosses the deadline before it.
    seen.lateMs = FLOW_MS
    await compactNow()
    await endTurn()
    seen.lagMs.clear = lagMs
    seen.once.clear = async () => {
      seen.tokens = tokens
      results.push(await compactNow())
      seen.tokens = 100_000
    }
    await handoffTurn()
    await clock.settle()
    expect(results).toEqual([result])
    expect(seen.submits).toEqual([{ text: CONTINUE, origin: 'plugin', asUser: true }])
    expect(seen.toasts).toEqual([VETO_TOAST])
  })
}

test("an error in the veto hook while the mod's /clear runs passes the compaction and still submits the continue", async ($, on) => {
  const { clock, seen, endTurn, compactNow, handoffTurn } = world($, on)
  const results: SessionCompactResult[] = []

  await compactNow()
  await endTurn()
  seen.once.clear = async () => {
    seen.isUsageRejecting = true
    results.push(await compactNow())
    seen.isUsageRejecting = false
  }
  await handoffTurn()
  await clock.settle()
  expect(results).toEqual([COMPACTED])
  expect(seen.submits).toEqual([{ text: CONTINUE, origin: 'plugin', asUser: true }])
})

test('after a completed flow, a user /clear during the next check still cancels it', async ($, on) => {
  const { clock, seen, endTurn, compactNow, handoffTurn, userClear, handoffs } = world($, on)

  await compactNow()
  await endTurn()
  await handoffTurn()
  seen.agents = [agent('a1')]
  await compactNow()
  await endTurn()
  await userClear()
  await clock.advance(CHECK_MS)
  expect(handoffs()).toHaveLength(1)
})

test('a user /clear right after the mod\'s own /clear cancels the flow: no continue is submitted', async ($, on) => {
  const { clock, seen, endTurn, compactNow, handoffTurn, userClear } = world($, on)

  await compactNow()
  await endTurn()
  seen.once.clear = async () => {
    seen.once['session.id'] = userClear
  }
  await handoffTurn()
  // userClear's settle inside the timer's callback returns the outer settle early.
  await clock.settle()
  expect(seen.commands).toEqual(['handoff', 'clear'])
  expect(seen.submits).toEqual([])
})

test('a user /clear while the check lists agents cancels it: no done check, stop or /handoff', async ($, on) => {
  const { clock, seen, completeTurn, endTurn, compactNow, userClear, doneChecks, stops, handoffs } = world($, on)

  seen.agents = [agent('a1')]
  seen.once['agent.list'] = userClear
  await compactNow()
  await endTurn()
  await completeTurn({ agentId: 'a1', answer: 'DONE' })
  await clock.advance(CHECK_MS)
  expect({ checks: doneChecks(), stops: stops(), handoffs: handoffs() }).toEqual({ checks: [], stops: [], handoffs: [] })
})

test('a user /clear while a done check is sent cancels the rest: no later sends or /handoff', async ($, on) => {
  const { clock, seen, endTurn, compactNow, userClear, doneChecks, handoffs } = world($, on)

  seen.agents = [agent('a1'), agent('a2')]
  seen.once['session.send'] = userClear
  await compactNow()
  await endTurn()
  await clock.advance(CHECK_MS)
  expect({ checks: doneChecks(), handoffs: handoffs() }).toEqual({ checks: ['a1'], handoffs: [] })
})

test('a user /clear while TaskStop runs cancels the flow: the stop leaks into no later /handoff', async ($, on) => {
  const { clock, seen, completeTurn, endTurn, compactNow, userClear, handoffs } = world($, on)

  seen.agents = [agent('a1'), agent('a2')]
  seen.once['tool.call'] = userClear
  await compactNow()
  await endTurn()
  await completeTurn({ agentId: 'a1', answer: 'DONE' })
  await clock.advance(CHECK_MS)
  expect(handoffs()).toEqual([])

  seen.agents = []
  await compactNow()
  await endTurn()
  expect(handoffs()).toEqual([args('No agents.')])
})

test('a user /clear between clearing and the deferred /clear tick cancels it: no /clear, no continue', async ($, on) => {
  const { seen, write, endTurn, compactNow, userClear } = world($, on)

  await compactNow()
  await endTurn()
  await $.turn.start({ text: `${MARKER}\nx`, turnId: 'h' })
  write(HANDOFF)
  await $.turn.complete({ answer: `Handoff written to ${HANDOFF}`, durationMs: 1, isAborted: false, turnId: 'h', reason: 'answer' })
  await userClear()
  expect(seen.commands).toEqual(['handoff'])
  expect(seen.submits).toEqual([])
})

test('a TaskStop answered with deny keeps the agent alive with stop failed', async ($, on) => {
  const { seen, completeTurn, endTurn, compactNow, handoffs } = world($, on)

  seen.agents = [agent('a1')]
  seen.stopResult = { deny: 'not allowed' }
  await compactNow()
  await endTurn()
  await completeTurn({ agentId: 'a1', answer: 'DONE' })
  expect(handoffs()).toEqual([args(ALIVE, 'a1 · - · general-purpose · idle · "task a1" · stop failed', ENDED, 'none')])
})

test('a stopped agent the re-read still lists idle appears once, under Ended', async ($, on) => {
  const { seen, completeTurn, endTurn, compactNow, handoffs } = world($, on)

  seen.agents = [agent('a1')]
  await compactNow()
  await endTurn()
  await completeTurn({ agentId: 'a1', answer: 'DONE' })
  expect(handoffs()).toEqual([args(ALIVE, 'none', ENDED, 'a1 · general-purpose · stopped · "task a1" · stopped by the handoff check')])
})
