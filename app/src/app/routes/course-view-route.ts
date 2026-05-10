import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CourseViewPage } from '../pages/course-view-page/course-view-page';
import { LoginPage } from '../pages/login-page/login-page';
import { AppStateService } from '../services/app-state.service';
import { SessionRestoreState } from '../ui/session-restore-state/session-restore-state';

@Component({
  selector: 'app-course-view-route',
  imports: [CourseViewPage, LoginPage, SessionRestoreState],
  templateUrl: './course-view-route.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseViewRoute {
  protected readonly state = inject(AppStateService);
}
