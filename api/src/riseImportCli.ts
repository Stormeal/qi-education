import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { runRiseImportCommand } from './riseImportCommand.js';

// Reading through a muted output keeps the typed password off the screen.
const askPassword = () => new Promise<string>((resolve) => {
  process.stdout.write('Teacher password: ');
  const prompt = createInterface({ input: process.stdin, output: new Writable({ write: (_chunk, _encoding, done) => done() }), terminal: true });
  prompt.question('', (answer) => { prompt.close(); process.stdout.write('\n'); resolve(answer); });
});

process.exitCode = await runRiseImportCommand(process.argv.slice(2), { env: process.env, out: console.log, askPassword });
