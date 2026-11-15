import { expect, test } from 'claude-code/testing'

import { fillShare, isGranted } from './boundary'

const file = (grants: string): string => `# Handoff\n\n## Standing grants\n${grants}\n\n## Stop after\nnone\n`

test('the grant rule reads the first line under Standing grants', () => {
  expect(isGranted(file('- "Nothing."'))).toBe(false)
  expect(isGranted(file('nothing. The export was a one-off request'))).toBe(false)
  expect(isGranted(file('none'))).toBe(false)
  expect(isGranted(file('- `nothing`'))).toBe(false)
  expect(isGranted(file('Commit freely on this branch (2026-11-15)'))).toBe(true)
  expect(isGranted(file('\n\n- Owner, 2026-11-15: "build F and G"'))).toBe(true)
  expect(isGranted('# Handoff\n\n## Goal\nx\n')).toBe(false)                    // no heading
  expect(isGranted('# Handoff\n\n## Standing grants')).toBe(false)             // heading is the last line
  expect(isGranted('## Standing grants\n## Stop after\nnone\n')).toBe(false)   // empty section
  expect(isGranted(file('Commit freely').replace(/\n/g, '\r\n'))).toBe(true)   // CRLF
  expect(isGranted(file('nothing').replace(/\n/g, '\r\n'))).toBe(false)
})

test('fill is tokens over the compaction window, else over the model window', () => {
  expect(fillShare(190_000, 1_000_000, 300_000)).toBeGreaterThan(0.633)
  expect(fillShare(190_000, 1_000_000, 300_000)).toBeLessThan(0.634)
  expect(fillShare(190_000, 1_000_000, undefined)).toBe(0.19)
  for (const bad of [0, -5, '300000', null]) expect(fillShare(190_000, 1_000_000, bad)).toBe(0.19)
  expect(fillShare(undefined, 1_000_000, 300_000)).toBe(0)
  expect(fillShare(190_000, undefined, undefined)).toBe(0)
  expect(fillShare(190_000, 0, undefined)).toBe(0)
})
