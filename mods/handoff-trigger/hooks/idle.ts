import type { EngineInterface, On, TurnCompleteReason } from 'claude-code'

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

// Module state, one per Claude Code process; /clear and /resume keep it.
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

  // Keeps pending: the mod's own /clear ends the session mid-flight.
  on('session.end', async ($, e, next) => {
    stopTimer()
    lastResponseAt = undefined
    handoffPath = undefined
    isPromptInTurn = false
    hasFired = false
    pings = 0
    spell += 1

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    stopTimer()
    spell += 1
    turnStartedAt = await $.clock.now()

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // Before any await: a turn.start landing in one moves spell, and this
    // turn's wake must not arm inside the next turn.
    const turnSpell = spell
    const result = await next(e)
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

// turn.complete steps 1-4: record a handoff written this turn, or arm the wake.
async function settleTurn($: EngineInterface, answer: string, reason: TurnCompleteReason, turnSpell: number): Promise<void> {
  const path = await freshHandoff($, answer)
  handoffPath = path
  lastResponseAt = await $.clock.now()
  isPromptInTurn = false
  stopTimer()

  const isArmable = reason === 'answer' && !hasFired && path === undefined
  if (!isArmable) return

  const { context } = await $.session.usage()
  const tokens = context.tokens ?? 0
  const hasMovedOn = spell !== turnSpell
  if (tokens < MIN_TOKENS || hasMovedOn) return

  arm($, TTL_MS - LEAD_MS)
}

// The first handoff path in the reply whose file was written during this turn;
// a reply that only quotes an older handoff, or answered a prompt typed into
// the turn, has none.
async function freshHandoff($: EngineInterface, answer: string): Promise<string | undefined> {
  const startedAt = turnStartedAt
  if (startedAt === undefined || isPromptInTurn) return undefined

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
  await $.command.run({ command: 'handoff', args: HANDOFF_ARGS }).catch(() => {
    $.ui.toast('Idle: /handoff could not run')
  })
}
