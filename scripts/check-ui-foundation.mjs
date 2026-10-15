// Fails when a stylesheet gains a hard-coded colour or app code uses a removed UI pattern.
// `--update-baseline` rewrites the colour baseline, but never raises a count.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { colorLiterals, compareToBaseline } from './ui-foundation/colors.mjs';
import { REMOVED, findRemoved } from './ui-foundation/removed-patterns.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const srcDir = path.join(root, 'app/src');
const baselinePath = path.join(root, 'scripts/hardcoded-colors-baseline.json');
const COLOR_SKIP = 'app/src/tailwind.css';

const rel = (full) => path.relative(root, full).split(path.sep).join('/');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const sorted = (obj) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

function scanColors(files) {
  const current = {};
  for (const file of files) {
    const counts = {};
    for (const color of colorLiterals(readFileSync(file, 'utf8'))) counts[color] = (counts[color] ?? 0) + 1;
    if (Object.keys(counts).length) current[rel(file)] = sorted(counts);
  }
  return sorted(current);
}

const all = walk(srcDir);
const colorFiles = all.filter((f) => /\.(scss|css)$/.test(f) && rel(f) !== COLOR_SKIP);
const patternFiles = all.filter((f) => /\.(html|ts|scss)$/.test(f));
const current = scanColors(colorFiles);

if (process.argv.includes('--update-baseline')) {
  if (existsSync(baselinePath)) {
    const raises = compareToBaseline(current, JSON.parse(readFileSync(baselinePath, 'utf8')));
    if (raises.length) {
      for (const r of raises) console.error(`${r.file}: ${r.color} would rise from ${r.allowed} to ${r.count}; refusing to update`);
      console.error(`${raises.length} count(s) would rise; baseline not changed`);
      process.exit(1);
    }
  }
  writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`baseline written: ${Object.keys(current).length} files`);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.error('scripts/hardcoded-colors-baseline.json is missing; run with --update-baseline');
  process.exit(1);
}

const lines = [];
for (const f of compareToBaseline(current, JSON.parse(readFileSync(baselinePath, 'utf8')))) {
  lines.push(`${f.file}: ${f.color} appears ${f.count} time${f.count === 1 ? '' : 's'}, baseline allows ${f.allowed}`);
}
const files = patternFiles.map((f) => ({ path: rel(f), text: readFileSync(f, 'utf8') }));
for (const f of findRemoved(files, REMOVED)) lines.push(`${f.path}:${f.line}: removed pattern "${f.id}" is still used`);

if (lines.length) {
  console.error(lines.join('\n'));
  console.error(`ui-foundation check failed: ${lines.length} finding(s)`);
  process.exit(1);
}
console.log(`ui-foundation check passed: ${colorFiles.length} stylesheets, ${patternFiles.length} files scanned`);
