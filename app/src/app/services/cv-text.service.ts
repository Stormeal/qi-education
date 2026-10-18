import { Injectable } from '@angular/core';

export type CvReadResult = { ok: true; text: string } | { ok: false; reason: 'type' | 'size' | 'unreadable' | 'no-text' };
type CvFormat = 'pdf' | 'docx';

const MAX_BYTES = 10 * 1024 * 1024;
// Fewer characters than this means the file has no text layer, such as a scanned image.
const MIN_TEXT = 50;

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
    } catch {
      return { ok: false, reason: 'unreadable' };
    }
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

async function readDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  return (await mammoth.extractRawText({ arrayBuffer })).value;
}
