import { renderLessonMarkdown } from './lesson-content';

describe('renderLessonMarkdown', () => {
  it('X10 starts lesson headings at h2, below the lesson title', () => {
    expect(renderLessonMarkdown(document, '# Hello\n\n## Part')).toBe('<h2>Hello</h2><h3>Part</h3>');
    expect(renderLessonMarkdown(document, '<h1 class="x">Hello</h1><p>Body</p><h3>Deep</h3>'))
      .toBe('<h2 class="x">Hello</h2><p>Body</p><h4>Deep</h4>');
  });
});
