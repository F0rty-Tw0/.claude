#!/usr/bin/env node
/**
 * clean-claude.mjs - Cleanup script for ~/.claude directory
 *
 * Targets:
 *   - debug/        Debug logs (can reach GB+)
 *   - transcripts/  Old conversation transcripts
 *   - projects/     Large JSONL conversation files (prune bloated fields)
 *   - file-history/ File change history
 *   - shell-snapshots/
 *   - todos/
 *   - cache/
 *
 * Usage:
 *   node clean-claude.mjs                # dry-run (report only)
 *   node clean-claude.mjs --apply        # actually delete/prune
 *   node clean-claude.mjs --deep         # also prune projects/ JSONL content
 *   node clean-claude.mjs --days 7       # override max age (default: 14)
 *
 * References:
 *   https://github.com/anthropics/claude-code/issues/11646
 *   https://brtkwr.com/posts/2026-01-22-pruning-claude-code-conversation-history/
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

// ── CLI args ────────────────────────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    apply: { type: "boolean", default: false },
    deep: { type: "boolean", default: false },
    days: { type: "string", default: "14" },
    help: { type: "boolean", short: "h", default: false },
  },
  strict: false,
});

if (args.help) {
  console.log(`
Usage: node clean-claude.mjs [options]

Options:
  --apply   Actually delete/prune files (default: dry-run)
  --deep    Also prune bloated fields inside projects/ JSONL files
  --days N  Max age in days for files to keep (default: 14)
  -h,--help Show this help
`);
  process.exit(0);
}

const DRY_RUN = !args.apply;
const DEEP = args.deep;
const MAX_AGE_DAYS = parseInt(args.days, 10) || 14;
const CLAUDE_DIR =
  process.env.CLAUDE_DIR || path.join(process.env.USERPROFILE || process.env.HOME, ".claude");

const NOW = Date.now();
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function isOlderThan(filePath, maxMs) {
  try {
    const stat = fs.statSync(filePath);
    return NOW - stat.mtimeMs > maxMs;
  } catch {
    return false;
  }
}

function walkFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function fileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function removeFile(filePath) {
  if (DRY_RUN) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

// ── Cleanup targets ─────────────────────────────────────────────────────────
const report = { cleaned: 0, freed: 0, sections: [] };

function cleanDirectory(name, dir, { maxAgeDays = MAX_AGE_DAYS, pattern } = {}) {
  const files = walkFiles(dir);
  let totalSize = 0;
  let cleanedSize = 0;
  let cleanedCount = 0;

  for (const f of files) {
    const size = fileSize(f);
    totalSize += size;

    if (pattern && !path.basename(f).match(pattern)) continue;

    if (isOlderThan(f, maxAgeDays * 24 * 60 * 60 * 1000)) {
      cleanedSize += size;
      cleanedCount++;
      removeFile(f);
    }
  }

  report.sections.push({
    name,
    totalFiles: files.length,
    totalSize,
    cleanedFiles: cleanedCount,
    freedSize: cleanedSize,
  });
  report.cleaned += cleanedCount;
  report.freed += cleanedSize;
}

// ── JSONL pruning (deep mode) ───────────────────────────────────────────────
const TRUNCATE_THRESHOLD = 10_000; // 10KB

function pruneJsonlFile(filePath) {
  const size = fileSize(filePath);
  if (size < 50_000) return 0; // skip small files

  let content;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return 0;
  }

  const lines = content.split("\n");
  let modified = false;
  const prunedLines = [];

  for (const line of lines) {
    if (!line.trim()) {
      prunedLines.push(line);
      continue;
    }

    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      prunedLines.push(line);
      continue;
    }

    let changed = false;

    // 1. Remove normalizedMessages (duplicate of message)
    if (obj?.data?.normalizedMessages) {
      delete obj.data.normalizedMessages;
      changed = true;
    }

    // 2. Truncate large agent_progress message fields
    if (
      obj?.type === "progress" &&
      obj?.data?.type === "agent_progress" &&
      typeof obj.data.message === "string" &&
      obj.data.message.length > TRUNCATE_THRESHOLD
    ) {
      obj.data.message = `[truncated - was ${obj.data.message.length} bytes]`;
      changed = true;
    }
    // Also handle message as object
    if (
      obj?.type === "progress" &&
      obj?.data?.type === "agent_progress" &&
      typeof obj.data.message === "object" &&
      JSON.stringify(obj.data.message).length > TRUNCATE_THRESHOLD
    ) {
      const msgSize = JSON.stringify(obj.data.message).length;
      obj.data.message = `[truncated object - was ${msgSize} bytes]`;
      changed = true;
    }

    // 3. Truncate large bash_progress output
    if (
      obj?.type === "progress" &&
      obj?.data?.type === "bash_progress" &&
      typeof obj?.data?.output === "string" &&
      obj.data.output.length > TRUNCATE_THRESHOLD
    ) {
      obj.data.output =
        obj.data.output.slice(0, 1000) + "\n...[truncated]...";
      changed = true;
    }

    // 4. Truncate large toolUseResult
    if (obj?.toolUseResult) {
      const resultStr =
        typeof obj.toolUseResult === "string"
          ? obj.toolUseResult
          : JSON.stringify(obj.toolUseResult);
      if (resultStr.length > TRUNCATE_THRESHOLD) {
        obj.toolUseResult = `[truncated - was ${resultStr.length} bytes]`;
        changed = true;
      }
    }

    // 5. Truncate large thinking blocks
    if (obj?.type === "assistant" && Array.isArray(obj?.message?.content)) {
      for (const block of obj.message.content) {
        if (
          block?.type === "thinking" &&
          typeof block.thinking === "string" &&
          block.thinking.length > 20_000
        ) {
          block.thinking =
            block.thinking.slice(0, 2000) + "\n...[truncated]...";
          changed = true;
        }
      }
    }

    if (changed) modified = true;
    prunedLines.push(changed ? JSON.stringify(obj) : line);
  }

  if (!modified) return 0;

  const newContent = prunedLines.join("\n");
  const saved = content.length - newContent.length;

  if (saved > 0 && !DRY_RUN) {
    fs.writeFileSync(filePath, newContent, "utf-8");
  }

  return Math.max(0, saved);
}

function pruneProjects() {
  const projectsDir = path.join(CLAUDE_DIR, "projects");
  const files = walkFiles(projectsDir).filter((f) => f.endsWith(".jsonl"));

  let totalSize = 0;
  let freedSize = 0;
  let prunedCount = 0;

  for (const f of files) {
    totalSize += fileSize(f);
    const saved = pruneJsonlFile(f);
    if (saved > 0) {
      freedSize += saved;
      prunedCount++;
    }
  }

  report.sections.push({
    name: "projects/ JSONL pruning",
    totalFiles: files.length,
    totalSize,
    cleanedFiles: prunedCount,
    freedSize,
  });
  report.freed += freedSize;
}

// ── Main ────────────────────────────────────────────────────────────────────
console.log(`\n  Claude Directory Cleanup`);
console.log(`  ${"-".repeat(40)}`);
console.log(`  Path:     ${CLAUDE_DIR}`);
console.log(`  Mode:     ${DRY_RUN ? "DRY RUN (use --apply to execute)" : "APPLY"}`);
console.log(`  Max age:  ${MAX_AGE_DAYS} days`);
console.log(`  Deep:     ${DEEP ? "yes (prune JSONL content)" : "no"}\n`);

// 1. Debug logs
cleanDirectory("debug/", path.join(CLAUDE_DIR, "debug"));

// 2. Transcripts
cleanDirectory("transcripts/", path.join(CLAUDE_DIR, "transcripts"));

// 3. Projects (old conversation JSONL files)
cleanDirectory("projects/", path.join(CLAUDE_DIR, "projects"));

// 4. File history
cleanDirectory("file-history/", path.join(CLAUDE_DIR, "file-history"));

// 5. Shell snapshots
cleanDirectory("shell-snapshots/", path.join(CLAUDE_DIR, "shell-snapshots"));

// 5. Todos
cleanDirectory("todos/", path.join(CLAUDE_DIR, "todos"));

// 6. Cache
cleanDirectory("cache/", path.join(CLAUDE_DIR, "cache"));

// 7. Paste cache
cleanDirectory("paste-cache/", path.join(CLAUDE_DIR, "paste-cache"));

// 8. Deep mode: prune JSONL conversation files
if (DEEP) {
  pruneProjects();
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log(`  ${"Directory".padEnd(30)} ${"Files".padStart(6)} ${"Total".padStart(10)} ${"Clean".padStart(6)} ${"Freed".padStart(10)}`);
console.log(`  ${"-".repeat(30)} ${"-".repeat(6)} ${"-".repeat(10)} ${"-".repeat(6)} ${"-".repeat(10)}`);

for (const s of report.sections) {
  console.log(
    `  ${s.name.padEnd(30)} ${String(s.totalFiles).padStart(6)} ${fmtBytes(s.totalSize).padStart(10)} ${String(s.cleanedFiles).padStart(6)} ${fmtBytes(s.freedSize).padStart(10)}`
  );
}

console.log(`  ${"-".repeat(30)} ${"-".repeat(6)} ${"-".repeat(10)} ${"-".repeat(6)} ${"-".repeat(10)}`);
console.log(
  `  ${"TOTAL".padEnd(30)} ${"".padStart(6)} ${"".padStart(10)} ${String(report.cleaned).padStart(6)} ${fmtBytes(report.freed).padStart(10)}`
);

if (DRY_RUN) {
  console.log(`\n  This was a dry run. Use --apply to actually clean up.`);
}
if (!DEEP) {
  console.log(`  Use --deep to also prune bloated JSONL conversation files.`);
}
console.log();
