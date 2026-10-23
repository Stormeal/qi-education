import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { JoinOrganizationPage, type AuthRequest } from '../pages/join-organization-page/join-organization-page';
import { LoginPage } from '../pages/login-page/login-page';
import { AppStateService } from '../services/app-state.service';

@Component({
  selector: 'app-join-organization-route',
  imports: [JoinOrganizationPage, LoginPage],
  templateUrl: './join-organization-route.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JoinOrganizationRoute {
  protected readonly state = inject(AppStateService);
  // The invitee chose to sign in or sign up; the join page returns once they are signed in.
  protected readonly showAuth = signal(false);

  protected requestAuth(request: AuthRequest): void {
    this.state.setAuthMode(request.mode);
    this.state.updateEmail(request.email);
    this.showAuth.set(true);
  }
}
