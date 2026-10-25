import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminPage } from './admin-page';
import { FeedbackEntry } from '../../app.models';

describe('US-A006 typed admin feedback inbox', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); TestBed.configureTestingModule({ providers: [provideRouter([])] }); });
  it('AC12 filters types in each tab and shows defect details without an invented rating', () => {
    const fixture = TestBed.createComponent(AdminPage);
    const base = { createdAt: '2026-10-25T12:00:00.000Z', userId: 'student', userEmail: 'student@example.test', userRole: 'student', page: 'Courses', message: 'A useful description' };
    const feedback: FeedbackEntry[] = [
      { ...base, id: '1', type: 'feedback', summary: 'Clear lessons' },
      { ...base, id: '2', type: 'defect', summary: 'Search resets', reproductionSteps: 'Choose a category', expectedBehavior: 'Keep my category' },
      { ...base, id: '3', type: 'change-request', summary: 'More filters' },
      { ...base, id: '4', type: 'defect', summary: 'Fixed search', workStatus: 'completed' },
    ];
    Object.entries({ appVersion: 'test', currentYear: 2026, student: { name: 'Admin', currentRole: 'Admin', targetRole: '', pathProgress: null }, userEmail: 'admin@example.test', userRoleLabel: 'Admin', feedback, feedbackLoading: false, feedbackError: '' }).forEach(([key, value]) => fixture.componentRef.setInput(key, value));
    fixture.detectChanges(); const host = fixture.nativeElement as HTMLElement;
    const filter = host.querySelector<HTMLSelectElement>('#feedback-type-filter')!;
    expect(filter).not.toBeNull(); filter.value = 'defect'; filter.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(host.querySelectorAll('.admin-feedback-card')).toHaveLength(1);
    expect(host.textContent).toContain('Search resets'); expect(host.textContent).not.toContain('Clear lessons');
    expect(host.textContent).toContain('Choose a category'); expect(host.textContent).toContain('Keep my category');
    expect(host.querySelector('.feedback-rating')).toBeNull();
    const archived = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(button => button.textContent?.includes('Archived'))!;
    archived.click(); fixture.detectChanges(); expect(host.textContent).toContain('Fixed search'); expect(host.textContent).not.toContain('Search resets');
  });
});
