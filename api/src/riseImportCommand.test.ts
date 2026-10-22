import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runRiseImportCommand } from './riseImportCommand.js';
import { RiseImportError } from './riseImportRun.js';

const folders: string[] = [];
afterEach(async () => { await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))); });

async function riseExport(items: Record<string, unknown>[]) {
  const folder = await mkdtemp(join(tmpdir(), 'rise-cli-'));
  folders.push(folder);
  const course = { title: 'Kursus', description: 'Om kurset', authors: [{ authorName: 'Info TestHuset' }], lessons: [{ id: 'L1', title: 'Intro', items }] };
  await mkdir(join(folder, 'scormcontent', 'assets'), { recursive: true });
  await writeFile(join(folder, 'scormcontent', 'runtime-data.js'), `__jsonp("runtime-data.js","${Buffer.from(JSON.stringify({ course })).toString('base64')}");`);
  return folder;
}
const text = { id: 't1', type: 'text', variant: 'paragraph', items: [{ id: 'i', paragraph: '<p>Hej</p>' }] };
const missingVideo = { id: 'v1', type: 'multimedia', variant: 'video', items: [{ id: 'i', media: { video: { key: 'gone.mp4', duration: 60 } } }] };

function io(env: Record<string, string> = {}, run = vi.fn(async () => ({ courseId: 'course-1', videosUploaded: 2, attachmentsUploaded: 1 }))) {
  const lines: string[] = [];
  return { lines, run, askPassword: vi.fn(async () => 'typed'), out: (line: string) => lines.push(line), env };
}

describe('US-T015 runRiseImportCommand', () => {
  it('US-T015-AC01 dry run prints the plan and never sends anything', async () => {
    const folder = await riseExport([text]);
    const command = io();

    expect(await runRiseImportCommand([folder, '--dry-run'], command)).toBe(0);
    expect(command.lines.join('\n')).toMatch(/Intro: 1 lesson \(0 video, 0 quiz, 0 resources, 1 text\)/);
    expect(command.lines.join('\n')).toMatch(/Dry run: nothing was sent/);
    expect(command.run).not.toHaveBeenCalled();
    expect(command.askPassword).not.toHaveBeenCalled();
  });

  it('stops before asking for a password when the plan has problems', async () => {
    const command = io();

    expect(await runRiseImportCommand([await riseExport([missingVideo]), '--email', 'teacher@example.test'], command)).toBe(1);
    expect(command.lines).toContain('Problem: Missing file: gone.mp4');
    expect(command.askPassword).not.toHaveBeenCalled();
    expect(command.run).not.toHaveBeenCalled();
  });

  it('imports with the password from QI_IMPORT_PASSWORD and the default hosted API', async () => {
    const command = io({ QI_IMPORT_PASSWORD: 'from-env' });

    expect(await runRiseImportCommand([await riseExport([text]), '--email', 'teacher@example.test'], command)).toBe(0);
    expect(command.run).toHaveBeenCalledWith(expect.objectContaining({ sections: expect.any(Array) }), expect.objectContaining({
      apiUrl: 'https://qi-education.vercel.app/api', email: 'teacher@example.test', password: 'from-env', courseId: undefined }));
    expect(command.askPassword).not.toHaveBeenCalled();
    expect(command.lines).toContain('Imported course course-1: 2 videos and 1 attachment uploaded.');
  });

  it('asks for the password and passes --api and --course through', async () => {
    const command = io();

    await runRiseImportCommand([await riseExport([text]), '--email', 't@example.test', '--api', 'http://localhost:3001', '--course', 'c-9'], command);
    expect(command.askPassword).toHaveBeenCalledOnce();
    expect(command.run).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ apiUrl: 'http://localhost:3001', password: 'typed', courseId: 'c-9' }));
  });

  it('prints the resume line when the course already exists', async () => {
    const command = io({ QI_IMPORT_PASSWORD: 'x' }, vi.fn(async () => { throw new RiseImportError('Upload video 01.02: network dropped', 'course-1'); }));

    expect(await runRiseImportCommand([await riseExport([text]), '--email', 't@example.test'], command)).toBe(1);
    expect(command.lines).toEqual(expect.arrayContaining(['Import stopped: Upload video 01.02: network dropped', 'Resume with: --course course-1']));
  });

  it('requires --email for a real run and refuses a folder that is not a Rise export', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'rise-cli-'));
    folders.push(empty);
    const command = io();

    expect(await runRiseImportCommand([await riseExport([text])], command)).toBe(1);
    expect(command.lines).toContain('Add --email <teacher email>, or use --dry-run.');
    expect(await runRiseImportCommand([empty, '--dry-run'], command)).toBe(1);
    expect(command.lines).toContain('Only Articulate Rise exports can be imported.');
    expect(command.run).not.toHaveBeenCalled();
  });
});
