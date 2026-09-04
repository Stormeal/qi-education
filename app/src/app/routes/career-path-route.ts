import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CareerPathPage } from '../pages/career-path-page/career-path-page';
import { LoginPage } from '../pages/login-page/login-page';
import { AppStateService } from '../services/app-state.service';
import { SessionRestoreState } from '../ui/session-restore-state/session-restore-state';

@Component({
  selector: 'app-career-path-route',
  imports: [CareerPathPage, LoginPage, SessionRestoreState],
  templateUrl: './career-path-route.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CareerPathRoute {
  protected readonly state = inject(AppStateService);
}
