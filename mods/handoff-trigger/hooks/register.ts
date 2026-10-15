import type { EngineInterface, Register } from 'claude-code'

import { idle } from './idle'

// Shares of autoCompactThreshold (autoCompactWindow minus the output reserve
// and the compaction buffer), not of the model's window. With auto-compaction
// off it falls back to the window.
// ponytail: constants, not userConfig; promote them if they need tuning per machine.
const NUDGE_AT = 80

export const warning = (percent: number) =>
  `Handoff-trigger mod: context is at ${percent}% of the compaction limit. ` +
  'At the limit, /handoff runs in place of auto-compaction, then /clear, and the work continues from the handoff. ' +
  'Get ready: finish or checkpoint the current step, and keep the state needed to resume in files or the handoff.'

async function percentOfLimit($: EngineInterface) {
  const { context } = await $.session.usage({ breakdown: 'summary' })
  const limit = context.breakdown?.autoCompactThreshold ?? context.window

  return Math.round((100 * (context.tokens ?? 0)) / limit)
}

const nudge = (percent: number) =>
  `Context at ${percent}% of the compaction limit: consider /handoff (runs itself before auto-compaction)`

export const register: Register = on => {
  idle(on)

  // One nudge per fill cycle; a cycle ends when the context drops below
  // NUDGE_AT again (after /clear or a compaction). The handoff itself runs in
  // place of auto-compaction (idle.ts).
  let isNudged = false
  // The warning rides the next thing the model reads anyway (a tool result
  // or a prompt): sending it on its own would cost a full-context request.
  let warnAt: number | undefined

  // True on the first look past NUDGE_AT in a fill cycle; it arms the warning.
  function isCrossing(percent: number) {
    if (percent < NUDGE_AT) {
      isNudged = false
      warnAt = undefined

      return false
    }
    if (isNudged) {
      return false
    }

    isNudged = true
    warnAt = percent

    return true
  }

  function takeWarning(context: readonly string[] = []) {
    const percent = warnAt
    warnAt = undefined

    return percent === undefined ? [...context] : [...context, warning(percent)]
  }

  // A subagent's turn, an interrupt or an error is not the end of the
  // person's turn. The matcher also lets idle.ts hook every turn: the engine
  // takes one unmatched hook per event per plugin.
  on('turn.complete', { reason: 'answer' }, async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) {
      return result
    }

    const percent = await percentOfLimit($)
    if (isCrossing(percent)) {
      $.ui.toast(nudge(percent))
    }

    return result
  })

  // A turn that works on without a prompt: the warning lands after the first
  // main-agent tool result past NUDGE_AT, inside the turn.
  // ponytail: one usage read per tool call; throttle if it shows in timings.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId || 'deny' in result) {
      return result
    }

    const percent = await percentOfLimit($)
    if (isCrossing(percent)) {
      $.ui.toast(nudge(percent))
    }
    if (warnAt === undefined) {
      return result
    }

    return { ...result, context: takeWarning(result.context) }
  })

  // A turn that answered without tools: the next prompt carries it, whoever
  // sent it (a notification, a loop, a peer), except this mod's own pings and
  // continues. Matched on `wait`, both values, because idle.ts holds the
  // unmatched hook.
  for (const wait of [false, true]) {
    on('prompt.submit', { wait }, async ($, e, next) => {
      if (warnAt === undefined || e.command || e.origin.kind === 'plugin') {
        return next(e)
      }

      const percent = warnAt
      const result = await next({ ...e, context: takeWarning(e.context) })
      // A dropped prompt (idle.ts's cold path clears) carried nothing in.
      if ('drop' in result) {
        warnAt = percent
      }

      return result
    })
  }
}
