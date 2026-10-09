import { attachmentProblem } from './attachment-rules';

const file = (name: string, type: string, bytes = 10) => new File([new Uint8Array(bytes)], name, { type });

describe('attachment rules', () => {
  it('resources lessons accept PDF, Word, PowerPoint, ZIP and images', () => {
    for (const [name, type] of [['a.pdf', 'application/pdf'], ['a.docx', ''], ['a.doc', 'application/msword'],
      ['a.pptx', ''], ['a.zip', 'application/zip'], ['a.png', 'image/png']]) {
      expect(attachmentProblem('resources', file(name, type))).toBe('');
    }
  });

  it('refuses other types and anything over 4 MB, saying why', () => {
    expect(attachmentProblem('resources', file('tool.exe', 'application/x-msdownload'))).toContain('Resources supports');
    expect(attachmentProblem('text', file('a.zip', 'application/zip'))).toContain('Text documentation supports');
    expect(attachmentProblem('resources', file('big.pdf', 'application/pdf', 4 * 1024 * 1024 + 1))).toBe('Attachments must be 4 MB or smaller.');
  });
});
