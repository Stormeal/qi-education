import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { CourseEditorPage } from './course-editor-page';

describe('US-P013 course editor thumbnail picker', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

  function open(overrides: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(CourseEditorPage);
    const inputs: Record<string, unknown> = {
      appVersion: '0', currentYear: 2026, student: { name: 'T', initials: 'T' }, userEmail: 't@example.com',
      userRoleLabel: 'Teacher', canAccessAdmin: false, courseFormMode: 'edit', editingCourse: null,
      courseDraft: { title: 'Course', level: '', description: '', requirements: '', whatYoullLearn: '', audience: '',
        partOfCareer: '', teacher: '', careerGoals: '', status: 'draft' },
      courseSubmitting: false, courseCreateError: '', courseSaveNotice: '', courseContent: null,
      courseContentLoading: false, courseContentSaving: false, courseContentError: '', muxUploadComponentId: '',
      muxUploadError: '', muxUploadProgress: {}, attachmentUploadComponentId: '', attachmentUploadProgress: {},
      attachmentUploadStage: {}, attachmentUploadError: '', thumbnailUploading: false, thumbnailError: '',
      isFeedbackOpen: false, feedbackSubmitted: false, feedbackPage: '', feedbackRating: '', feedbackText: '',
      feedbackSubmitting: false, feedbackError: '', feedbackOptions: [], ...overrides,
    };
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    return { fixture, host, input: host.querySelector<HTMLInputElement>('input[type="file"]')! };
  }

  it('keeps the file input focusable inside a shared button label', () => {
    const { input } = open();
    const label = input.closest('label')!;
    expect(label.hasAttribute('appbutton')).toBe(true);
    expect(label.getAttribute('size')).toBe('sm');
    expect(label.classList.contains('thumbnail-upload-button')).toBe(false);
    expect(getComputedStyle(input).display).not.toBe('none');
    expect(label.hasAttribute('aria-disabled')).toBe(false);
  });

  it('shows the disabled look on the label while uploading', () => {
    const { input } = open({ thumbnailUploading: true });
    expect(input.disabled).toBe(true);
    expect(input.closest('label')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('still hands the chosen file to the thumbnail output', () => {
    const { fixture, input } = open();
    const emitted = vi.fn();
    fixture.componentInstance.courseThumbnailSelected.subscribe(emitted);
    const file = new File(['x'], 'cover.png');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(emitted).toHaveBeenCalledWith(file);
  });
});
