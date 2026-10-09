/** Share concurrent fetches only; successful and failed results are never cached. */
export class InFlightRead<T> {
  private pending?: Promise<T>;
  invalidate() { this.pending = undefined; }
  run(load: () => Promise<T>): Promise<T> {
    if (!this.pending) {
      const current = load().finally(() => { if (this.pending === current) this.pending = undefined; });
      this.pending = current;
    }
    return this.pending;
  }
}
