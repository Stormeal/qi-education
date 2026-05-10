import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DashboardPage } from '../pages/dashboard-page/dashboard-page';
import { LoginPage } from '../pages/login-page/login-page';
import { AppStateService } from '../services/app-state.service';
import { SessionRestoreState } from '../ui/session-restore-state/session-restore-state';

@Component({
  selector: 'app-dashboard-route',
  imports: [DashboardPage, LoginPage, SessionRestoreState],
  templateUrl: './dashboard-route.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardRoute {
  protected readonly state = inject(AppStateService);
}
