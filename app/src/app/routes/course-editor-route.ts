import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CourseEditorPage } from '../pages/course-editor-page/course-editor-page';
import { LoginPage } from '../pages/login-page/login-page';
import { AppStateService } from '../services/app-state.service';

@Component({
  selector: 'app-course-editor-route',
  imports: [CourseEditorPage, LoginPage],
  templateUrl: './course-editor-route.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseEditorRoute {
  protected readonly state = inject(AppStateService);
}
