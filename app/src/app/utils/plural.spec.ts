import { plural } from './plural';

describe('plural', () => {
  it('uses the singular only for exactly one', () => {
    expect([0, 1, 2].map((count) => plural(count, 'section'))).toEqual(['0 sections', '1 section', '2 sections']);
  });
});
