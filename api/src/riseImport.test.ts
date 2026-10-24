import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { planRiseImport, summarizePlan } from './riseImport.js';

const folders: string[] = [];
afterEach(async () => { await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))); });

type Block = Record<string, unknown>;
const divider = (id: string): Block => ({ id, type: 'divider', variant: 'numbered divider', items: [{ id: `${id}-i` }] });
const heading = (id: string, html: string): Block => ({ id, type: 'text', variant: 'heading', items: [{ id: `${id}-i`, heading: html }] });
const paragraph = (id: string, html: string): Block => ({ id, type: 'text', variant: 'paragraph', items: [{ id: `${id}-i`, paragraph: html }] });
const video = (id: string, file: string, duration = 60): Block => ({ id, type: 'multimedia', variant: 'video',
  items: [{ id: `${id}-i`, media: { video: { key: encodeURIComponent(file), duration, originalUrl: file } } }] });
const attachment = (id: string, file: string): Block => ({ id, type: 'multimedia', variant: 'attachment',
  items: [{ id: `${id}-i`, media: { attachment: { key: encodeURIComponent(file), mimeType: 'application/pdf', originalUrl: `${file.replace('.pdf', '')} v.1.pdf` } } }] });
const answer = (id: string, title: string, correct: boolean, feedback = '') => ({ id, title, correct, feedback });
const check = (id: string, type: string, title: string, answers: ReturnType<typeof answer>[]): Block =>
  ({ id, type: 'knowledgeCheck', variant: type === 'MULTIPLE_CHOICE' ? 'multiple choice' : 'multiple response', items: [{ id: `${id}-q`, type, title, answers }] });
const choices = (id: string) => [answer(`${id}-a`, 'a) Right', true, '<p>Korrekt</p>'), answer(`${id}-b`, 'b) Wrong', false, '<p>Ikke korrekt</p>')];

async function riseExport(lessons: { id: string; title: string; items: Block[] }[], files: Record<string, number> = {}) {
  const folder = await mkdtemp(join(tmpdir(), 'rise-'));
  folders.push(folder);
  const course = { title: 'ISTQB Foundation repetition ', description: '<p><strong>Velkommen</strong> til&nbsp;kurset</p>',
    authors: [{ authorName: 'Info TestHuset' }], coverImage: { media: { image: { crushedKey: 'cover.jpg' } } }, lessons };
  const encoded = Buffer.from(JSON.stringify({ course }), 'utf8').toString('base64');
  await mkdir(join(folder, 'scormcontent', 'assets'), { recursive: true });
  await writeFile(join(folder, 'scormcontent', 'runtime-data.js'), `__jsonp("runtime-data.js","${encoded}");`);
  for (const [name, size] of Object.entries({ 'cover.jpg': 10, ...files })) {
    await writeFile(join(folder, 'scormcontent', 'assets', name), Buffer.alloc(size));
  }
  return folder;
}

describe('US-T015 planRiseImport', () => {
  it('US-T015-AC01 maps lessons, topics, videos, quizzes and PDFs in Rise order', async () => {
    const folder = await riseExport([{ id: 'L1', title: '01) Grundlæggende', items: [
      divider('d1'), heading('h1', '<p>01.01 Hvad er test?</p>'), video('v1', 'Hvad er test.mp4', 83), attachment('p1', 'Hvad er test.pdf'),
      divider('d2'), heading('h2', '01.02 Testformål'), video('v2', 'Testformål.mp4'),
      check('k1', 'MULTIPLE_CHOICE', 'One?', choices('k1')), check('k2', 'MULTIPLE_RESPONSE', 'Two?', choices('k2')),
      divider('d3'), heading('h3', '01.03'), video('v3', 'Tre.mp4'), video('v4', 'Fire.mp4'),
      paragraph('t1', '<p>Tilgå quizzen her: <a href="https://glossary.istqb.org" target="_blank">quiz</a></p>'),
      { id: 'c1', type: 'divider', variant: 'continue', items: [] },
    ] }], { 'Hvad er test.mp4': 5, 'Testformål.mp4': 5, 'Tre.mp4': 5, 'Fire.mp4': 5, 'Hvad er test.pdf': 7 });

    const plan = await planRiseImport(folder);

    expect(plan.course).toEqual({ title: 'ISTQB Foundation repetition', description: 'Velkommen til kurset', teacher: 'Info TestHuset', level: 'Foundation' });
    expect(plan.sections.map((section) => [section.id, section.title])).toEqual([['L1', '01) Grundlæggende']]);
    expect(plan.sections[0].components.map((component) => [component.id, component.type, component.title])).toEqual([
      ['v1', 'video', '01.01 Hvad er test?'], ['p1', 'resources', 'Hvad er test v.1'], ['v2', 'video', '01.02 Testformål'],
      ['k1', 'quiz', 'Videnstjek: 01.02 Testformål'], ['v3', 'video', '01.03'], ['v4', 'video', '01.03 (del 2)'], ['t1', 'text', '01.03']]);
    expect(plan.sections[0].components[0].durationMinutes).toBe(2);
    expect(plan.sections[0].components[3]).toMatchObject({ quiz: { passPoints: 2, questions: [{ id: 'k1-q' }, { id: 'k2-q' }] } });
    expect(plan.videos.map((file) => [file.sectionId, file.componentId, file.fileName, file.contentType, file.sizeBytes])).toEqual([
      ['L1', 'v1', 'Hvad er test.mp4', 'video/mp4', 5], ['L1', 'v2', 'Testformål.mp4', 'video/mp4', 5],
      ['L1', 'v3', 'Tre.mp4', 'video/mp4', 5], ['L1', 'v4', 'Fire.mp4', 'video/mp4', 5]]);
    expect(plan.attachments).toEqual([{ sectionId: 'L1', componentId: 'p1', path: join(folder, 'scormcontent', 'assets', 'Hvad er test.pdf'),
      fileName: 'Hvad er test v.1.pdf', contentType: 'application/pdf', sizeBytes: 7 }]);
    expect(plan.thumbnail).toMatchObject({ fileName: 'cover.jpg', contentType: 'image/jpeg', sizeBytes: 10 });
    expect(plan.problems).toEqual([]);
    expect(summarizePlan(plan).join('\n')).toMatch(/01\) Grundlæggende: 7 lessons \(4 video, 1 quiz, 1 resources, 1 text\)/);
  });

  it('uses a short heading outside a topic title as the next lesson title, not as a lesson of its own', async () => {
    const prose = `<p>Inden du går i gang med introduktionsvideoen, ${'anbefaler vi at du læser syllabus. '.repeat(6)}</p>`;
    const folder = await riseExport([{ id: 'L1', title: 'Introduktion', items: [
      heading('h0', '<p>Introduktion til kurset</p>'), heading('h1', prose), video('v0', 'Intro.mp4'),
      heading('h2', 'Syllabus'), attachment('p0', 'Syllabus.pdf'),
      divider('d1'), heading('h3', '04.05 Grænseværdianalyse'), video('v1', 'a.mp4'),
      heading('h4', '04.06 Løsning | Grænseværdianalyse'), video('v2', 'b.mp4'),
    ] }], { 'Intro.mp4': 1, 'Syllabus.pdf': 1, 'a.mp4': 1, 'b.mp4': 1 });

    const [section] = (await planRiseImport(folder)).sections;

    expect(section.components.map((component) => [component.id, component.type, component.title])).toEqual([
      ['h1', 'text', 'Introduktion til kurset'], ['v0', 'video', 'Introduktion'], ['p0', 'resources', 'Syllabus v.1'],
      ['v1', 'video', '04.05 Grænseværdianalyse'], ['v2', 'video', '04.06 Løsning | Grænseværdianalyse']]);
    expect(section.components[0].content).toMatch(/^<p>Inden du går i gang/);
  });

  it('cleans Rise HTML: plain quiz text, safe tags only in text lessons', async () => {
    const folder = await riseExport([{ id: 'L1', title: 'Intro', items: [
      paragraph('h0', '<div data-editor-id="x"><p><span style="font-size: 1.6rem">Læs <strong>syllabus</strong></span></p><p></p><script>x()</script><a href="javascript:x()">bad</a></div>'),
      check('k1', 'MULTIPLE_CHOICE', '<div data-editor-id="x"><p><span style="font-size: 2.4rem"><strong>Hvilket?</strong></span></p><p></p><p>Vælg ÉN&nbsp;mulighed &amp; svar</p></div>',
        [answer('a', '<p>a)&nbsp;Rigtig</p>', true, '<p>Korrekt, &quot;rigtig&quot;</p>'), answer('b', '<p>b) Forkert</p>', false)]),
    ] }]);

    const [text, quiz] = (await planRiseImport(folder)).sections[0].components;

    expect(text).toMatchObject({ type: 'text', title: 'Intro', content: '<p>Læs <strong>syllabus</strong></p>x()bad' });
    expect(quiz.type === 'quiz' && quiz.quiz.questions[0]).toMatchObject({ question: 'Hvilket? Vælg ÉN mulighed & svar', explanation: 'Korrekt, "rigtig"',
      answers: [{ id: 'a', text: 'a) Rigtig', description: 'Korrekt, "rigtig"', isCorrect: true }, { id: 'b', text: 'b) Forkert', description: '', isCorrect: false }] });
  });

  it('keeps every correct answer of a multiple-response question and explains with the first correct feedback', async () => {
    const folder = await riseExport([{ id: 'L1', title: 'L', items: [check('k1', 'MULTIPLE_RESPONSE', 'Which two?', [
      answer('a', 'A', false, 'not A'), answer('b', 'B', true, 'B is right'), answer('c', 'C', true, 'C is right')])] }]);

    const [quiz] = (await planRiseImport(folder)).sections[0].components;

    expect(quiz.type === 'quiz' && quiz.quiz.questions[0].answers.map((item) => item.isCorrect)).toEqual([false, true, true]);
    expect(quiz.type === 'quiz' && quiz.quiz.questions[0].explanation).toBe('B is right');
  });

  it('skips a PDF over 4 MB but still creates its resources lesson', async () => {
    const folder = await riseExport([{ id: 'L1', title: 'L', items: [attachment('p1', 'Kapitel 5.pdf')] }], { 'Kapitel 5.pdf': 4 * 1024 * 1024 + 1 });

    const plan = await planRiseImport(folder);

    expect(plan.sections[0].components.map((component) => component.type)).toEqual(['resources']);
    expect(plan.attachments).toEqual([]);
    expect(plan.skipped).toContain('Kapitel 5 v.1.pdf: 4.0 MB is over the 4 MB attachment limit');
    expect(plan.problems).toEqual([]);
  });

  it('DEF-059 refuses media paths that leave the export folder', async () => {
    const folder = await riseExport([{ id: 'L1', title: 'Lesson', items: [
      attachment('p1', '../../private-marker.pdf'), video('v1', '../../private-marker.mp4'), attachment('p2', join(tmpdir(), 'absolute.pdf')),
    ] }]);
    await writeFile(join(folder, 'private-marker.pdf'), 'X8_OUTSIDE_EXPORT_CANARY');
    await writeFile(join(folder, 'private-marker.mp4'), 'X8_OUTSIDE_EXPORT_CANARY');
    await writeFile(join(tmpdir(), 'absolute.pdf'), 'X8_OUTSIDE_EXPORT_CANARY');

    const plan = await planRiseImport(folder);

    expect(plan.attachments).toEqual([]);
    expect(plan.videos).toEqual([]);
    expect(plan.problems).toEqual(expect.arrayContaining([
      'File outside the export folder: ../../private-marker.pdf',
      'File outside the export folder: ../../private-marker.mp4',
      `File outside the export folder: ${join(tmpdir(), 'absolute.pdf')}`,
    ]));
  });

  it('reports a missing video file as a problem', async () => {
    const folder = await riseExport([{ id: 'L1', title: 'L', items: [video('v1', 'Gone.mp4')] }]);

    expect((await planRiseImport(folder)).problems).toEqual(['Missing file: Gone.mp4']);
  });

  it('US-T015-AC03 refuses a folder without runtime-data.js', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'rise-'));
    folders.push(folder);

    await expect(planRiseImport(folder)).rejects.toThrow('Only Articulate Rise exports can be imported.');
  });
});
