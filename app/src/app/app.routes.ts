import { Routes } from '@angular/router';
import { AdminRoute } from './routes/admin-route';
import { CourseEditorRoute } from './routes/course-editor-route';
import { CourseViewRoute } from './routes/course-view-route';
import { CoursesRoute } from './routes/courses-route';
import { DashboardRoute } from './routes/dashboard-route';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: DashboardRoute,
  },
  {
    path: 'admin',
    component: AdminRoute,
  },
  {
    path: 'courses',
    component: CoursesRoute,
  },
  {
    path: 'courses/new',
    component: CourseEditorRoute,
  },
  {
    path: 'courses/:id',
    component: CourseViewRoute,
  },
  {
    path: 'courses/:id/edit',
    component: CourseEditorRoute,
  },
  {
    path: '**',
    redirectTo: '',
  },
];
