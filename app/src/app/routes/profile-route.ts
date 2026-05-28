import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LoginPage } from '../pages/login-page/login-page';
import { ProfilePage } from '../pages/profile-page/profile-page';
import { AppStateService } from '../services/app-state.service';
import { SessionRestoreState } from '../ui/session-restore-state/session-restore-state';

@Component({
  selector: 'app-profile-route',
  imports: [ProfilePage, LoginPage, SessionRestoreState],
  templateUrl: './profile-route.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileRoute {
  protected readonly state = inject(AppStateService);
}
