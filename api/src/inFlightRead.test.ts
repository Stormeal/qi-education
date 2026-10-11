import { describe, expect, it } from 'vitest';
import { InFlightRead } from './inFlightRead.js';

function gate<T>() {
  let open!: (value: T) => void;
  return { promise: new Promise<T>(resolve => { open = resolve; }), open };
}

describe('InFlightRead.runFresh (DEF-027 with burst sharing)', () => {
  it('starts at once when nothing is in flight', async () => {
    const read = new InFlightRead<number>();
    expect(await read.runFresh(async () => 1)).toBe(1);
  });

  it('never returns a read that started before the caller arrived, and shares the next read', async () => {
    const read = new InFlightRead<string>();
    const first = gate<string>(); const second = gate<string>();
    const loads: string[] = [];
    const early = read.run(() => { loads.push('first'); return first.promise; });
    // Three callers arrive while the first read is in flight.
    const late = [1, 2, 3].map(() => read.runFresh(() => { loads.push('second'); return second.promise; }));
    expect(loads).toEqual(['first']);
    first.open('before the change');
    await early;
    await Promise.resolve(); await Promise.resolve();
    expect(loads).toEqual(['first', 'second']);
    second.open('after the change');
    expect(await Promise.all(late)).toEqual(['after the change', 'after the change', 'after the change']);
    expect(await early).toBe('before the change');
  });

  it('a caller arriving during the shared second read gets a third one', async () => {
    const read = new InFlightRead<number>();
    const gates = [gate<number>(), gate<number>(), gate<number>()];
    let started = 0;
    const load = () => gates[started++].promise;
    const a = read.run(load);
    const b = read.runFresh(load);
    gates[0].open(1); await a; await Promise.resolve(); await Promise.resolve();
    const c = read.runFresh(load);
    gates[1].open(2); expect(await b).toBe(2);
    await Promise.resolve(); await Promise.resolve();
    gates[2].open(3); expect(await c).toBe(3);
    expect(started).toBe(3);
  });

  it('still runs the next read when the one in flight fails', async () => {
    const read = new InFlightRead<number>();
    const failing = read.run(() => Promise.reject(new Error('quota')));
    const next = read.runFresh(async () => 7);
    await expect(failing).rejects.toThrow('quota');
    expect(await next).toBe(7);
  });
});
