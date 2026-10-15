import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findRemoved } from './removed-patterns.mjs';

const removed = [
  { id: 'app-button', kind: 'element', name: 'app-button' },
  { id: 'cp-btn', kind: 'class', name: 'cp-btn' },
];

const find = (path, text) => findRemoved([{ path, text }], removed);

test('finds the element in HTML with its line number', () => {
  assert.deepEqual(find('a.html', '<div>\n  <app-button variant="primary">Go</app-button>\n</div>'), [
    { path: 'a.html', line: 2, id: 'app-button' },
  ]);
});

test('finds the class token cp-btn in a class attribute, not cp-btn-primary alone', () => {
  assert.deepEqual(find('a.html', '<a class="cp-btn cp-btn-primary"></a>'), [
    { path: 'a.html', line: 1, id: 'cp-btn' },
  ]);
  assert.deepEqual(find('a.html', '<a class="cp-btn-primary"></a>'), []);
});

test('finds [class.cp-btn]= bindings', () => {
  assert.deepEqual(find('a.html', '<a\n [class.cp-btn]="on"></a>'), [{ path: 'a.html', line: 2, id: 'cp-btn' }]);
});

test('finds SCSS selectors', () => {
  assert.deepEqual(find('a.scss', 'a {}\n.cp-btn {\n}\n.cp-btn:hover { }'), [
    { path: 'a.scss', line: 2, id: 'cp-btn' },
    { path: 'a.scss', line: 4, id: 'cp-btn' },
  ]);
});

test('does not match longer names', () => {
  assert.deepEqual(find('a.html', '<app-buttons></app-buttons><a class="cp-btns"></a>'), []);
  assert.deepEqual(find('a.scss', '.cp-btns { }\n.cp-btn-primary { }'), []);
});

test('finds the element in a TS template and closing tags once per line', () => {
  assert.deepEqual(find('a.ts', "template: `<app-button>x</app-button>`"), [
    { path: 'a.ts', line: 1, id: 'app-button' },
  ]);
});
