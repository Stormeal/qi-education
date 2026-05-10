import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CourseEditorPage } from '../pages/course-editor-page/course-editor-page';
import { LoginPage } from '../pages/login-page/login-page';
import { AppStateService } from '../services/app-state.service';
import { SessionRestoreState } from '../ui/session-restore-state/session-restore-state';

@Component({
  selector: 'app-course-editor-route',
  imports: [CourseEditorPage, LoginPage, SessionRestoreState],
  templateUrl: './course-editor-route.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseEditorRoute {
  protected readonly state = inject(AppStateService);
}
