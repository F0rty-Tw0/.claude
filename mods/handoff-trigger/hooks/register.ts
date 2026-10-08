import type { Register } from 'claude-code'

import { idle } from './idle'

// Shares of autoCompactThreshold (autoCompactWindow minus the compaction buffer),
// not of the model's window. With auto-compaction off it falls back to the window.
// ponytail: constants, not userConfig; promote them if they need tuning per machine.
const NUDGE_AT = 70
const RUN_AT = 90

export const register: Register = on => {
  idle(on)

  // One nudge and one run per fill cycle; a cycle ends when the context drops
  // below NUDGE_AT again (after /clear or a compaction).
  let isNudged = false
  let hasRun = false

  // turn.complete, not session.measure: measure also fires mid-turn, where a
  // command can't run. A subagent's turn, an interrupt or an error is not the
  // end of the person's turn. The matcher also lets idle.ts hook every turn:
  // the engine takes one unmatched hook per event per plugin.
  on('turn.complete', { reason: 'answer' }, async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) {
      return result
    }

    const { context } = await $.session.usage({ breakdown: 'summary' })
    const limit = context.breakdown?.autoCompactThreshold ?? context.window
    const percent = Math.round((100 * (context.tokens ?? 0)) / limit)

    if (percent < NUDGE_AT) {
      isNudged = false
      hasRun = false
    } else if (percent >= RUN_AT && !hasRun) {
      hasRun = true
      isNudged = true
      $.ui.toast(`Context at ${percent}% of the compaction limit: running /handoff`)
      // A command can't run inside the hook the turn is waiting on.
      $.clock.after(0, () => $.command.run({ command: 'handoff' }))
    } else if (!isNudged) {
      isNudged = true
      $.ui.toast(`Context at ${percent}% of the compaction limit: consider /handoff (runs itself at ${RUN_AT}%)`)
    }

    return result
  })
}
