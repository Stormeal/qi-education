import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LibraryPage } from '../pages/library-page/library-page';
import { LoginPage } from '../pages/login-page/login-page';
import { AppStateService } from '../services/app-state.service';
import { SessionRestoreState } from '../ui/session-restore-state/session-restore-state';

@Component({
  selector: 'app-library-route',
  imports: [LibraryPage, LoginPage, SessionRestoreState],
  templateUrl: './library-route.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryRoute {
  protected readonly state = inject(AppStateService);
}
