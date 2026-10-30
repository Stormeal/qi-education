import { DOCUMENT } from '@angular/common';
import { Component, EnvironmentInjector, ErrorHandler, createEnvironmentInjector, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { App } from './app';
import { appConfig } from './app.config';
import { AppStateService } from './services/app-state.service';
import { NavigationRecoveryService } from './services/navigation-recovery.service';

@Component({ template: '<p>Current page remains usable</p>' })
class CurrentPage {}

describe('DEF-067 lazy-route recovery', () => {
  let router: Router;
  let fixture: ReturnType<typeof TestBed.createComponent<App>>;
  let failure: unknown;
  let browserScope: EnvironmentInjector;
  let reload: ReturnType<typeof vi.fn>;

  async function mount(navigate = true) {
    localStorage.clear(); sessionStorage.clear();
    reload = vi.fn();
    TestBed.configureTestingModule({ imports: [App], providers: [...appConfig.providers,
      { provide: NavigationRecoveryService, useFactory: () => {
        // Only this service receives the browser boundary double; the Router and root DOM stay real.
        browserScope = createEnvironmentInjector([NavigationRecoveryService,
          { provide: DOCUMENT, useValue: { location: { href: 'http://localhost/confirm-email#token=synthetic', reload } } },
        ], inject(EnvironmentInjector));
        return browserScope.get(NavigationRecoveryService);
      } },
    ] });
    router = TestBed.inject(Router);
    router.resetConfig([
      { path: '', component: CurrentPage },
      { path: 'missing', loadComponent: () => Promise.reject(failure) },
      { path: 'working', component: CurrentPage },
      { path: 'blocked', component: CurrentPage, canActivate: [() => false] },
    ]);
    fixture = TestBed.createComponent(App);
    if (navigate) await router.navigateByUrl('/');
    fixture.detectChanges();
  }
  beforeEach(() => mount());
  afterEach(() => { browserScope.destroy(); vi.restoreAllMocks(); });

  async function failNavigation(message = 'Failed to fetch dynamically imported module: https://example.test/chunk-old.js') {
    failure = new TypeError(message);
    await router.navigateByUrl('/missing').catch(() => false);
    fixture.detectChanges();
  }
  const recovery = () => fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement | null;

  it.each([
    'Failed to fetch dynamically imported module: https://example.test/chunk-old.js',
    'error loading dynamically imported module: https://example.test/chunk-old.js',
    'Importing a module script failed.',
  ])('offers an explicit current-page reload for %s, keeping the active page', async message => {
    await failNavigation(message);
    expect(recovery()?.textContent).toContain('could not be loaded');
    expect(reload).not.toHaveBeenCalled();
    const button = fixture.nativeElement.querySelector('button[appButton]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();
    expect(reload).toHaveBeenCalledOnce();
    expect(router.url).toBe('/');
    expect(fixture.nativeElement.textContent).toContain('Current page remains usable');
  });

  it('offers a real reload on an initial lazy-route failure with a token fragment', async () => {
    browserScope.destroy(); TestBed.resetTestingModule();
    await mount(false);
    failure = new TypeError('Importing a module script failed.');
    await router.navigateByUrl('/missing#token=synthetic').catch(() => false);
    fixture.detectChanges();
    expect(router.lastSuccessfulNavigation()).toBeNull();
    expect(recovery()?.textContent).toContain('could not be loaded');
    expect(reload).not.toHaveBeenCalled();
    const button = fixture.nativeElement.querySelector('button[appButton]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('resolves the failed navigation without an unhandled rejection', async () => {
    failure = new TypeError('Failed to fetch dynamically imported module: https://example.test/chunk-old.js');
    await expect(router.navigateByUrl('/missing')).resolves.toBe(false);
  });

  it('withholds reload while course edits are unsaved and retains browser-departure protection', async () => {
    const state = TestBed.inject(AppStateService);
    state.loginState.set({ token: 'local-test', user: { id: 'teacher', displayName: 'Teacher', email: 'teacher@example.test',
      role: 'teacher', status: 'active', createdAt: '', enrolledCourseIds: [] },
      permissions: { canCreateCourses: true, hasAdminAccess: false } });
    state.currentPath.set('/courses/new');
    state.updateCourseTitle('Keep this unsaved draft');
    expect(state.hasUnsavedCourseChanges()).toBe(true);
    await failNavigation();
    expect(recovery()).not.toBeNull();
    expect(fixture.nativeElement.querySelector('a[appButton]')).toBeNull();
    expect(fixture.nativeElement.querySelector('button[appButton]')?.disabled).toBe(true);
    fixture.nativeElement.querySelector('button[appButton]').click();
    expect(reload).not.toHaveBeenCalled();
    expect(state.courseDraft().title).toBe('Keep this unsaved draft');
    const departure = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(departure);
    expect(departure.defaultPrevented).toBe(true);
  });

  it('clears the recovery message after a successful navigation, but not a denied one', async () => {
    await failNavigation();
    await router.navigateByUrl('/blocked'); fixture.detectChanges();
    expect(recovery()).not.toBeNull();
    await router.navigateByUrl('/working'); fixture.detectChanges();
    expect(recovery()).toBeNull();
  });

  it('keeps unrelated route failures in error reporting without mislabelling them as missing assets', async () => {
    const report = vi.spyOn(TestBed.inject(ErrorHandler), 'handleError').mockImplementation(() => {});
    await failNavigation('Cannot read properties of undefined');
    expect(recovery()).toBeNull();
    expect(report).toHaveBeenCalledWith(failure);
  });
});
