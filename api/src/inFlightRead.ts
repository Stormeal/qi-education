/** Share concurrent fetches only; successful and failed results are never cached. */
export class InFlightRead<T> {
  private pending?: Promise<T>;
  private queued?: Promise<T>;
  invalidate() { this.pending = undefined; }
  run(load: () => Promise<T>): Promise<T> {
    if (!this.pending) {
      const current = load().finally(() => { if (this.pending === current) this.pending = undefined; });
      this.pending = current;
    }
    return this.pending;
  }
  /**
   * A read that starts after this call, so it cannot return a snapshot taken before the
   * caller arrived (DEF-027). Callers that arrive while one read is in flight share the
   * next one, so a burst costs two reads instead of one per caller.
   */
  runFresh(load: () => Promise<T>): Promise<T> {
    if (!this.pending) return this.run(load);
    if (!this.queued) {
      const next: Promise<T> = this.pending.then(() => undefined, () => undefined).then(() => {
        if (this.queued === next) this.queued = undefined;
        // The earlier read has settled; anything still pending was started before this caller arrived.
        this.pending = undefined;
        return this.run(load);
      });
      this.queued = next;
    }
    return this.queued;
  }
}
