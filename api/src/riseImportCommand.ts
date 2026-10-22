import { parseArgs } from 'node:util';
import { NotRiseExportError, planRiseImport, summarizePlan } from './riseImport.js';
import { RiseImportError, runRiseImport } from './riseImportRun.js';

const HOSTED_API = 'https://qi-education.vercel.app/api';
const USAGE = 'Usage: npm --prefix api run import:rise -- <export-folder> [--dry-run] [--email <teacher email>] [--api <url>] [--course <id>]';
const count = (value: number, noun: string) => `${value} ${noun}${value === 1 ? '' : 's'}`;

export async function runRiseImportCommand(argv: string[], io: {
  env: NodeJS.ProcessEnv; out: (line: string) => void; askPassword: () => Promise<string>; run?: typeof runRiseImport;
}): Promise<number> {
  let args;
  try {
    args = parseArgs({ args: argv, allowPositionals: true, options: {
      'dry-run': { type: 'boolean' }, email: { type: 'string' }, api: { type: 'string' }, course: { type: 'string' },
    } });
  } catch (error) {
    io.out(error instanceof Error ? error.message : String(error));
    io.out(USAGE);
    return 1;
  }
  const [folder] = args.positionals;
  if (!folder || args.positionals.length > 1) { io.out(USAGE); return 1; }
  const dryRun = args.values['dry-run'] === true;
  if (!dryRun && !args.values.email) { io.out('Add --email <teacher email>, or use --dry-run.'); return 1; }

  let plan;
  try {
    plan = await planRiseImport(folder);
  } catch (error) {
    if (error instanceof NotRiseExportError) { io.out(error.message); return 1; }
    throw error;
  }
  summarizePlan(plan).forEach((line) => io.out(line));
  if (plan.problems.length) { io.out('Fix the problems above before importing; nothing was sent.'); return 1; }
  if (dryRun) { io.out('Dry run: nothing was sent.'); return 0; }

  const password = io.env.QI_IMPORT_PASSWORD || await io.askPassword();
  try {
    const result = await (io.run ?? runRiseImport)(plan, {
      apiUrl: args.values.api ?? HOSTED_API, email: args.values.email!, password, courseId: args.values.course, log: io.out,
    });
    io.out(`Imported course ${result.courseId}: ${count(result.videosUploaded, 'video')} and ${count(result.attachmentsUploaded, 'attachment')} uploaded.`);
    return 0;
  } catch (error) {
    if (!(error instanceof RiseImportError)) throw error;
    io.out(`Import stopped: ${error.message}`);
    if (error.courseId) io.out(`Resume with: --course ${error.courseId}`);
    return 1;
  }
}
