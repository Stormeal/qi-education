import { TestBed } from '@angular/core/testing';
import { CvTextService, CvTooLongError } from './cv-text.service';

describe('CvTextService (US-L023-AC06)', () => {
  let service: CvTextService;
  let calls: string[];
  const longText = 'ISTQB Certified Tester Foundation Level. Five years as a test analyst at Acme.';
  const file = (name: string, size = 10) => new File([new Uint8Array(size)], name);

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    service = TestBed.inject(CvTextService);
    calls = [];
    service.extractors = {
      pdf: async () => { calls.push('pdf'); return longText; },
      docx: async () => { calls.push('docx'); return longText; },
    };
  });

  it('refuses a file that is not PDF or Word .docx, including a dropped .doc', async () => {
    expect(await service.read(file('cv.doc'))).toEqual({ ok: false, reason: 'type' });
    expect(await service.read(file('cv.txt'))).toEqual({ ok: false, reason: 'type' });
    expect(calls).toEqual([]);
  });

  it('accepts the extension in any case', async () => {
    expect(await service.read(file('CV.PDF'))).toEqual({ ok: true, text: longText });
    expect(calls).toEqual(['pdf']);
  });

  it('refuses a file over 10 MB without reading it', async () => {
    expect(await service.read(file('cv.pdf', 10 * 1024 * 1024 + 1))).toEqual({ ok: false, reason: 'size' });
    expect(calls).toEqual([]);
  });

  it('reports a file the parser cannot open', async () => {
    service.extractors.pdf = async () => { throw new Error('PasswordException'); };
    expect(await service.read(file('cv.pdf'))).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('reports a file with almost no text, such as a scanned image', async () => {
    service.extractors.pdf = async () => ` ${'x'.repeat(49)} \n `;
    expect(await service.read(file('cv.pdf'))).toEqual({ ok: false, reason: 'no-text' });
  });

  it('X8 F8 refuses text far longer than a CV, from a small file that expands', async () => {
    service.extractors.docx = async () => 'x'.repeat(200_001);
    expect(await service.read(file('cv.docx', 5031))).toEqual({ ok: false, reason: 'too-long' });
    service.extractors.docx = async () => 'x'.repeat(200_000);
    expect((await service.read(file('cv.docx'))).ok).toBe(true);
  });

  it('X8 F8 refuses a PDF the reader stops for having too many pages', async () => {
    service.extractors.pdf = async () => { throw new CvTooLongError(); };
    expect(await service.read(file('cv.pdf'))).toEqual({ ok: false, reason: 'too-long' });
  });

  it('reads a Word .docx with the docx extractor', async () => {
    expect(await service.read(file('my cv.docx'))).toEqual({ ok: true, text: longText });
    expect(calls).toEqual(['docx']);
  });
});
