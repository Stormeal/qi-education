import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrastRatio } from './contrast.mjs';
import { readTheme } from './theme.mjs';

const css = readFileSync(new URL('../../app/src/tailwind.css', import.meta.url), 'utf8');
const theme = readTheme(css);
const v = (name) => {
  assert.ok(theme[name] !== undefined, `missing ${name}`);
  return theme[name];
};

test('contrastRatio matches known WCAG values', () => {
  assert.equal(contrastRatio('#ffffff', '#000000'), 21);
  assert.equal(contrastRatio('#ffffff', '#f59e0b').toFixed(2), '2.15');
});

test('colours match the spec table', () => {
  const expected = {
    '--color-ink': '#171b4a',
    '--color-text': '#39393a',
    '--color-text-muted': '#6c6558',
    '--color-surface-page': '#fcfaf5',
    '--color-surface-card': '#ffffff',
    '--color-surface-sunken': '#f5f2ea',
    '--color-border': 'rgba(108, 101, 88, 0.16)',
    '--color-border-strong': 'rgba(108, 101, 88, 0.28)',
    '--color-primary': '#2f4f43',
    '--color-primary-hover': '#243d34',
    '--color-primary-soft': '#eaf3ee',
    '--color-highlight': '#ffd08e',
    '--color-highlight-soft': '#fff4e1',
    '--color-highlight-ink': '#78350f',
    '--color-focus': '#b45309',
    '--color-link': '#5b3df5',
    '--color-danger': '#991b1b',
    '--color-danger-soft': '#fff5f5',
    '--color-lesson-video': '#e8edf3',
    '--color-lesson-quiz': '#e6f2ea',
    '--color-lesson-text': '#f3ebdd',
    '--color-lesson-exercise': '#fbe7d2',
    '--color-lesson-resources': '#eeeaf6',
  };
  for (const [name, value] of Object.entries(expected)) assert.equal(v(name), value, name);
});

test('gradient, scales, shadows, layers and motion are defined', () => {
  assert.match(v('--gradient-hero'), /#16241f.*#29463c.*#80592f/);
  const expected = {
    '--text-caption': '12px',
    '--text-meta': '13px',
    '--text-body': '14px',
    '--text-lead': '16px',
    '--text-title-sm': '18px',
    '--text-title': '22px',
    '--text-title-lg': '28px',
    '--text-display': '42px',
    '--radius-control': '6px',
    '--radius-card': '8px',
    '--radius-panel': '12px',
    '--radius-modal': '24px',
    '--radius-pill': '999px',
    '--shadow-card': '0 1px 2px rgba(106, 79, 48, 0.06), 0 8px 24px rgba(106, 79, 48, 0.08)',
    '--shadow-raised': '0 14px 36px rgba(106, 79, 48, 0.12)',
    '--shadow-modal': '0 24px 64px rgba(23, 27, 74, 0.18)',
    '--z-sticky': '10',
    '--z-dropdown': '20',
    '--z-overlay': '40',
    '--z-modal': '50',
    '--z-toast': '60',
    '--duration-fast': '160ms',
    '--ease-standard': 'ease',
  };
  for (const [name, value] of Object.entries(expected)) assert.equal(v(name), value, name);
});

test('theme is emitted statically', () => {
  assert.match(css, /@theme\s+static\s*\{/);
});

test('text pairs reach 4.5:1', () => {
  const pairs = [
    ['#ffffff', v('--color-primary')],
    ['#ffffff', v('--color-primary-hover')],
    [v('--color-highlight-ink'), v('--color-highlight')],
    [v('--color-highlight-ink'), v('--color-highlight-soft')],
    [v('--color-danger'), v('--color-danger-soft')],
  ];
  for (const fg of ['--color-ink', '--color-text', '--color-text-muted', '--color-link']) {
    for (const bg of ['--color-surface-card', '--color-surface-page']) pairs.push([v(fg), v(bg)]);
  }
  for (const [fg, bg] of pairs) {
    assert.ok(contrastRatio(fg, bg) >= 4.5, `${fg} on ${bg} = ${contrastRatio(fg, bg).toFixed(2)}`);
  }
});

test('focus ring reaches 3:1 on every surface', () => {
  for (const bg of ['--color-surface-card', '--color-surface-page', '--color-surface-sunken']) {
    const ratio = contrastRatio(v('--color-focus'), v(bg));
    assert.ok(ratio >= 3, `focus on ${bg} = ${ratio.toFixed(2)}`);
  }
});

test('fonts', () => {
  assert.ok(v('--font-display').startsWith("'Bricolage Grotesque'"));
  assert.ok(v('--font-body').startsWith("'Instrument Sans'"));
  assert.ok(v('--font-mono').startsWith("'JetBrains Mono'"));
});
