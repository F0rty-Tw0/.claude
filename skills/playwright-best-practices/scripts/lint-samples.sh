#!/usr/bin/env bash
# Lints Playwright code against core/house-style.md.
# Usage: scripts/lint-samples.sh [file.md | file.ts | dir ...]
#   no args   every .md in this skill (the code samples inside its fences)
#   file.md   the ts / tsx samples inside its fences
#   file.ts   a real spec, page object, fixture, or mock (sample-only rules skipped)
#   dir       every .ts / .tsx under it, node_modules excluded
# The checks read one call per line; a real file's `test(` / `test.step(` split
# across two lines is joined first.
set -u

root="$(cd "$(dirname "$0")/.." && pwd)"
files=()
for arg in "$@"; do
  if [ -d "$arg" ]; then
    mapfile -t -O "${#files[@]}" files < <(find "$arg" \( -name '*.ts' -o -name '*.tsx' \) -not -path '*/node_modules/*' | sort)
  else
    files+=("$arg")
  fi
done
[ $# -eq 0 ] && mapfile -t files < <(find "$root" -name '*.md' ! -name 'LICENSE.md' | sort)

out="$(for f in "${files[@]}"; do
  real=0
  case "$f" in *.ts | *.tsx) real=1 ;; esac
  awk -v file="$f" -v real="$real" '
    function report(n, msg) { print file ":" n ": " msg }
    function indent(s) { match(s, /^[[:space:]]*/); return RLENGTH }
    function end_test() {
      if (testline && steps && needthen) report(testline, "phase with no THEN (every WHEN needs a check after it)")
      testline = 0; steps = 0; needthen = 0; phase = ""
    }
    function start_sample() {
      spec = 0; instep = 0; inhook = 0; intest = 0; features = 0; tests = 0
      findent = -1; jindent = -1; pending = ""; first = 1; samplelines = 0; testline = 0; steps = 0; needthen = 0
    }
    function end_sample(n) {
      end_test()
      if (spec && tests && !features) report(n, "spec with no `test.describe(\x27FEATURE: …\x27)`")
      if (features > 1) report(n, "more than one FEATURE describe in one spec")
      if (!real && (lang == "ts" || lang == "tsx") && samplelines >= 60) report(fence_line, "sample is " samplelines " lines (under 60)")
    }
    BEGIN {
      start_sample()
      if (real) { infence = 1; lang = (file ~ /\.tsx$/) ? "tsx" : "ts"; first = 0; spec = (file ~ /\.(e2e|test|ct)\.tsx?$/) }
    }
    /^```/ {
      if (infence) { end_sample(NR); infence = 0; next }
      infence = 1; fence_line = NR; start_sample()
      info = substr($0, 4)
      if (info ~ /^ts avoid/) lang = "skip"
      else { split(info, words, /[ \t]/); lang = words[1] }
      if (lang == "typescript" || lang == "javascript" || lang == "js") report(NR, "fence language `" lang "`, use ts")
      next
    }
    !infence { next }
    {
      line = $0
      if (real) {
        if (pending != "") { sub(/^[[:space:]]+/, "", line); line = pending line; pending = "" }
        if (line ~ /(test|describe|step|setup|teardown|only|skip|fixme|fail)\($/) { pending = line; next }
      }
      if (lang != "ts" && lang != "tsx") next
      samplelines++
      if (first) {
        first = 0
        if (line !~ /^\/\/ [A-Za-z0-9_.\/-]+\.tsx?$/ && line !~ /^\/\/ [A-Za-z0-9_.\/-]+\.(json|yml|yaml|js|mjs|cjs)$/) report(NR, "ts sample missing `// <path>` first line")
        if (line ~ /^\/\/ .*\.(e2e|test|ct)\.tsx?$/) spec = 1
      }

      if (!real && line ~ /^[[:space:]]*\/\/ / && line !~ /^\/\/ [A-Za-z0-9_.\/-]+\.[a-z]+$/) report(NR, "comment inside sample")
      if (!real && line ~ /\/\/ \.\.\.|\/\* \.\.\. \*\//) report(NR, "elision `// ...`")
      if (!real && line ~ /(✅|❌|👍|👎)/) report(NR, "emoji marker inside sample")
      if (line ~ /(^|[^A-Za-z])interface [A-Z]/) report(NR, "`interface`, use `type`")
      if (line ~ / as [A-Z][A-Za-z<>\[\]]*[;,)]?[[:space:]]*$/ && line !~ / as const/) report(NR, "`as` cast")
      else if (line ~ / as unknown as | as any([^A-Za-z]|$)/) report(NR, "`as` cast")
      if (line ~ /: any([^A-Za-z]|$)|<any>/) report(NR, "`any`")
      if (line ~ /from "/) report(NR, "double-quoted import")
      if (line ~ /(test|setup|teardown)\.step(\.skip)?\("/ || line ~ /(^|[^.A-Za-z])test(\.skip|\.fixme|\.only|\.fail)?\("/) report(NR, "double-quoted title (single quotes)")

      # describes: FEATURE at the top, JOURNEY one level below, nothing deeper
      if (line ~ /test\.describe(\.[a-z]+)?\(/ && line !~ /describe\.configure\(/) {
        end_test(); intest = 0; inhook = 0
        d = indent(line)
        if (findent < 0 || d <= findent) {
          if (line !~ /\(\x27FEATURE: /) report(NR, "top-level describe must be FEATURE: (no GIVEN describe; state is the GIVEN title)")
          else { features++; findent = d; jindent = -1 }
        } else if (jindent >= 0 && d > jindent) {
          report(NR, "describe nested deeper than JOURNEY")
        } else if (line !~ /\(\x27JOURNEY: /) {
          report(NR, "nested describe must be JOURNEY: (FEATURE → JOURNEY → test)")
        } else {
          jindent = d
        }
      }

      # hooks and tests
      if (line ~ /(^|[^.A-Za-z])test\.(before|after)(Each|All)\(/) { end_test(); inhook = 1; intest = 0 }
      if (line ~ /(^|[^.A-Za-z])test(\.skip|\.fixme|\.only|\.fail)?\([\x27"`]/) {
        end_test(); inhook = 0; intest = 1; tests++; testline = NR; phase = "start"
        if (line !~ /test(\.skip|\.fixme|\.only|\.fail)?\([\x27"`]GIVEN [^,]+, /) report(NR, "test title must be GIVEN <state>, <outcome> (WHEN / THEN belong to steps)")
        if (line ~ /[Ss]hould/) report(NR, "`should` in test title")
      }

      # steps
      isstep = (line ~ /(test|setup|teardown)\.step(\.skip)?\(/)
      if (line ~ /(setup|teardown)\.step(\.skip)?\(/) report(NR, "step in a setup file (a *.setup.ts file has no steps)")
      if (isstep && line ~ /\.step(\.skip)?\([\x27`]/ && line !~ /\.step(\.skip)?\([\x27`](WHEN|THEN|AND) /) report(NR, "step must start with WHEN / THEN / AND (GIVEN is the test title)")
      if (isstep && !spec) report(NR, "test.step outside a spec (page objects, helpers, fixtures, mocks, utils never open steps)")
      if (line ~ /box: true/) report(NR, "boxed step (steps live only in the spec, unboxed)")
      if (isstep && spec && inhook) report(NR, "step inside a hook (each test opens its own page in its WHEN, or gets it from a fixture)")
      if (spec && (isstep || instep) && line ~ /\.(route|routeFromHAR|unroute)\(/) report(NR, "step routes (make it an option on the opening call, or a fixture)")
      if (isstep && spec && line ~ /=> *[A-Za-z_.]+\.(json|text|body|cookies|headers|allHeaders)\(\)\);?[[:space:]]*$/) report(NR, "step only reads a value (the check reads what it asserts)")
      if (isstep && spec && intest && !inhook && match(line, /\.step(\.skip)?\([\x27`](WHEN|THEN|AND) /)) {
        k = substr(line, RSTART, RLENGTH); sub(/.*\([\x27`]/, "", k); sub(/ $/, "", k)
        steps++
        if (phase == "start") {
          if (k != "WHEN") report(NR, "first step must be WHEN (the title is the GIVEN)")
          phase = (k == "THEN") ? "then" : "when"; needthen = (k != "THEN")
        } else if (phase == "when") {
          if (k == "WHEN") report(NR, "WHEN before any check (use AND, or add the THEN that ends the phase)")
          if (k == "THEN") { phase = "then"; needthen = 0 }
        } else if (phase == "then") {
          if (k == "THEN") report(NR, "second THEN in one phase (use AND)")
          if (k == "WHEN") { phase = "when"; needthen = 1 }
        }
      }

      # statements outside steps inside a test body
      if (spec && intest && !instep && !isstep && line !~ /(^|[^.A-Za-z])test(\.skip|\.fixme|\.only|\.fail)?\(/) {
        if (line ~ /^[[:space:]]*(const [A-Za-z_$][A-Za-z0-9_$]*( *: *[^=]+)? *= *)?await /) report(NR, "statement outside a step (wrap it in test.step)")
        else if (line ~ /^[[:space:]]*expect(\.[a-z]+)?\(/) report(NR, "statement outside a step (wrap it in test.step)")
      }

      if (line ~ /async \([^)]*\) =>/) report(NR, "async arrow without return type")
      if (line ~ /constructor\((private|public|protected|readonly) /) report(NR, "parameter property")
      if (line ~ /readonly [a-zA-Z]+: (Page|Locator)/ && line !~ /(public|private|protected) readonly/) report(NR, "member without accessibility")
      if (line ~ /waitForTimeout\(/) report(NR, "waitForTimeout")
      if (line ~ /^[[:space:]]*return \{/ || line ~ /=> \(\{/) report(NR, "returned object literal (name it, then return the name)")
      if (line ~ /Promise<void> => (page|context|this\.page|this\.context|[a-z]+Page\.page)\.(goto|reload|goBack|goForward|route|addInitScript|exposeFunction|exposeBinding)\(/) report(NR, "non-void Playwright call in a Promise<void> expression body (use a block body)")
      if (line ~ /\): Promise<[^>]*> *(=> *)?\{[[:space:]]*$/) voidbody = (line ~ /\): Promise<void> *(=> *)?\{/)
      if (voidbody && line ~ /^[[:space:]]*return (page|context|this\.page|this\.context)\.(goto|reload|goBack|goForward|route|addInitScript|exposeFunction|exposeBinding)\(/) report(NR, "returning a non-void Playwright call from a Promise<void> body (await it instead)")
      if (line ~ /\.step\([^,]+, async \(\) *=> *\{/) report(NR, "step with block body (must be one call)")
      if (isstep && line ~ /=> *\{[[:space:]]*$/) instep = 1
      else if (instep && line ~ /^[[:space:]]*\}(, \{[^}]*\})?\);?[[:space:]]*$/) instep = 0
      if (inhook && line ~ /^[[:space:]]*\}\);[[:space:]]*$/) inhook = 0
    }
    END { if (real || infence) end_sample(NR) }
  ' "$f"
done)"

[ -z "$out" ] && { echo "lint-samples: clean"; exit 0; }
echo "$out"
echo "lint-samples: $(echo "$out" | wc -l) finding(s)"
exit 1
