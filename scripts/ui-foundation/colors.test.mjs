import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorLiterals, compareToBaseline } from './colors.mjs';

test('colorLiterals lower-cases hex and strips whitespace from functions', () => {
  assert.deepEqual(
    colorLiterals('a{color:#FFF;background:rgba(0, 0, 0, .1)} b{color:var(--color-ink)}'),
    ['#fff', 'rgba(0,0,0,.1)'],
  );
});

test('colorLiterals finds every hex length and function form', () => {
  assert.deepEqual(
    colorLiterals('#abcd #AABBCCDD hsl(10, 20%, 30%) hsla(1,2%,3%,.5) rgb(1 2 3)'),
    ['#abcd', '#aabbccdd', 'hsl(10,20%,30%)', 'hsla(1,2%,3%,.5)', 'rgb(123)'],
  );
});

test('compareToBaseline flags counts above the baseline', () => {
  assert.deepEqual(
    compareToBaseline({ 'x.scss': { '#fff': 2 } }, { 'x.scss': { '#fff': 1 } }),
    [{ file: 'x.scss', color: '#fff', count: 2, allowed: 1 }],
  );
});

test('a file or colour missing from the baseline allows 0', () => {
  assert.deepEqual(
    compareToBaseline({ 'new.scss': { '#fff': 1 } }, {}),
    [{ file: 'new.scss', color: '#fff', count: 1, allowed: 0 }],
  );
  assert.deepEqual(
    compareToBaseline({ 'x.scss': { '#000': 1 } }, { 'x.scss': { '#fff': 1 } }),
    [{ file: 'x.scss', color: '#000', count: 1, allowed: 0 }],
  );
});

test('a lower or equal count returns no findings', () => {
  assert.deepEqual(compareToBaseline({ 'x.scss': { '#fff': 1 } }, { 'x.scss': { '#fff': 3 } }), []);
  assert.deepEqual(compareToBaseline({ 'x.scss': { '#fff': 3 } }, { 'x.scss': { '#fff': 3 } }), []);
});
