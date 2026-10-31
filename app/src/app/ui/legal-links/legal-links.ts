import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConsentService } from '../../services/consent.service';

/** Footer links to the terms (US-P022) and the cookie preferences (US-P021). */
@Component({
  selector: 'app-legal-links',
  imports: [RouterLink],
  template: `
    <nav class="legal-links" aria-label="Legal">
      <a routerLink="/terms">Terms of Service</a>
      <a routerLink="/purchase-terms">Purchase terms</a>
      <button type="button" (click)="consent.openPreferences()">Cookie preferences</button>
    </nav>`,
  styles: `
    .legal-links { display: flex; flex-wrap: wrap; gap: 4px 14px; }
    a, button { padding: 0; border: 0; color: inherit; background: none; font: inherit; text-decoration: underline; cursor: pointer; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalLinks {
  protected readonly consent = inject(ConsentService);
}
