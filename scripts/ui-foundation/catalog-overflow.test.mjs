import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stylesheet = readFileSync(new URL('../../app/src/app/ui/course-builder/course-builder.scss', import.meta.url), 'utf8');
const template = readFileSync(new URL('../../app/src/app/ui/course-builder/course-builder.html', import.meta.url), 'utf8');

function declarations(selector) {
  const rule = [...stylesheet.matchAll(/([^{}]+)\{([^{}]+)\}/g)]
    .find(([, selectors]) => selectors.split(',').some((candidate) => candidate.trim() === selector))?.[2] ?? '';
  return Object.fromEntries(rule.split(';').map((declaration) => declaration.trim()).filter(Boolean).map((declaration) => {
    const separator = declaration.indexOf(':');
    return [declaration.slice(0, separator).trim(), declaration.slice(separator + 1).trim()];
  }));
}

test('component editor form controls fit inside the modal grid columns', () => {
  assert.match(template, /class="builder-modal-grid builder-modal-grid-compact"[\s\S]*?<label class="builder-field builder-field-title">[\s\S]*?<input[\s\S]*?<\/label>/,
    'component editor modal must place its inputs inside grid field labels');

  const grid = declarations('.builder-modal-grid');
  const compactGrid = declarations('.builder-modal-grid-compact');
  const field = declarations('.builder-field');
  const controls = declarations('input');

  assert.equal(grid.display, 'grid', 'component editor fields must use the modal grid');
  assert.match(compactGrid['grid-template-columns'] ?? '', /minmax\(0,/,
    'modal grid columns must be allowed to shrink below their content width');
  assert.equal(field['min-width'], '0',
    'component editor fields must shrink to their grid column so their 100%-wide controls stay inside the modal');
  assert.equal(controls.width, '100%', 'modal controls must fill their field instead of using a fixed width');
});
