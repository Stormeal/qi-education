import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Execute the workflow's actual inline program with synthetic fetch responses.
// All requests and retry timers are replaced; no hosted service is contacted.
const workflow = readFileSync(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8');
const program = workflow.match(/node --input-type=module <<'NODE'\r?\n([\s\S]*?)\r?\n\s+NODE/);
if (!program) throw new Error('Pages hosted API config program was not found.');
const script = program[1].split(/\r?\n/).map(line => line.replace(/^          /, '')).join('\n');
function run(responses: Array<{ ok: boolean; status: number; body: unknown }>) {
  const prelude = `
    const fixtures = ${JSON.stringify(responses)};
    let requests = 0;
    globalThis.fetch = async () => {
      const fixture = fixtures[Math.min(requests++, fixtures.length - 1)];
      return { ok: fixture.ok, status: fixture.status, json: async () => fixture.body };
    };
    globalThis.setTimeout = (callback) => { callback(); return 0; };
  `;
  return spawnSync(process.execPath, ['--input-type=module', '-e', prelude + script], { encoding: 'utf8', timeout: 10000 });
}
const healthy = (storage: string, configured = true) => ({ ok: true, status: 200, body: { auth: { configured, storage } } });

describe('Pages hosted auth storage gate', () => {
  it('DEF-PAGES-MONGO-AC01 accepts configured MongoDB auth', () => {
    const result = run([healthy('mongodb')]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain('failed');
  });
  it.each([
    healthy('memory'), healthy('unavailable'), healthy('unknown'), healthy('mongodb', false), healthy('google-sheets'),
    { ok: true, status: 200, body: {} }, { ok: true, status: 200, body: { auth: { storage: 'mongodb' } } },
  ])('DEF-PAGES-MONGO-AC02 refuses unsupported or unconfigured auth: %j', response => {
    const result = run([response]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Hosted API config check attempt 12 failed:');
    expect(result.stderr).toContain('Hosted API must use configured');
  });
  it('DEF-PAGES-MONGO-AC03 refuses HTTP failures and retries a transient failure', () => {
    const failed = { ...healthy('mongodb'), ok: false, status: 503 };
    const denied = run([failed]);
    expect(denied.status).toBe(1);
    expect(denied.stderr).toContain('Hosted API config returned HTTP 503');
    const recovered = run([failed, healthy('mongodb')]);
    expect(recovered.status, recovered.stderr).toBe(0);
    expect(recovered.stdout).toContain('attempt 1 failed: Hosted API config returned HTTP 503');
    expect(recovered.stdout).not.toContain('attempt 2 failed');
  });
});
