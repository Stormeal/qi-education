import { normalizeBulletList } from './bullet-list';

describe('bullet list fields (US-T010-AC03)', () => {
  it('adds the bullet as soon as a line exists, before any text is typed on it', () => {
    expect(normalizeBulletList('a')).toBe('• a');
    expect(normalizeBulletList('• a\n')).toBe('• a\n• ');
    expect(normalizeBulletList('• a\n\n• b')).toBe('• a\n• \n• b');
  });

  it('lets a line be backspaced away and the field be emptied', () => {
    expect(normalizeBulletList('• a\n•')).toBe('• a');
    expect(normalizeBulletList('•')).toBe('');
    expect(normalizeBulletList('')).toBe('');
  });

  it('is stable on its own output and accepts pasted lists', () => {
    const once = normalizeBulletList('- first\n* second\nthird ');
    expect(once).toBe('• first\n• second\n• third ');
    expect(normalizeBulletList(once)).toBe(once);
  });
});
