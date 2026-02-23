# Value Realization: All Dimensions Green

**Date**: 2026-02-23
**Status**: Planned

## Context

The Value Realization analysis identified four dimensions scoring 🟡🟢🟡🔴. The product is positioned as a capability ("query many providers") rather than an outcome. `ask_all` returns raw JSON without comparison intelligence. `usage_summary` reports stats without insights. The setup CLI doesn't help users discover what they're missing. This plan addresses all four dimensions with targeted changes to positioning text, response enrichment, and discovery messaging.

## Dimension Map

| Dimension | Current | Target | Fix |
|---|---|---|---|
| Value Clarity | 🟡 | 🟢 | Rewrite descriptions from features to outcomes |
| Value Timeline | 🟢 | 🟢 | Add insights to usage_summary for "gets smarter over time" |
| Value Perception | 🟡 | 🟢 | Add comparison analysis to ask_all response |
| Value Discovery | 🔴 | 🟢 | Add discovery messaging to setup CLI + list_providers |

---

## Phase 1: Value Clarity — Description Rewrites

All changes are string constant edits. No logic changes.

### 1.1 `package.json` (line 4)
```
OLD: "Multi-model AI gateway — query any CLI AI tool through MCP"
NEW: "Get better AI answers — compare Claude, Codex, Gemini, Copilot, and OpenCode side-by-side through MCP"
```

### 1.2 `README.md`
- **Line 3 tagline**: `"Query Claude, Codex, Gemini, Copilot, and OpenCode from one interface."` -> `"Get better AI answers — compare Claude, Codex, Gemini, Copilot, and OpenCode side-by-side."`
- **Line 9 subheadline**: `"Multi-model AI gateway that wraps..."` -> `"Stop guessing which AI gives the best answer. Compare them all side-by-side from your existing editor — add a new provider by editing a JSON file."`
- **"What Can You Do?" section** (lines 28-49): Restructure to lead with `ask_all` as hero, frame `ask_*` as "get a second opinion", frame `usage_summary` as "track which AI works best"
- **New section after "What Can You Do?"**: "When Multiple Perspectives Matter" with 4 concrete scenarios (code review, architecture, debugging, learning)

### 1.3 `src/feature/ask/domain-logic/tool.builder.ts` (line 142)
```
OLD: `Get an answer from ${providerName}. Returns the response with provider attribution (model, timing, format).`
NEW: `Get ${providerName}'s perspective on a question — use alongside other providers to compare approaches and find the best answer.`
```

### 1.4 `src/feature/ask-all/domain-logic/tool.builder.ts` (lines 32-34)
```
OLD: `Send a prompt to all configured providers simultaneously and collect their responses. Available providers: ${providerList}. Returns a structured result with each provider's response, success status, and timing.`
NEW: `Compare AI perspectives — send the same prompt to all providers simultaneously and get a ranked comparison. Identifies the fastest responder and response length differences. Available providers: ${providerList}.`
```

### 1.5 `src/feature/usage-stats/domain-logic/tool.builder.ts` (line 6)
```
OLD: 'See how many times each AI provider was called this session, with response times and success rates'
NEW: 'See which AI provider is fastest and most reliable for you — includes rankings and a recommendation'
```

### 1.6 `src/feature/simple-tools/domain-logic/tool.builder.ts` (line 28)
```
OLD: 'See which AI models are available and their status'
NEW: 'See which AI providers are available and ready to use'
```

### Test updates for Phase 1
- `src/feature/simple-tools/domain-logic/tool.builder.spec.ts` line 67: change `toContain('AI models')` -> `toContain('AI providers')`
- Existing ask-all tool.builder tests check for provider names in description — still present, pass as-is
- Existing ask tool.builder tests check for provider name in description — still present, pass as-is

---

## Phase 2: Value Perception — ask_all Comparison Intelligence

### 2.1 New type in `src/feature/ask-all/common/ask-all.types.ts`

Add `AskAllComparison` type:
```typescript
export type AskAllComparison = Readonly<{
  fastestProvider: string | null;
  fastestTimeMs: number | null;
  slowestProvider: string | null;
  slowestTimeMs: number | null;
  speedSpreadMs: number | null;
  responseLengths: readonly Readonly<{ provider: string; characters: number }>[];
  agreementSignal: 'all-failed' | 'single-response' | 'responses-collected';
}>;
```

Add `comparison` field to `AskAllResult`:
```typescript
export type AskAllResult = Readonly<{
  prompt: string;
  totalProviders: number;
  succeeded: number;
  failed: number;
  totalExecutionTimeMs: number;
  results: readonly AskAllProviderResult[];
  comparison: AskAllComparison | null;  // null when 0 successes
}>;
```

Design rationale: No semantic similarity (would need another LLM call or embeddings dependency). Structural metrics (speed, length) are honest signals — the consuming LLM agent can do the semantic comparison itself from the raw text.

### 2.2 Update barrel `src/feature/ask-all/common/index.ts`

Add `AskAllComparison` to type exports.

### 2.3 New file: `src/feature/ask-all/domain-logic/comparison.builder.ts`

Pure function `buildComparison(results: readonly AskAllProviderResult[]): AskAllComparison | null`:
- Filter to successful results
- If 0 successes -> return object with `agreementSignal: 'all-failed'`, all nulls
- Sort by `executionTimeMs` ascending -> extract fastest/slowest
- Map successes to `responseLengths` using `response?.length ?? 0`
- Set `agreementSignal`: 1 success = `'single-response'`, 2+ = `'responses-collected'`
- Return composed `AskAllComparison`

### 2.4 New test: `src/feature/ask-all/domain-logic/comparison.builder.spec.ts` (TDD — write first)

Tests (GIVEN/WHEN/THEN pattern):
- 0 successes -> all-failed signal, null providers
- 1 success -> single-response signal, same provider is fastest and slowest
- 2 successes with different times -> fastest is quicker one, speedSpread correct
- 3 successes -> responses-collected signal
- Success with undefined response -> responseLengths characters is 0
- Results sorted correctly regardless of input order

### 2.5 Modify `src/feature/ask-all/domain-logic/ask-all.handler.ts`

Import `buildComparison`, call after `Promise.all`:
```typescript
import { buildComparison } from './comparison.builder.ts';
// ...after results collected:
const comparison = buildComparison(results);
// ...add to askAllResult object:
const askAllResult: AskAllResult = { ...existing fields, comparison };
```

### 2.6 Update test: `src/feature/ask-all/domain-logic/ask-all.handler.spec.ts`

Add to "result aggregation" describe block:
- GIVEN all succeed WHEN called THEN result includes comparison with fastestProvider
- GIVEN all fail WHEN called THEN comparison has all-failed signal
- GIVEN one succeeds WHEN called THEN comparison has single-response signal

---

## Phase 3: Value Timeline — usage_summary Insights

### 3.1 New types in `src/feature/usage-stats/common/usage-stats.types.ts`

```typescript
export type ProviderRanking = Readonly<{
  provider: string;
  avgExecutionTimeMs: number;
  successRate: number;  // 0-100 integer
}>;

export type UsageInsights = Readonly<{
  fastestProvider: string | null;
  mostReliableProvider: string | null;
  mostUsedProvider: string | null;
  rankings: readonly ProviderRanking[];
  recommendation: string | null;  // human-readable sentence
}>;
```

No change to `UsageSummary` type or to the store — composition happens in the handler to avoid data-access -> domain-logic circular dependency.

### 3.2 Update barrel `src/feature/usage-stats/common/index.ts`

Add `ProviderRanking`, `UsageInsights` to type exports.

### 3.3 New file: `src/feature/usage-stats/domain-logic/insights.builder.ts`

Pure function `buildInsights(providers: readonly ProviderStats[]): UsageInsights | null`:
- If empty -> return null
- Filter to providers with `totalCalls >= 2` (minimum for meaningful ranking)
- Build `rankings` array: `{ provider, avgExecutionTimeMs, successRate }` sorted by avgExecutionTimeMs ascending
- `fastestProvider`: first in rankings (or null)
- `mostReliableProvider`: highest successRate in rankings (or null)
- `mostUsedProvider`: highest totalCalls from all providers (not just ranked)
- `recommendation`: If 2+ ranked providers, generate sentence: `"Your fastest reliable provider is X at avg Yms (Z% success rate)."` If all below 80% success -> `"All providers have low reliability this session."` If <2 ranked -> null.

### 3.4 New test: `src/feature/usage-stats/domain-logic/insights.builder.spec.ts` (TDD)

Tests:
- Empty providers -> null
- 1 provider with 1 call -> rankings empty (below threshold), mostUsedProvider still set
- 1 provider with 2 calls -> rankings has entry
- 2 providers -> fastestProvider is lower avgExecutionTimeMs
- 2 providers -> mostReliableProvider is higher successRate
- 2 providers -> recommendation is non-null string
- All providers below 80% success -> recommendation mentions low reliability
- mostUsedProvider based on totalCalls, not ranking threshold

### 3.5 Modify `src/feature/usage-stats/domain-logic/usage-stats.handler.ts`

Compose insights in the handler (not in the store):
```typescript
import { buildInsights } from './insights.builder.ts';
// ...
export const handleUsageSummary = (): CallToolResult => {
  const summary = getUsageSummary();
  const insights = buildInsights(summary.providers);
  const response = { ...summary, insights };
  return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
};
```

### 3.6 Update test: `src/feature/usage-stats/domain-logic/usage-stats.handler.spec.ts`

Mock `buildInsights` for isolation, verify it's called with `summary.providers`, and check the response includes both the summary fields and the insights field.

---

## Phase 4: Value Discovery — Setup CLI + list_providers

### 4.1 New file: `src/setup/domain-logic/discovery-message.builder.ts`

Pure function `buildDiscoveryMessage(providers: readonly DetectedProvider[]): string`:
- Count available vs unavailable
- If 2+ available: show what they can do together (mention `ask_all`, `usage_summary`, "second opinion")
- If 1 available: suggest installing more for comparison
- If 0 available: say no providers detected, list supported ones
- If unavailable providers exist and available > 0: list them with brief strength descriptions

Provider strength tips (const object):
```typescript
const PROVIDER_TIPS: Readonly<Record<string, string>> = {
  claude: 'excels at nuanced reasoning and detailed explanations',
  codex: 'optimized for code generation and technical problem-solving',
  copilot: 'integrates deeply with GitHub workflows',
  gemini: 'handles large contexts and multi-modal tasks',
  opencode: 'open-source alternative for code assistance',
};
```

### 4.2 New test: `src/setup/domain-logic/discovery-message.builder.spec.ts` (TDD)

Tests:
- 3 available -> message mentions ask_all and usage_summary
- 1 available -> message suggests installing more
- 0 available -> message says no providers detected
- 2 available + 1 unavailable -> lists unavailable with tips
- All available -> no unavailable section

### 4.3 Modify `src/setup/setup-cli.ts`

Import and call after `printProviderSummary(detectedProviders)`:
```typescript
import { buildDiscoveryMessage } from './domain-logic/discovery-message.builder.ts';
// ...after printProviderSummary:
process.stdout.write(buildDiscoveryMessage(detectedProviders));
process.stdout.write('\n');
```

### 4.4 Modify `src/feature/simple-tools/domain-logic/meta.handler.ts`

Add discovery tip footer when 2+ providers are available:
```typescript
const availableCount = providers.filter((p) => p.available).length;
const tip = availableCount >= 2
  ? `\n\nTip: Use ask_all to compare answers from all ${availableCount} available providers on the same question.`
  : '';
// append tip to text output
```

### 4.5 Update test: `src/feature/simple-tools/domain-logic/meta.handler.spec.ts`

- Existing single-provider test (line 48): unaffected (only 1 available, no tip)
- Existing multi-provider test (line 69): unaffected (only 1 available in that dataset)
- Add new test: GIVEN 2+ available providers WHEN listing THEN output includes ask_all tip

---

## Implementation Order

```
1. Phase 2.1-2.2  Types (AskAllComparison) + barrel export
   Phase 3.1-3.2  Types (UsageInsights, ProviderRanking) + barrel export
   -> No dependencies, parallel

2. Phase 2.4      comparison.builder.spec.ts (TDD — tests first)
   Phase 3.4      insights.builder.spec.ts (TDD — tests first)
   Phase 4.2      discovery-message.builder.spec.ts (TDD — tests first)
   -> Depend on types from step 1, parallel with each other

3. Phase 2.3      comparison.builder.ts (make tests pass)
   Phase 3.3      insights.builder.ts (make tests pass)
   Phase 4.1      discovery-message.builder.ts (make tests pass)
   -> Parallel

4. Phase 2.5-2.6  ask-all.handler integration + test updates
   Phase 3.5-3.6  usage-stats.handler integration + test updates
   Phase 4.3      setup-cli integration
   Phase 4.4-4.5  meta.handler + test updates
   -> Depend on builders from step 3

5. Phase 1        All description rewrites (strings only)
   -> Independent, can run anytime but last avoids merge noise
```

## Files Changed

| File | Action | Phase |
|---|---|---|
| `package.json` | edit description | 1 |
| `README.md` | rewrite tagline, hero, add section | 1 |
| `src/feature/ask/domain-logic/tool.builder.ts` | edit description string | 1 |
| `src/feature/ask-all/domain-logic/tool.builder.ts` | edit description string | 1 |
| `src/feature/usage-stats/domain-logic/tool.builder.ts` | edit description string | 1 |
| `src/feature/simple-tools/domain-logic/tool.builder.ts` | edit description string | 1 |
| `src/feature/simple-tools/domain-logic/tool.builder.spec.ts` | update `toContain` check | 1 |
| `src/feature/ask-all/common/ask-all.types.ts` | add `AskAllComparison`, extend `AskAllResult` | 2 |
| `src/feature/ask-all/common/index.ts` | add type export | 2 |
| `src/feature/ask-all/domain-logic/comparison.builder.ts` | **NEW** | 2 |
| `src/feature/ask-all/domain-logic/comparison.builder.spec.ts` | **NEW** | 2 |
| `src/feature/ask-all/domain-logic/ask-all.handler.ts` | import + call buildComparison | 2 |
| `src/feature/ask-all/domain-logic/ask-all.handler.spec.ts` | add comparison tests | 2 |
| `src/feature/usage-stats/common/usage-stats.types.ts` | add `ProviderRanking`, `UsageInsights` | 3 |
| `src/feature/usage-stats/common/index.ts` | add type exports | 3 |
| `src/feature/usage-stats/domain-logic/insights.builder.ts` | **NEW** | 3 |
| `src/feature/usage-stats/domain-logic/insights.builder.spec.ts` | **NEW** | 3 |
| `src/feature/usage-stats/domain-logic/usage-stats.handler.ts` | compose insights | 3 |
| `src/feature/usage-stats/domain-logic/usage-stats.handler.spec.ts` | mock buildInsights | 3 |
| `src/setup/domain-logic/discovery-message.builder.ts` | **NEW** | 4 |
| `src/setup/domain-logic/discovery-message.builder.spec.ts` | **NEW** | 4 |
| `src/setup/setup-cli.ts` | import + call buildDiscoveryMessage | 4 |
| `src/feature/simple-tools/domain-logic/meta.handler.ts` | add discovery tip | 4 |
| `src/feature/simple-tools/domain-logic/meta.handler.spec.ts` | add tip test | 4 |

**New files**: 6 (3 source + 3 test)
**Modified files**: 18

## Verification

1. `pnpm run test` — all unit tests pass (existing + new)
2. `pnpm run typecheck` — no type errors
3. `pnpm run lint` — no lint violations
4. `pnpm run build` — builds successfully
5. Manual: run `npx agentic-mcp setup --client generic --dry-run` and verify discovery message appears
6. Manual: call `ask_all` with a test prompt and verify `comparison` field in JSON response
7. Manual: call `usage_summary` after a few `ask_*` calls and verify `insights` field with rankings
8. Manual: call `list_providers` with 2+ available and verify tip appears
