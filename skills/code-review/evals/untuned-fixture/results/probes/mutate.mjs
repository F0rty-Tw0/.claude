// Mutation probes on the fixture's head/: each breaks one behavior; a green suite means no test covers it.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const head = fileURLToPath(new URL('../../head', import.meta.url));
const probes = [
  ['M1 drop bulk canWrite check', 'src/app.js', "      if (!canWrite(session, doc)) return forbidden();\n      if (!Array.isArray", "      if (!Array.isArray"],
  ['M2 audit writes nothing', 'src/audit.js', "  appendFile(", "  void ("],
  ['M3 expiry never checked', 'src/links.js', "if (link.expiresAt && new Date() > link.expiresAt)", "if (false)"],
  ['M4 bulk forces editor role', 'src/app.js', "const role = body.role ?? 'viewer';", "const role = 'editor';"],
  ['M5 revoke no-op on store', 'src/links.js', "  links.delete(token);\n", "\n"],
];
for (const [name, file, from, to] of probes) {
  const dir = mkdtempSync(join(tmpdir(), 'untuned-mut-'));
  cpSync(head, dir, { recursive: true });
  const src = readFileSync(join(dir, file), 'utf8');
  if (!src.includes(from)) { console.log(name, '-> PATTERN NOT FOUND'); continue; }
  writeFileSync(join(dir, file), src.replace(from, to));
  let out;
  try { out = execSync('node --test 2>&1', { cwd: dir }).toString(); } catch (e) { out = e.stdout.toString(); }
  console.log(name, '->', out.match(/ℹ pass \d+/)[0], out.match(/ℹ fail \d+/)[0]);
}
