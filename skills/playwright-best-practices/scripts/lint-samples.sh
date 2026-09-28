#!/usr/bin/env bash
# Lints markdown code samples in this skill against core/house-style.md.
# Usage: scripts/lint-samples.sh [file.md ...]   (default: every .md in the skill)
set -u

root="$(cd "$(dirname "$0")/.." && pwd)"
files=("$@")
[ ${#files[@]} -eq 0 ] && mapfile -t files < <(find "$root" -name '*.md' ! -name 'LICENSE.md' | sort)

out="$(for f in "${files[@]}"; do
  awk -v file="$f" '
    /^```/ {
      if (infence) { infence = 0; spec = 0; instep = 0; next }
      infence = 1; lang = substr($0, 4); fence_line = NR
      if (lang == "ts avoid") { lang = "skip" }
      if (lang == "typescript" || lang == "javascript" || lang == "js") print file ":" NR ": fence language `" lang "`, use ts"
      first = 1
      next
    }
    !infence { next }
    {
      line = $0
      if (first) {
        first = 0
        if (lang == "ts" && line !~ /^\/\/ [A-Za-z0-9_.\/-]+\.ts$/ && line !~ /^\/\/ [A-Za-z0-9_.\/-]+\.(json|yml|yaml|js|mjs|cjs)$/) print file ":" NR ": ts sample missing `// <path>` first line"
      }
      if (lang != "ts") next
      if (line ~ /^[[:space:]]*\/\/ / && line !~ /^\/\/ [A-Za-z0-9_.\/-]+\.[a-z]+$/) print file ":" NR ": comment inside sample"
      if (line ~ /\/\/ \.\.\.|\/\* \.\.\. \*\//) print file ":" NR ": elision `// ...`"
      if (line ~ /(✅|❌|👍|👎)/) print file ":" NR ": emoji marker inside sample"
      if (line ~ /(^|[^A-Za-z])interface [A-Z]/) print file ":" NR ": `interface`, use `type`"
      if (line ~ / as [A-Z][A-Za-z<>\[\]]*[;,)]?[[:space:]]*$/ && line !~ / as const/) print file ":" NR ": `as` cast"
      if (line ~ / as unknown as /) print file ":" NR ": `as unknown as`"
      if (line ~ /: any([^A-Za-z]|$)|<any>/) print file ":" NR ": `any`"
      if (line ~ /from "/) print file ":" NR ": double-quoted import"
      if (line ~ /^test\.describe(\.[a-z]+)?\(/ && line !~ /describe\.configure\(/ && line !~ /\('\''FEATURE: /) print file ":" NR ": top-level describe must be FEATURE: (no GIVEN describe; state is the GIVEN title)"
      if (line ~ /^  test\.describe(\.[a-z]+)?\(/ && line !~ /describe\.configure\(/ && line !~ /\('\''JOURNEY: /) print file ":" NR ": nested describe must be JOURNEY: (FEATURE → JOURNEY → test)"
      if (line ~ /^   +test\.describe(\.[a-z]+)?\(/ && line !~ /describe\.configure\(/) print file ":" NR ": describe nested deeper than JOURNEY"
      if (line ~ /^[[:space:]]*test(\.skip|\.fixme)?\(['\''"`]/ && line !~ /^[[:space:]]*test(\.skip|\.fixme)?\(['\''"`]GIVEN [^,]+, /) print file ":" NR ": test title must be GIVEN <state>, <outcome> (WHEN / THEN belong to steps)"
      if (line ~ /^[[:space:]]*test\(["'\''`]/ && line ~ /[Ss]hould/) print file ":" NR ": `should` in test title"
      if (line ~ /test\.step\(['\''`]/ && line !~ /test\.step\(['\''`](WHEN|THEN|AND) /) print file ":" NR ": step must start with WHEN / THEN / AND (GIVEN is the test title)"
      if (!spec && line ~ /test\.step\(/) print file ":" NR ": test.step outside a spec (page objects, helpers, fixtures, utils never open steps)"
      if (line ~ /box: true/) print file ":" NR ": boxed step (steps live only in the spec, unboxed)"
      if (line ~ /^[[:space:]]*test(\.skip|\.fixme|\.describe|\.beforeEach|\.afterEach|\.beforeAll|\.afterAll)?\(/) { whens = 0; firststep = 1; inhook = (line ~ /test\.(before|after)(Each|All)\(/) }
      if (spec && inhook && line ~ /test\.step\(/) print file ":" NR ": step inside a hook (each test opens its own page in its WHEN)"
      if (spec && !inhook && firststep && line ~ /test\.step\(['\''`]/) { firststep = 0; if (line !~ /test\.step\(['\''`]WHEN /) print file ":" NR ": first step must be WHEN (the title is the GIVEN)" }
      if (spec && line ~ /test\.step\(['\''`]WHEN /) { whens++; if (whens > 1) print file ":" NR ": second WHEN step in one test (use AND, or split the test)" }
      if (line ~ /async \([^)]*\) =>/) print file ":" NR ": async arrow without return type"
      if (line ~ /constructor\((private|public|protected|readonly) /) print file ":" NR ": parameter property"
      if (line ~ /readonly [a-zA-Z]+: (Page|Locator)/ && line !~ /(public|private|protected) readonly/) print file ":" NR ": member without accessibility"
      if (line ~ /waitForTimeout\(/) print file ":" NR ": waitForTimeout"
      if (line ~ /^[[:space:]]*return \{/ || line ~ /=> \(\{/) print file ":" NR ": returned object literal (name it, then return the name)"
      if (line ~ /Promise<void> => (page|context|this\.page|this\.context|[a-z]+Page\.page)\.(goto|reload|goBack|goForward|route|unroute|addInitScript|routeFromHAR|exposeFunction|exposeBinding)\(/) print file ":" NR ": non-void Playwright call in a Promise<void> expression body (use a block body)"
      if (line ~ /\): Promise<[^>]*> *(=> *)?\{[[:space:]]*$/) voidbody = (line ~ /\): Promise<void> *(=> *)?\{/)
      if (voidbody && line ~ /^[[:space:]]*return (page|context|this\.page|this\.context)\.(goto|reload|goBack|goForward|route|unroute|addInitScript|routeFromHAR|exposeFunction|exposeBinding)\(/) print file ":" NR ": returning a non-void Playwright call from a Promise<void> body (await it instead)"
      if (line ~ /test\.step\([^,]+, async \(\) *=> *\{/) print file ":" NR ": step with block body (must be one call)"
      if (line ~ /test\.step\(.*=> *\{[[:space:]]*$/) instep = 1
      if (line ~ /^[[:space:]]*await (page|expect)\./ && spec && !instep) print file ":" NR ": bare page/expect call in spec body (wrap in test.step)"
      if (instep && line ~ /^[[:space:]]*\}\);?[[:space:]]*$/) instep = 0
    }
    /^\/\/ .*\.(e2e|test)\.ts$/ { spec = 1 }
  ' "$f"
done)"

[ -z "$out" ] && { echo "lint-samples: clean"; exit 0; }
echo "$out"
echo "lint-samples: $(echo "$out" | wc -l) finding(s)"
exit 1
