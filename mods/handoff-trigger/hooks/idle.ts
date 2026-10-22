import type { AgentInfo, AgentStatus, EngineInterface, On, SessionCompactInput, SessionCompactSkipped, SessionEndInput, TurnCompleteInput, TurnCompleteReason, TurnStartInput } from 'claude-code'

// ponytail: the prompt-cache TTL is assumed 1h, not detected. A mod can't read
// it ($.fs.read stops at 4 MiB, $.session.usage has no TTL breakdown); on a 5m
// TTL session the first ping spends cold-cache's one stop (see the spec).
const TTL_MS = 60 * 60_000
const LEAD_MS = 5 * 60_000
const MIN_TOKENS = 50_000
const DUP_MS = 5 * 60_000
const PINGS = 2

// A reply is needed: the harness rejects a turn with no visible output.
export const PING_TEXT = 'Prompt-cache keepalive ping from the handoff-trigger mod. Reply with one line of at most five words saying the cache is kept warm, and do nothing else: no tools, no work.'
// Without it the handoff skill copies the last user prompts, pings included,
// and lets the latest one win.
export const HANDOFF_ARGS = "The handoff-trigger mod's keepalive pings are not user prompts: leave them out of the last user prompts, and they do not change the task."

// A handoff path as the handoff skill replies with it (`~/…` or `C:\…`); the
// lookbehind keeps leading markdown (`**`, `(`, `[`) out of the match.
const HANDOFF_PATH = /(?<=^|[\s`'"(\[*])(?:[A-Za-z]:|~)?[^\s`'"()\[\]*]*[\\/]\.claude[\\/]handoffs[\\/][^\s`'"()\[\]*]+\.md/g

// A cold prompt between its drop and continueFresh's submit; re-sends append.
type Pending = {
  text: string
  readonly handoffPath: string
  readonly sessionId: string
}

// The last resubmitted text, so a re-send within DUP_MS doesn't run twice.
type Resent = {
  readonly text: string
  readonly until: number
}

// The idle path's module state, one per Claude Code process; /clear and
// /resume keep it.
let lastResponseAt: number | undefined
let handoffPath: string | undefined
let cancelTimer: (() => void) | undefined
let turnStartedAt: number | undefined
let isPromptInTurn = false
let hasFired = false
let pings = 0
let spell = 0
let pending: Pending | undefined
let resent: Resent | undefined
// Set right before the idle /handoff runs; the next main turn's settle reads
// and clears it.
let isIdleHandoff = false
// The hands-free chain cap: 1 after one continue, until a person prompt.
// session.end keeps it, so the mod's own /clear does too.
let unattended: 0 | 1 = 0
// Bumped on every person prompt, commands too: a warm /cost moves neither
// spell nor handoffPath.
let personSeen = 0

// --- Handoff in place of auto-compaction: state ---
// In this file, not its own module: the loader follows $ only into functions
// declared in the same file as the hook, never across an import.

const FLOW_MS = 10 * 60_000
// How long the done check waits for answers after its first send.
const CHECK_MS = 90_000
const DONE_CHECK = 'Handoff check from the handoff-trigger mod: is the task you were given finished? Reply with exactly DONE if it is, or NOT DONE: <one line on what is left>. Do nothing else.'
// Agents that hand back one report and are done once idle: stopped without a
// done check, whose answer turn rebuilds a cold context (38 of 119 checks in
// the week of 2026-10-19 went to these).
const REPORT_TYPES = new Set(['critic', 'code-reviewer', 'quality-reviewer', 'security-reviewer', 'performance-reviewer', 'architect', 'verifier', 'Explore'])
// At or past this share of the model window an auto compaction is a prompt
// too long: vetoing it would leave the session unable to answer.
const WINDOW_SHARE = 0.9
const SKIP_REASON = 'handoff-trigger: handing off instead of compacting'
const FAILED_TOAST = 'Handoff failed; auto-compaction allowed again'
// The first line of the /handoff args; the turn whose text has it fails fast.
const MARKER = '[handoff-trigger:compact]'
const ALIVE_HEADER = 'Alive agents (they survive /clear; their notices arrive in the new session; reach one with SendMessage <id>):'
const ALIVE_STATUSES: AgentStatus[] = ['pending', 'running', 'waiting', 'idle']

// off → vetoed → checking → handing-off → clearing → off, plus failed: the
// next auto compaction after a failure runs.
type FlowState = 'off' | 'vetoed' | 'checking' | 'handing-off' | 'clearing' | 'failed'

const ACTIVE: FlowState[] = ['vetoed', 'checking', 'handing-off', 'clearing']

// One idle agent asked by the done check: its first reply, and the note it is
// kept with. Settled once it has a note or is in stopped. `agent` is kept
// from the check's list, so a stopped agent stays listed after it drops off.
type Asked = {
  readonly agent: AgentInfo
  readonly reply?: string
  readonly note?: string
}

// The flow's state, one per process too; any session.end but the mod's own
// /clear resets it.
let flowState: FlowState = 'off'
// 0 until the check starts: a veto alone has no deadline.
let deadline = 0
let asked = new Map<string, Asked>()
let stopped: AgentInfo[] = []
let handoffTurnId: string | undefined
// Moves on every reset: a timer or continuation from an older flow does nothing.
let flowId = 0
let isMainTurnRunning = false
// The flow whose settled check waits for the running main turn to end.
let handOffFlow: number | undefined
// Set while the mod's own /clear runs: its session.end leaves the flow alone.
let isOwnClear = false
// personSeen at an idle veto, undefined at a mid-turn one: only an idle flow's
// continue, with no person prompt since, takes the unattended cap.
let idleVetoSeen: number | undefined

export function idle(on: On): void {
  lastResponseAt = undefined
  handoffPath = undefined
  cancelTimer = undefined
  turnStartedAt = undefined
  isPromptInTurn = false
  hasFired = false
  pings = 0
  spell = 0
  pending = undefined
  resent = undefined
  isIdleHandoff = false
  unattended = 0
  personSeen = 0
  flowState = 'off'
  deadline = 0
  asked = new Map()
  stopped = []
  handoffTurnId = undefined
  flowId = 0
  isMainTurnRunning = false
  handOffFlow = undefined
  isOwnClear = false
  idleVetoSeen = undefined

  // Keeps pending: the mod's own /clear ends the session mid-flight.
  on('session.end', async ($, e, next) => {
    stopTimer()
    lastResponseAt = undefined
    handoffPath = undefined
    isPromptInTurn = false
    hasFired = false
    pings = 0
    spell += 1
    isIdleHandoff = false
    await onSessionEnd($, e)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    stopTimer()
    spell += 1
    turnStartedAt = await $.clock.now()
    await onTurnStart($, e)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // Before any await: a turn.start landing in one moves spell, and this
    // turn's wake must not arm inside the next turn.
    const turnSpell = spell
    const result = await next(e)
    // Before the agentId guard: the done check reads agent turns too.
    await onTurnComplete($, e)
    if (e.agentId) return result

    // Any end of a turn closes check 3's window: a later same text is a new
    // prompt, also a retry after the resubmitted turn failed.
    resent = undefined

    // A person prompt resets pings, so pings > 0 means this is the ping's own
    // turn. It refreshed nothing: lastResponseAt stays, the handoff runs now.
    const isFailed = e.reason === 'error' || e.reason === 'refusal'
    const isFailedPing = isFailed && pings > 0 && !hasFired
    if (isFailedPing) {
      pings = PINGS
      arm($, 0)

      return result
    }

    await settleTurn($, e.answer, e.reason, turnSpell)

    return result
  })

  on('prompt.submit', async ($, e, next) => {
    const isPerson = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    if (!isPerson) return next(e)

    // The person is back, even for a command: the cap resets, and a hands-free
    // continue still waiting for its tick goes stale.
    unattended = 0
    personSeen += 1
    isIdleHandoff = false

    // Both reads before check 2; no await from there to setting pending, so
    // two overlapping person prompts can't both reach check 5.
    const now = await $.clock.now()
    const sessionId = await $.session.id()

    if (pending) {
      if (e.text !== pending.text) pending.text += `\n\n${e.text}`
      const appended = { drop: 'Added to your prompt that is being continued from the handoff.' }

      return appended
    }

    const duplicate = { drop: 'Already sent after clearing.' }
    const isResent = resent !== undefined && now < resent.until && e.text.trim() === resent.text.trim()
    if (isResent) return duplicate

    const path = handoffPath
    const isCommand = e.text.startsWith('/')
    const hasAttachments = (e.attachments?.length ?? 0) > 0
    // A prompt typed into a running turn: that turn keeps the cache warm.
    const isInTurn = e.turnId !== undefined
    const isWarm = isInTurn || lastResponseAt === undefined || now - lastResponseAt < TTL_MS
    const isPassing = isCommand || hasAttachments || path === undefined || isWarm
    if (isPassing) {
      hasFired = false
      pings = 0
      if (!isCommand) spell += 1
      if (e.turnId) isPromptInTurn = true

      return next(e)
    }

    stopTimer()
    hasFired = false
    pings = 0
    spell += 1
    pending = { text: e.text, handoffPath: path, sessionId }
    handoffPath = undefined
    // A command can't run inside a hook the turn is waiting on.
    $.clock.after(0, () => continueFresh($))
    const cleared = { drop: 'Cache cold: clearing and continuing from the handoff with your prompt.' }

    return cleared
  })

  on('session.compact', async ($, e, next) => {
    const isSkipped = await isVetoing($, e)
    const skipped: SessionCompactSkipped = { skip: SKIP_REASON }
    if (isSkipped) return skipped

    return next(e)
  })

  // Only records an agent's reply to the done check; the send goes on as it is.
  on('session.send', async ($, e, next) => {
    if (e.agentId) answer($, e.agentId, e.text)

    return next(e)
  })
}

// The cold return: /clear, then the dropped prompt resubmitted as the user's
// own with the handoff to read first. Any failure shows the prompt in a toast.
async function continueFresh($: EngineInterface): Promise<void> {
  // The same object check 2 appends to, until pending is cleared below.
  const sent = pending
  if (!sent) return

  try {
    await $.command.run({ command: 'clear' })
    const sessionId = await $.session.id()
    // Submitting now would land in the cold session.
    if (sessionId === sent.sessionId) throw new Error('/clear kept the session')

    const now = await $.clock.now()
    // Before the submit: a re-send while it is in flight meets check 3.
    pending = undefined
    resent = { text: sent.text, until: now + DUP_MS }
    const request = `Continue from the handoff in ${sent.handoffPath}: read it and run its Verify command, then\n`
      + `act on my new request below. It overrides the handoff's Next step.\n\n${sent.text}`
    const { drop } = await $.prompt.submit({ asUser: true, text: request })
    if (drop) throw new Error(drop)
  } catch {
    $.ui.toast(`Couldn't continue from the handoff. Your prompt: ${sent.text}`)
    resent = undefined
  } finally {
    pending = undefined
  }
}

// The idle return: /clear, then the handoff's Next step as the user's own.
// Leaves handoffPath alone: a kept session still has it for the cold path, and
// a good clear's session.end has wiped it.
async function continueIdle($: EngineInterface, path: string, seenAtSettle: number): Promise<void> {
  const request = `Continue from the handoff in ${path}: read it, run its Verify command, then do its Next step.`
  try {
    const sessionId = await $.session.id()
    await $.command.run({ command: 'clear' })
    const clearedId = await $.session.id()
    if (clearedId === sessionId) throw new Error('/clear kept the session')
    // A person prompt during the /clear is in the new session already: no
    // unattended Next step behind it, and the cap stays theirs.
    if (personSeen !== seenAtSettle) throw new Error('a person prompt came first')

    const { drop } = await $.prompt.submit({ asUser: true, text: request })
    if (drop) throw new Error(drop)

    unattended = 1
  } catch {
    $.ui.toast(`Couldn't continue from the handoff. To continue, paste: ${request}`)
  }
}

// turn.complete steps 1-4: record a handoff written this turn, continue from
// the idle one hands-free, or arm the wake.
async function settleTurn($: EngineInterface, answer: string, reason: TurnCompleteReason, turnSpell: number): Promise<void> {
  // Before any await: a person prompt landing in one clears the flag itself.
  const wasIdleHandoff = isIdleHandoff
  isIdleHandoff = false
  const seenAtSettle = personSeen
  const path = await freshHandoff($, answer)
  handoffPath = path
  lastResponseAt = await $.clock.now()
  isPromptInTurn = false
  stopTimer()

  const isHandsFree = wasIdleHandoff && reason === 'answer' && path !== undefined && isUnattendedAllowed() && !isFlowActive()
  if (isHandsFree) {
    // Checked before the /clear, which moves spell itself: a person prompt or
    // command, a queued turn, or the compaction flow that came first wins.
    const continueIfCurrent = async (): Promise<void> => {
      const isStale = spell !== turnSpell || handoffPath !== path || personSeen !== seenAtSettle || isFlowActive()
      if (isStale) return

      await continueIdle($, path, seenAtSettle)
    }
    // A command can't run inside a hook the turn is waiting on.
    $.clock.after(0, continueIfCurrent)
  }

  const isArmable = reason === 'answer' && !hasFired && path === undefined
  if (!isArmable) return

  const { context } = await $.session.usage()
  const tokens = context.tokens ?? 0
  const hasMovedOn = spell !== turnSpell
  if (tokens < MIN_TOKENS || hasMovedOn) return

  arm($, TTL_MS - LEAD_MS)
}

// The first handoff path in the reply whose file was written during this turn;
// a reply that only quotes an older handoff, or (the cold path's rule, off for
// the compaction flow) answered a prompt typed into the turn, has none.
async function freshHandoff($: EngineInterface, answer: string, isTypedPromptVoiding = true): Promise<string | undefined> {
  const startedAt = turnStartedAt
  if (startedAt === undefined || (isTypedPromptVoiding && isPromptInTurn)) return undefined

  for (const [spelled] of answer.matchAll(HANDOFF_PATH)) {
    const path = await expandHome($, spelled)
    const stat = await $.fs.stat(path).catch(() => undefined)
    if (stat && stat.mtimeMs >= startedAt) return path
  }

  return undefined
}

async function expandHome($: EngineInterface, path: string): Promise<string> {
  if (!path.startsWith('~')) return path

  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))

  if (home === undefined) return path

  return home + path.slice(1)
}

function arm($: EngineInterface, delayMs: number): void {
  stopTimer()
  const armedSpell = spell
  const timer = $.clock.after(delayMs, () => fire($, armedSpell))
  cancelTimer = () => timer.cancel()
}

function stopTimer(): void {
  cancelTimer?.()
  cancelTimer = undefined
}

// The idle wake: a refresh ping for the first PINGS wakes, then /handoff while
// the cache is still warm. A spell that moved on since arming sends nothing.
async function fire($: EngineInterface, armedSpell: number): Promise<void> {
  const now = await $.clock.now()
  if (spell !== armedSpell) return

  // Sleep guard: a late timer (the machine slept) finds the cache cold already.
  const isLate = lastResponseAt === undefined || now - lastResponseAt >= TTL_MS
  if (isLate) return
  // A handoff in place of compaction is running: the next main turn re-arms.
  // Vetoed with no main turn running (the veto turn ended aborted) waits for
  // the person, so the cache is kept warm as usual.
  const isWaitingVeto = flowState === 'vetoed' && !isMainTurnRunning
  if (isFlowActive() && !isWaitingVeto) return

  if (pings < PINGS) {
    pings += 1
    $.ui.toast(`Keeping the prompt cache warm (${pings}/${PINGS})`)
    const { drop } = await $.prompt.submit({ text: PING_TEXT }).catch(() => ({ drop: 'rejected' }))
    // A person prompt during the submit owns the spell now.
    if (spell !== armedSpell) return
    if (!drop) return

    // cold-cache's block reason, maybe behind an engine prefix: the cache is
    // cold, so a handoff would pay the re-cache with nobody there.
    if (drop.includes('Prompt cache expired:')) {
      hasFired = true

      return
    }
  }

  hasFired = true
  $.ui.toast('Idle: writing a handoff while the cache is warm')
  isIdleHandoff = true
  await $.command.run({ command: 'handoff', args: HANDOFF_ARGS }).catch(() => {
    // No handoff turn follows: a later unrelated one must not continue.
    isIdleHandoff = false
    $.ui.toast('Idle: /handoff could not run')
  })
}

// --- Handoff in place of auto-compaction: flow ---

// Called from idle's turn.start hook (one registration per event per plugin).
// A subagent's run raises no turn.start: every one here is a main turn.
async function onTurnStart($: EngineInterface, e: TurnStartInput): Promise<void> {
  isMainTurnRunning = true
  // S5's fast fail, best effort: the engine may not show the args in e.text.
  const isMarked = flowState === 'handing-off' && e.text.includes(MARKER)
  if (isMarked) handoffTurnId = e.turnId
}

// Called from idle's turn.complete hook, for main and agent turns alike.
async function onTurnComplete($: EngineInterface, e: TurnCompleteInput): Promise<void> {
  if (e.agentId) {
    answer($, e.agentId, e.answer)

    return
  }

  isMainTurnRunning = false
  const flow = flowId
  // S4: the check settled during this turn; it may hand off now it has ended.
  if (handOffFlow === flow) {
    handOffFlow = undefined
    $.clock.after(0, () => runHandoff($, flow))
  }

  if (flowState === 'handing-off') {
    await findHandoffTurn($, e, flow).catch(() => fail($, flow))

    return
  }

  // S2: a veto turn ending aborted, error or refusal waits for the next answer.
  const isStart = e.reason === 'answer' && flowState === 'vetoed'
  if (!isStart) return

  // Now, not in check: a second answer turn before the tick starts no second check.
  flowState = 'checking'
  // agent.list and the sends wait for the tick: the turn is waiting on this hook.
  $.clock.after(0, () => check($, flow).catch(() => fail($, flow)))
  // FLOW_MS starts with the check, not the veto: a long veto turn outlives it.
  const now = await $.clock.now()
  if (flow !== flowId) return

  deadline = now + FLOW_MS
  $.clock.after(FLOW_MS, () => timeOut($, flow))
}

// Called from idle's session.end hook. S7: the mod's own /clear leaves the flow
// to clearAndContinue; any other end (a person's /clear, the cold path's,
// /resume, exit) cancels it, a failed one too.
async function onSessionEnd($: EngineInterface, e: SessionEndInput): Promise<void> {
  if (isOwnClear) return

  reset('off')
}

// Any rejection after the veto: the next auto compaction runs.
function fail($: EngineInterface, flow: number): void {
  if (flow !== flowId) return

  reset('failed')
  $.ui.toast(FAILED_TOAST)
}

// One unattended continue per person prompt, for the idle path and for the
// flow while idle.
function isUnattendedAllowed(): boolean {
  return unattended === 0
}

function isFlowActive(): boolean {
  return ACTIVE.includes(flowState)
}

// Any error deciding fails open: compaction runs as it would without the mod.
async function isVetoing($: EngineInterface, e: SessionCompactInput): Promise<boolean> {
  try {
    return await veto($, e)
  } catch {
    // Clearing: the old conversation may be gone; clearAndContinue owns the outcome.
    if (flowState !== 'clearing') reset('failed')

    return false
  }
}

// S1: only the main conversation's auto compaction is ever vetoed.
async function veto($: EngineInterface, e: SessionCompactInput): Promise<boolean> {
  const isMainAuto = e.trigger === 'auto' && e.agentId === undefined
  if (!isMainAuto) return false

  // Reads first: no await after them, so the decision sees the current state.
  const { context } = await $.session.usage({ breakdown: 'summary' })
  const now = await $.clock.now()
  // In use now, a paste since the last response included; context.tokens is
  // only what the last response was answered over.
  const tokens = context.breakdown?.totalTokens ?? context.tokens ?? 0
  const isActive = isFlowActive()
  const isTooLong = tokens >= WINDOW_SHARE * context.window
  // deadline 0: still vetoed, no check yet, so only isTooLong ends the veto.
  const isOverdue = isActive && deadline > 0 && now > deadline
  // clearAndContinue owns the outcome: the old conversation may be gone already.
  if (flowState === 'clearing') return !isTooLong

  if (isTooLong || isOverdue) {
    // Compaction runs now, so the next fill cycle's auto is vetoed again.
    reset('off')

    return false
  }

  if (flowState === 'failed') {
    reset('off')

    return false
  }

  if (isActive) return true

  // An unattended continue came first and nothing is working: compaction runs,
  // no second chain. The engine's idle compaction never fires mid-turn, and a
  // ping's turn is no work; a long run's mid-turn compactions still hand off.
  const isIdle = !isMainTurnRunning || pings > 0
  if (isIdle && !isUnattendedAllowed()) return false

  // No deadline yet: onTurnComplete starts it with the check.
  flowState = 'vetoed'
  idleVetoSeen = isIdle ? personSeen : undefined
  $.ui.toast('Handing off instead of compacting')

  return true
}

function timeOut($: EngineInterface, flow: number): void {
  // Clearing: clearAndContinue owns the outcome, since the old conversation may
  // be gone already. A clear that hangs still lets veto's isTooLong pass through.
  if (flow !== flowId || flowState === 'clearing') return

  reset('failed')
  $.ui.toast('Handoff timed out; auto-compaction allowed again')
}

function reset(to: 'off' | 'failed'): void {
  flowState = to
  deadline = 0
  asked.clear()
  stopped = []
  handoffTurnId = undefined
  flowId += 1
}

// S3: ask each idle agent whether it is done; the answers arrive at answer().
async function check($: EngineInterface, flow: number): Promise<void> {
  if (flow !== flowId) return

  const agents = await $.agent.list()
  if (flow !== flowId) return

  const idleAgents = agents.filter((agent) => agent.status === 'idle')
  // All in asked before the first send: a reply may land while later sends run.
  for (const agent of idleAgents) asked.set(agent.id, { agent })
  if (idleAgents.length === 0) {
    settle($)

    return
  }

  $.clock.after(CHECK_MS, () => expire($, flow))
  const reporters = idleAgents.filter((agent) => REPORT_TYPES.has(agent.type))
  for (const agent of reporters) {
    asked.set(agent.id, { agent, reply: 'report agent, stopped without a check' })
    await stop($, flow, agent)
    if (flow !== flowId) return
  }

  for (const agent of idleAgents.filter((agent) => !REPORT_TYPES.has(agent.type))) {
    const sent = await $.session.send({ to: { agentId: agent.id }, text: DONE_CHECK })
    if (flow !== flowId) return
    if (!sent.isDelivered) keep($, agent.id, `not delivered: ${sent.reason}`)
  }
}

// An asked agent's first reply: DONE stops it, anything else keeps it.
function answer($: EngineInterface, agentId: string, reply: string): void {
  const entry = asked.get(agentId)
  const isOpen = entry !== undefined && entry.reply === undefined && entry.note === undefined
  if (!isOpen || reply.trim() === '') return

  const line = reply.trim().split('\n')[0].trim()
  if (line.toUpperCase().startsWith('NOT DONE')) {
    asked.set(agentId, { ...entry, reply, note: line.slice('NOT DONE'.length).replace(/^[\s:]+/, '') })
    settle($)

    return
  }

  // A bare DONE only: TaskStop can't be undone, and "Done with X; Y fails" is
  // not done.
  if (/^DONE[.!]?$/i.test(line)) {
    asked.set(agentId, { ...entry, reply })
    const flow = flowId
    // The reply may come inside a hook the turn waits on.
    $.clock.after(0, () => stop($, flow, entry.agent))

    return
  }

  asked.set(agentId, { ...entry, reply, note: `unclear reply: ${line.slice(0, 80)}` })
  settle($)
}

// An asked agent with no reply yet is kept with the note.
function keep($: EngineInterface, agentId: string, note: string): void {
  const entry = asked.get(agentId)
  const isOpen = entry !== undefined && entry.reply === undefined && entry.note === undefined
  if (!isOpen) return

  asked.set(agentId, { ...entry, note })
  settle($)
}

// A tool error, a refusal or a rejection keeps the agent with a note.
async function stop($: EngineInterface, flow: number, agent: AgentInfo): Promise<void> {
  if (flow !== flowId) return

  const result = await $.tool.call({ tool: 'TaskStop', task_id: agent.id }).catch(() => undefined)
  if (flow !== flowId) return

  const isStopped = result !== undefined && !result.isError && result.deny === undefined
  if (isStopped) {
    stopped.push(agent)
  } else {
    const entry = asked.get(agent.id)
    if (entry) asked.set(agent.id, { ...entry, note: 'stop failed' })
  }
  settle($)
}

// CHECK_MS after the first send, every agent still without a reply is kept.
function expire($: EngineInterface, flow: number): void {
  if (flow !== flowId) return

  for (const agentId of asked.keys()) keep($, agentId, 'no answer to the done check')
}

// Runs after every change to asked or stopped. The one change that settles
// the last agent hands off; asked keeps its notes for the /handoff args.
function settle($: EngineInterface): void {
  const isSettled = [...asked.values()].every((entry) => entry.note !== undefined || stopped.includes(entry.agent))
  if (!isSettled || flowState !== 'checking') return

  handOff($)
}

// S4, the state still checking. The settle may come inside a hook the turn
// waits on, and a running main turn hands off only once it ends.
function handOff($: EngineInterface): void {
  const flow = flowId
  if (isMainTurnRunning) {
    handOffFlow = flow

    return
  }

  $.clock.after(0, () => runHandoff($, flow))
}

async function runHandoff($: EngineInterface, flow: number): Promise<void> {
  // A second settle before the tick runs no second /handoff.
  if (flow !== flowId || flowState !== 'checking') return

  flowState = 'handing-off'
  try {
    const agents = await $.agent.list()
    if (flow !== flowId) return

    await $.command.run({ command: 'handoff', args: handoffArgs(agents) })
  } catch {
    fail($, flow)
  }
}

// The marker, the alive and ended agents from the re-read list plus every
// stopped one (by id, once), then HANDOFF_ARGS.
function handoffArgs(agents: AgentInfo[]): string {
  const isStopped = (agent: AgentInfo): boolean => stopped.some((entry) => entry.id === agent.id)
  const isListed = (agent: AgentInfo): boolean => agents.some((entry) => entry.id === agent.id)
  const isAlive = (agent: AgentInfo): boolean => ALIVE_STATUSES.includes(agent.status) && !isStopped(agent)
  const alive = agents.filter(isAlive)
  const unlisted = stopped.filter((agent) => !isListed(agent))
  const ended = agents.filter((agent) => !isAlive(agent)).concat(unlisted)
  const aliveLines = alive.map(aliveLine)
  const endedLines = ended.map((agent) => endedLine(agent, isStopped(agent)))
  const listed = [ALIVE_HEADER, ...orNone(aliveLines), 'Ended agents:', ...orNone(endedLines)]
  const lines = ended.length + alive.length > 0 ? listed : ['No agents.']

  return [MARKER, ...lines, HANDOFF_ARGS].join('\n')
}

function aliveLine(agent: AgentInfo): string {
  // || not ??: a bare NOT DONE leaves the note ''.
  const note = asked.get(agent.id)?.note || '-'

  return `${agent.id} · ${oneLine(agent.name ?? '') || '-'} · ${agent.type} · ${agent.status} · "${oneLine(agent.description)}" · ${note}`
}

function endedLine(agent: AgentInfo, isStopped: boolean): string {
  // A stopped agent the list dropped, or still shows alive, reads stopped.
  const status = isStopped && ALIVE_STATUSES.includes(agent.status) ? 'stopped' : agent.status
  const line = `${agent.id} · ${agent.type} · ${status} · "${oneLine(agent.description)}"`

  return isStopped ? `${line} · stopped by the handoff check` : line
}

// The handoff skill copies each agent line verbatim: a newline would split it.
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function orNone(lines: string[]): string[] {
  return lines.length > 0 ? lines : ['none']
}

// S5: the first main answer turn whose reply names a fresh handoff file is the
// handoff turn; a notice turn names none. The marked turn ending without one fails.
async function findHandoffTurn($: EngineInterface, e: TurnCompleteInput, flow: number): Promise<void> {
  const isMarked = e.turnId === handoffTurnId
  // A person's prompt typed into the /handoff turn doesn't void its file.
  const path = e.reason === 'answer' ? await freshHandoff($, e.answer, false) : undefined
  if (flow !== flowId) return

  if (path === undefined) {
    if (isMarked) fail($, flow)

    return
  }

  flowState = 'clearing'
  const sessionId = await $.session.id()
  if (flow !== flowId) return

  const clearIfCurrent = async (): Promise<void> => {
    if (flow === flowId) await clearAndContinue($, path, sessionId)
  }
  // The clear waits for the tick: the turn is waiting on this hook.
  $.clock.after(0, clearIfCurrent)
}

// S6: the mod's own /clear, then the continue prompt as the user's own. Not
// cleared → the full session stays, so the flow fails and the next auto runs.
async function clearAndContinue($: EngineInterface, path: string, sessionId: string): Promise<void> {
  const flow = flowId
  const request = `Continue from the handoff in ${path}: read it, run its Verify command, then do its Next step.`
  let isCleared = false
  isOwnClear = true
  try {
    await $.command.run({ command: 'clear' })
    // Its session.end has passed: a person's /clear from here cancels the flow.
    isOwnClear = false
    if (flow !== flowId) return

    const clearedId = await $.session.id()
    if (flow !== flowId) return
    if (clearedId === sessionId) throw new Error('/clear kept the session')

    isCleared = true
    const { drop } = await $.prompt.submit({ asUser: true, text: request })
    if (flow !== flowId) return
    if (drop) throw new Error(drop)

    if (idleVetoSeen === personSeen) unattended = 1
    reset('off')
  } catch {
    if (flow !== flowId) return

    // Cleared: the new session is small, so the flow ends off.
    const failure = isCleared ? `Couldn't continue from the handoff` : FAILED_TOAST
    reset(isCleared ? 'off' : 'failed')
    $.ui.toast(`${failure}. To continue, paste: ${request}`)
  } finally {
    isOwnClear = false
  }
}
