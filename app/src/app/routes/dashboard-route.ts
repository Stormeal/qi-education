import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DashboardPage } from '../pages/dashboard-page/dashboard-page';
import { LoginPage } from '../pages/login-page/login-page';
import { AppStateService } from '../services/app-state.service';

@Component({
  selector: 'app-dashboard-route',
  imports: [DashboardPage, LoginPage],
  templateUrl: './dashboard-route.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardRoute {
  protected readonly state = inject(AppStateService);
}
