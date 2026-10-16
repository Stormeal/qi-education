import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const srcDir = fileURLToPath(new URL('../../app/src/', import.meta.url));

// The visually hidden input cannot show a ring, so the label re-draws it.
const ALLOWED = [".learning-quiz-answer:has(input:focus-visible)", ":host(label:focus-within)"];

function scssFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return scssFiles(full);
    return entry.name.endsWith('.scss') ? [full] : [];
  });
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

// Returns "selector chain" strings for every outline declaration.
export function outlineDeclarations(text) {
  const found = [];
  const stack = [];
  let buffer = '';
  const declaration = () => {
    const d = buffer.trim();
    buffer = '';
    if (/^outline(-[a-z]+)?\s*:/.test(d) && stack.length) found.push(stack.join(' '));
  };
  for (const ch of stripComments(text)) {
    if (ch === '{') {
      stack.push(buffer.trim().replace(/\s+/g, ' '));
      buffer = '';
    } else if (ch === '}') {
      declaration();
      stack.pop();
    } else if (ch === ';') {
      declaration();
    } else buffer += ch;
  }
  return found;
}

test('styles.scss defines the one global focus ring', () => {
  const css = readFileSync(path.join(srcDir, 'styles.scss'), 'utf8');
  assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-focus\)/);
});

test('no other stylesheet draws its own focus outline', () => {
  const offenders = [];
  for (const file of scssFiles(srcDir)) {
    if (path.basename(file) === 'styles.scss' && path.dirname(file) === path.resolve(srcDir)) continue;
    for (const chain of outlineDeclarations(readFileSync(file, 'utf8'))) {
      if (!chain.includes(':focus')) continue;
      if (ALLOWED.some((a) => chain.includes(a))) continue;
      offenders.push(`${path.relative(srcDir, file)}: ${chain}`);
    }
  }
  assert.deepEqual(offenders, []);
});
