import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CoursesPage } from '../pages/courses-page/courses-page';
import { LoginPage } from '../pages/login-page/login-page';
import { AppStateService } from '../services/app-state.service';

@Component({
  selector: 'app-courses-route',
  imports: [CoursesPage, LoginPage],
  templateUrl: './courses-route.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoursesRoute {
  protected readonly state = inject(AppStateService);
}
