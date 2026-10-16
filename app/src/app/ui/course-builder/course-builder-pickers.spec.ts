import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CourseBuilder } from './course-builder';
import { CourseComponent } from '../../app.models';

describe('US-P013 course builder file pickers', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

  function open(type: 'video' | 'resources' | 'text') {
    const fixture = TestBed.createComponent(CourseBuilder);
    const component = { id: 'c1', title: 'Lesson', type, content: '', resourceUrl: '', durationMinutes: 1, attachments: [] } as unknown as CourseComponent;
    fixture.componentRef.setInput('courseContent', { _id: 'course', createdAt: '', updatedAt: '', sections: [{ id: 's1', title: 'One', components: [component] }] });
    const inputs = { courseContentLoading: false, courseContentSaving: false, courseSubmitting: false, courseContentError: '',
      muxUploadComponentId: '', muxUploadError: '', muxUploadProgress: {}, attachmentUploadComponentId: '',
      attachmentUploadProgress: {}, attachmentUploadStage: {}, attachmentUploadError: '' };
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Edit')!.click();
    fixture.detectChanges();
    return { fixture, host };
  }

  it.each([['video', 'mux-video-upload-c1'], ['resources', 'component-attachment-c1']] as const)(
    'keeps the %s input inside its button label so the ring follows focus', (type, id) => {
      const { host } = open(type);
      const input = host.querySelector<HTMLInputElement>(`input[type="file"]#${id}`)!;
      const label = input.closest('label')!;
      expect(label.hasAttribute('appButton')).toBe(true);
      expect(label.getAttribute('for')).toBe(id);
      expect(label.hasAttribute('aria-disabled')).toBe(false);
      expect(getComputedStyle(input).display).not.toBe('none');
    });

  it('shows the disabled look on the label while the course is saving', () => {
    const { fixture, host } = open('resources');
    fixture.componentRef.setInput('courseContentSaving', true);
    fixture.detectChanges();
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.disabled).toBe(true);
    expect(input.closest('label')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps the rich-text toolbar input out of the tab order', () => {
    const { host } = open('text');
    const input = host.querySelector<HTMLInputElement>('.rich-text-toolbar input[type="file"]')!;
    expect(input.hidden || getComputedStyle(input).display === 'none').toBe(true);
  });

  it.each([
    ['video', 'mux-video-upload-c1', 'courseComponentMuxVideoSelected'],
    ['resources', 'component-attachment-c1', 'courseComponentAttachmentSelected'],
  ] as const)('passes the file chosen in the %s picker to the builder output', (type, id, output) => {
    const { fixture, host } = open(type);
    const emitted = vi.fn();
    (fixture.componentInstance[output] as { subscribe(fn: (e: unknown) => void): unknown }).subscribe(emitted);
    const input = host.querySelector<HTMLInputElement>(`label input#${id}`)!;
    const file = new File(['x'], 'lesson.mp4');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(emitted).toHaveBeenCalledWith(expect.objectContaining({ sectionIndex: 0, componentIndex: 0, file }));
  });
});
