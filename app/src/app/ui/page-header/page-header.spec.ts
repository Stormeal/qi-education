import { APP_BASE_HREF } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PageHeader } from './page-header';

describe('PageHeader', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  it('US-P019 B2 groups Notifications, labeled Feedback, Settings and the profile control', async () => {
    TestBed.configureTestingModule({ imports: [PageHeader], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PageHeader);
    for (const [key, value] of Object.entries({ displayName: 'Learner', email: 'learner@example.test', roleLabel: 'Student', unreadCount: 2 })) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('button[aria-label="Notifications"]')).not.toBeNull();
    expect(page.querySelector('.notification-dot')).not.toBeNull();
    expect(page.querySelector('a[aria-label="Settings"]')?.getAttribute('href')).toBe('/settings');
    expect(page.querySelector('app-profile-menu')).not.toBeNull();
    const feedback = Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.trim() === 'Feedback')!;
    const opened = vi.fn(); fixture.componentInstance.feedbackOpened.subscribe(opened);
    feedback.click(); expect(opened).toHaveBeenCalled();
  });
  it('US-P019 B3 opens the compact navigation and returns focus on Escape', async () => {
    TestBed.configureTestingModule({ imports: [PageHeader], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PageHeader);
    for (const [key, value] of Object.entries({ displayName: 'Learner', email: 'learner@example.test', roleLabel: 'Teacher' })) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    document.body.append(page);
    const trigger = page.querySelector<HTMLButtonElement>('button[aria-label="Open navigation"]')!;
    trigger.click(); fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const drawer = page.querySelector('#mobile-navigation')!;
    for (const label of ['Home', 'About', 'Catalog', 'My Learning', 'Roadmap', 'Feedback', 'Settings']) expect(drawer.textContent).toContain(label);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); fixture.detectChanges();
    expect(page.querySelector('#mobile-navigation')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    page.remove();
  });
  it('uses the configured app base href for navbar CTA links', async () => {
    await TestBed.configureTestingModule({
      imports: [PageHeader],
      providers: [
        provideRouter([]),
        { provide: APP_BASE_HREF, useValue: '/qi-education/' },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PageHeader);
    fixture.componentRef.setInput('displayName', 'Alex');
    fixture.componentRef.setInput('email', 'alex@example.com');
    fixture.componentRef.setInput('roleLabel', 'Admin');
    fixture.detectChanges();

    const links = Array.from(fixture.nativeElement.querySelectorAll('.tabs a')) as HTMLAnchorElement[];
    const hrefs = links.map((link) => link.getAttribute('href'));

    expect(hrefs).toContain('/qi-education/');
    expect(hrefs).toContain('/qi-education/courses');
    expect(hrefs).toContain('/qi-education/library');
  });

  it.each([['Teacher', true], ['Platform admin', true], ['Student', false]] as const)(
    'shows the Roadmap tab to a %s: %s',
    async (roleLabel, shown) => {
      await TestBed.configureTestingModule({ imports: [PageHeader], providers: [provideRouter([])] }).compileComponents();

      const fixture = TestBed.createComponent(PageHeader);
      fixture.componentRef.setInput('displayName', 'U');
      fixture.componentRef.setInput('email', 'u@example.test');
      fixture.componentRef.setInput('roleLabel', roleLabel);
      fixture.detectChanges();

      const labels = Array.from(fixture.nativeElement.querySelectorAll('.tabs a') as NodeListOf<HTMLElement>).map((link) => link.textContent?.trim());
      expect(labels.includes('Roadmap')).toBe(shown);
    },
  );
});
