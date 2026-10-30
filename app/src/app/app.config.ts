import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withNavigationErrorHandler, withRouterConfig } from '@angular/router';
import { routes } from './app.routes';
import { NavigationRecoveryService } from './services/navigation-recovery.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes,
      withRouterConfig({ canceledNavigationResolution: 'computed', resolveNavigationPromiseOnError: true }),
      withNavigationErrorHandler(event => inject(NavigationRecoveryService).handle(event.error))),
  ],
};
