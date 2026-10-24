import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn, Router, Routes } from '@angular/router';
import { AppStateService } from './services/app-state.service';

const unsavedCourseGuard: CanDeactivateFn<unknown> = () =>
  inject(AppStateService).confirmDiscardCourseChanges();

const roadmapGuard: CanActivateFn = () =>
  inject(AppStateService).canSeeRoadmap() || inject(Router).parseUrl('/');

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
    path: 'library',
    loadComponent: () => import('./routes/library-route').then((module) => module.LibraryRoute),
  },
  {
    path: 'library/:id',
    loadComponent: () =>
      import('./routes/course-view-route').then((module) => module.CourseViewRoute),
  },
  {
    path: 'profile',
    loadComponent: () => import('./routes/profile-route').then((module) => module.ProfileRoute),
  },
  {
    path: 'terms',
    loadComponent: () => import('./routes/terms-route').then((module) => module.TermsRoute),
  },
  {
    path: 'about',
    loadComponent: () => import('./pages/about-page/about-page').then((module) => module.AboutPage),
  },
  {
    path: 'roadmap',
    canActivate: [roadmapGuard],
    loadComponent: () =>
      import('./pages/roadmap-page/roadmap-page').then((module) => module.RoadmapPage),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./pages/password-reset-page/password-reset-page').then((module) => module.PasswordResetPage),
  },
  {
    path: 'confirm-email',
    loadComponent: () =>
      import('./pages/confirm-email-page/confirm-email-page').then((module) => module.ConfirmEmailPage),
  },
  {
    path: 'career-path',
    loadComponent: () =>
      import('./routes/career-path-route').then((module) => module.CareerPathRoute),
  },
  {
    path: 'organization',
    loadComponent: () =>
      import('./routes/organization-route').then((module) => module.OrganizationRoute),
  },
  {
    path: 'join-organization',
    loadComponent: () =>
      import('./routes/join-organization-route').then((module) => module.JoinOrganizationRoute),
  },
  {
    path: 'courses/new',
    canDeactivate: [unsavedCourseGuard],
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
    canDeactivate: [unsavedCourseGuard],
    loadComponent: () =>
      import('./routes/course-editor-route').then((module) => module.CourseEditorRoute),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
