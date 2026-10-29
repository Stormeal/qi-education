import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { TurnstileService, type TurnstileApi } from '../../services/turnstile.service';
import { Button } from '../button/button';

@Component({
  selector: 'app-turnstile-challenge', imports: [Button], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #host aria-label="Human verification"></div>
    @if (error()) { <p class="challenge-error" role="alert">Human check unavailable. Retry, or check your connection.</p>
      <button appButton="ghost" size="sm" type="button" (click)="retry()">Retry human check</button> }`,
  styles: `:host { display: block; min-width: 0; } .challenge-error { color: var(--color-danger); font-size: var(--text-meta); margin: 8px 0; }`,
})
export class TurnstileChallenge {
  readonly siteKey = input<string | null>(null);
  readonly resetVersion = input(0);
  readonly tokenChanged = output<string>();
  protected readonly error = signal(false);
  private readonly host = viewChild<ElementRef<HTMLElement>>('host');
  private readonly loader = inject(TurnstileService);
  private readonly retryVersion = signal(0);
  private api?: TurnstileApi;
  private widget?: string;

  constructor() {
    effect(onCleanup => {
      const siteKey = this.siteKey(), host = this.host(); this.retryVersion();
      if (!siteKey || !host) return;
      let active = true;
      this.error.set(false);
      const clear = () => { if (active) this.tokenChanged.emit(''); };
      void this.loader.load().then(api => {
        if (!active) return;
        this.api = api;
        this.widget = api.render(host.nativeElement, { sitekey: siteKey, theme: 'light', size: 'flexible',
          callback: token => { if (active) { this.error.set(false); this.tokenChanged.emit(token); } },
          'expired-callback': clear, 'timeout-callback': clear,
          'error-callback': () => { if (active) { this.error.set(true); clear(); } },
        });
      }).catch(() => { if (active) { this.error.set(true); clear(); } });
      onCleanup(() => { active = false; if (this.widget !== undefined) this.api?.remove(this.widget); this.widget = undefined; });
    });
    effect(() => { this.resetVersion(); if (this.widget !== undefined) { this.api?.reset(this.widget); this.tokenChanged.emit(''); } });
  }
  protected retry(): void {
    this.error.set(false); this.tokenChanged.emit('');
    if (this.widget !== undefined) this.api?.reset(this.widget); else this.retryVersion.update(v => v + 1);
  }
}
