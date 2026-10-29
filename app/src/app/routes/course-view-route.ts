import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CourseViewPage } from '../pages/course-view-page/course-view-page';
import { LearningPage } from '../pages/learning-page/learning-page';
import { LoginPage } from '../pages/login-page/login-page';
import { AppStateService } from '../services/app-state.service';

@Component({
  selector: 'app-course-view-route',
  imports: [CourseViewPage, LearningPage, LoginPage],
  templateUrl: './course-view-route.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseViewRoute {
  protected readonly state = inject(AppStateService);

  constructor() {
    // US-L024: Stripe returns here with ?payment=…&session_id=…; read it once and drop it
    // from the address so a reload or a shared link does not confirm again.
    const route = inject(ActivatedRoute);
    const query = route.snapshot.queryParamMap;
    const payment = query.get('payment');
    if (!payment) return;
    const courseId = route.snapshot.paramMap.get('id') ?? '';
    const router = inject(Router);
    // Wait for the initial navigation and query cleanup before applying a return.
    // A navigation elsewhere must not start a confirmation on that other page.
    void router.navigate([], { relativeTo: route, queryParams: { payment: null, session_id: null },
      queryParamsHandling: 'merge', replaceUrl: true }).then(() => {
      if (router.url.split('?')[0] === `/courses/${encodeURIComponent(courseId)}`) {
        void this.state.handleCoursePurchaseReturn(courseId, payment, query.get('session_id'));
      }
    });
  }
}
