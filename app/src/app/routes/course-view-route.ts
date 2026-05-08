import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CourseViewPage } from '../pages/course-view-page/course-view-page';
import { LoginPage } from '../pages/login-page/login-page';
import { AppStateService } from '../services/app-state.service';

@Component({
  selector: 'app-course-view-route',
  imports: [CourseViewPage, LoginPage],
  templateUrl: './course-view-route.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseViewRoute {
  protected readonly state = inject(AppStateService);
}
