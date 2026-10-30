import { DOCUMENT } from '@angular/common';
import { DestroyRef, ErrorHandler, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';

/** A removed or unreachable lazy bundle needs an explicit full-page reload, never an automatic one. */
@Injectable({ providedIn: 'root' })
export class NavigationRecoveryService {
  private readonly document = inject(DOCUMENT);
  private readonly errors = inject(ErrorHandler);
  readonly loadFailed = signal(false);

  constructor() {
    inject(Router).events.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(event => {
      if (event instanceof NavigationEnd) this.loadFailed.set(false);
    });
  }

  reload(hasUnsavedChanges: boolean): void {
    if (!this.loadFailed() || hasUnsavedChanges) return;
    // A same-URL link only changes the fragment on token-bearing links; force a real reload.
    this.document.location.reload();
  }

  handle(error: unknown): void {
    if (error instanceof Error && /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(error.message)) {
      this.loadFailed.set(true);
    } else {
      // Router promises resolve false, so unexpected failures still need the usual error reporter.
      this.errors.handleError(error);
    }
  }
}
