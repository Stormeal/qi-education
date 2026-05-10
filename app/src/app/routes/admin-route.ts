import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AdminPage } from '../pages/admin-page/admin-page';
import { DashboardPage } from '../pages/dashboard-page/dashboard-page';
import { LoginPage } from '../pages/login-page/login-page';
import { AppStateService } from '../services/app-state.service';
import { SessionRestoreState } from '../ui/session-restore-state/session-restore-state';

@Component({
  selector: 'app-admin-route',
  imports: [AdminPage, DashboardPage, LoginPage, SessionRestoreState],
  templateUrl: './admin-route.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminRoute {
  protected readonly state = inject(AppStateService);
}
