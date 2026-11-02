import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { OrganizationPage } from '../pages/organization-page/organization-page';
import { LoginPage } from '../pages/login-page/login-page';
import { AppStateService } from '../services/app-state.service';
import type { CardReturn } from '../ui/organization-billing/organization-billing';

@Component({
  selector: 'app-organization-route',
  imports: [OrganizationPage, LoginPage],
  templateUrl: './organization-route.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationRoute {
  protected readonly state = inject(AppStateService);
  protected readonly cardReturn = signal<CardReturn | null>(null);

  constructor() {
    // US-O002: Stripe's card form returns with ?billing=card&session_id=… or ?billing=cancelled; read it
    // once and drop it from the address so a reload does not confirm again.
    const route = inject(ActivatedRoute);
    const query = route.snapshot.queryParamMap;
    const billing = query.get('billing');
    if (billing !== 'card' && billing !== 'cancelled') return;
    this.cardReturn.set({ outcome: billing, sessionId: query.get('session_id') });
    void inject(Router).navigate([], { relativeTo: route, queryParams: { billing: null, session_id: null },
      queryParamsHandling: 'merge', replaceUrl: true });
  }
}
