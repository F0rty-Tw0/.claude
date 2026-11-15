// Pure helpers for the turn-boundary handoff. No $ in this file: the loader
// follows $ only inside the hook's own file (idle.ts).

// At or past this share of the compaction window a granted turn end hands off.
export const BOUNDARY_SHARE = 0.6
// Hands-free continues per person prompt on the boundary path.
export const CHAIN_MAX = 6

const GRANTS_HEADING = '## Standing grants'
// The handoff skill writes "nothing" when there are no grants; real files
// also say `- "Nothing."` or `nothing. The export was a one-off request`.
const NO_GRANT = /^(nothing|none)\b/

// Granted when the first non-blank line under `## Standing grants` is not a
// "nothing" or "none" line. A missing heading or an empty section is not.
export function isGranted(handoffText: string): boolean {
  const lines = handoffText.split(/\r?\n/)
  const start = lines.indexOf(GRANTS_HEADING)
  if (start === -1) return false

  const after = lines.slice(start + 1)
  const nextHeading = after.findIndex((line) => line.startsWith('## '))
  const end = nextHeading === -1 ? after.length : nextHeading
  const section = after.slice(0, end)
  const trimmed = section.map((line) => line.trim())
  const first = trimmed.find((line) => line !== '')
  if (first === undefined) return false

  const unbulleted = first.replace(/^- /, '')
  const unquoted = unbulleted.replace(/["'`“”]/g, '')
  const bare = unquoted.toLowerCase()
  const isNoGrant = NO_GRANT.test(bare)

  return !isNoGrant
}

// tokens over the compaction window: autoCompactWindow when it is a positive
// number, else the model window. 0 when there is no usable window.
export function fillShare(tokens: number | undefined, modelWindow: number | undefined, autoCompactWindow: unknown): number {
  const isCompactWindow = typeof autoCompactWindow === 'number' && autoCompactWindow > 0
  const window = isCompactWindow ? autoCompactWindow : modelWindow
  const isUsableWindow = window !== undefined && window > 0
  if (!isUsableWindow) return 0

  const used = tokens ?? 0

  return used / window
}
