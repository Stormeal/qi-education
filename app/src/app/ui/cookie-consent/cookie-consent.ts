import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { ConsentService } from '../../services/consent.service';
import { Button } from '../button/button';

/** US-P021: banner on first visit and the preferences panel. Mounted once in the app shell.
 * Not a blocking dialog: the page stays usable and the notice sits at the bottom of the screen. */
@Component({
  selector: 'app-cookie-consent',
  imports: [Button],
  templateUrl: './cookie-consent.html',
  styleUrl: './cookie-consent.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CookieConsent {
  protected readonly consent = inject(ConsentService);
  protected readonly analytics = signal(false);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('preferencesHeading');

  constructor() {
    effect(() => {
      if (!this.consent.preferencesOpen()) return;
      this.analytics.set(this.consent.analytics());
      queueMicrotask(() => this.heading()?.nativeElement.focus());
    });
  }
  protected accept(): void { this.consent.record({ analytics: this.consent.analytics() }); }
  protected save(): void { this.consent.record({ analytics: this.analytics() }); }
  protected keydown(event: KeyboardEvent): void { if (event.key === 'Escape') this.consent.closePreferences(); }
  protected toggle(event: Event): void { this.analytics.set((event.target as HTMLInputElement).checked); }
}
