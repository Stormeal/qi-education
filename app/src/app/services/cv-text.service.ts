import { Injectable } from '@angular/core';

export type CvReadResult = { ok: true; text: string } | { ok: false; reason: 'type' | 'size' | 'unreadable' | 'no-text' | 'too-long' };
type CvFormat = 'pdf' | 'docx';

const MAX_BYTES = 10 * 1024 * 1024;
// Fewer characters than this means the file has no text layer, such as a scanned image.
const MIN_TEXT = 50;
// X8 F8: a small file can expand to far more text than any CV; past these the file is refused rather than matched.
const MAX_TEXT = 200_000;
const MAX_PDF_PAGES = 20;

/** Thrown by an extractor that stops early because the document is far longer than a CV. */
export class CvTooLongError extends Error {}

/** Reads a CV's text in the browser. The file is never uploaded; the caller keeps the text only as long as it needs it. */
@Injectable({ providedIn: 'root' })
export class CvTextService {
  // Replaceable so tests never load or fake the parser libraries (CI does not apply vi.mock to them).
  extractors: Record<CvFormat, (data: ArrayBuffer) => Promise<string>> = { pdf: readPdf, docx: readDocx };

  async read(file: File): Promise<CvReadResult> {
    const format = /\.(pdf|docx)$/i.exec(file.name)?.[1].toLowerCase() as CvFormat | undefined;
    if (!format) return { ok: false, reason: 'type' };
    if (file.size > MAX_BYTES) return { ok: false, reason: 'size' };
    let text: string;
    try {
      text = await this.extractors[format](await file.arrayBuffer());
    } catch (error) {
      return { ok: false, reason: error instanceof CvTooLongError ? 'too-long' : 'unreadable' };
    }
    if (text.length > MAX_TEXT) return { ok: false, reason: 'too-long' };
    return text.replace(/\s/g, '').length < MIN_TEXT ? { ok: false, reason: 'no-text' } : { ok: true, text };
  }
}

async function readPdf(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // Copied to the app root by angular.json; resolved against the base href so it also works on GitHub Pages.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', document.baseURI).href;
  const task = pdfjs.getDocument({ data });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > MAX_PDF_PAGES) throw new CvTooLongError();
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const content = await (await pdf.getPage(number)).getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
    return pages.join('\n');
  } finally {
    await task.destroy();
  }
}

// shortcut: Mammoth cannot stop partway, so a DOCX that expands is bounded only after parsing (in the learner's own tab); add an unzipped-size check if this matters.
async function readDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  return (await mammoth.extractRawText({ arrayBuffer })).value;
}
