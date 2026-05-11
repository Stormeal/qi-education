import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./routes/dashboard-route').then((module) => module.DashboardRoute),
  },
  {
    path: 'admin',
    loadComponent: () => import('./routes/admin-route').then((module) => module.AdminRoute),
  },
  {
    path: 'courses',
    loadComponent: () => import('./routes/courses-route').then((module) => module.CoursesRoute),
  },
  {
    path: 'courses/new',
    loadComponent: () =>
      import('./routes/course-editor-route').then((module) => module.CourseEditorRoute),
  },
  {
    path: 'courses/:id',
    loadComponent: () =>
      import('./routes/course-view-route').then((module) => module.CourseViewRoute),
  },
  {
    path: 'courses/:id/edit',
    loadComponent: () =>
      import('./routes/course-editor-route').then((module) => module.CourseEditorRoute),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
