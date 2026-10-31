import { Injectable, computed, signal } from '@angular/core';

// US-P021 cookie consent. Bump CONSENT_VERSION when a category is added: everyone is asked again.
export const CONSENT_VERSION = 1;
const STORE_KEY = 'qi-education:cookie-consent';
export type ConsentCategory = 'essential' | 'analytics';
export type ConsentDecision = { version: number; decidedAt: string; categories: { essential: true; analytics: boolean } };

function readDecision(): ConsentDecision | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as ConsentDecision | null;
    return saved?.version === CONSENT_VERSION && typeof saved.categories?.analytics === 'boolean' ? saved : null;
  } catch { return null; } // Blocked or broken storage: ask again, analytics stays off.
}

/** Any non-essential integration must check `hasConsent('analytics')` before it loads. */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly decision = signal(readDecision());
  /** True while this browser has no decision for the current version: the banner shows. */
  readonly pending = computed(() => this.decision() === null);
  readonly analytics = computed(() => this.decision()?.categories.analytics ?? false);
  readonly preferencesOpen = signal(false);

  hasConsent(category: ConsentCategory): boolean {
    return category === 'essential' || this.analytics();
  }
  record(categories: { analytics: boolean }): void {
    const decision: ConsentDecision = { version: CONSENT_VERSION, decidedAt: new Date().toISOString(),
      categories: { essential: true, analytics: categories.analytics } };
    this.decision.set(decision);
    this.preferencesOpen.set(false);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(decision)); } catch { /* Kept for this visit only. */ }
  }
  openPreferences(): void { this.preferencesOpen.set(true); }
  closePreferences(): void { this.preferencesOpen.set(false); }
}
