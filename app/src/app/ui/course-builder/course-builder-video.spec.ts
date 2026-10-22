import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CourseBuilder } from './course-builder';
import { CourseComponent } from '../../app.models';


describe('US-T006 video recovery guidance', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });
  function panel(status: string, updatedAt = new Date().toISOString()) {
    const fixture = TestBed.createComponent(CourseBuilder);
    fixture.componentRef.setInput('courseContent', { _id: 'course', updatedAt, sections: [] });
    const component = { id: 'video', type: 'video', mux: { uploadId: 'upload', status, errorMessage: 'Provider failed.' } } as CourseComponent;
    const view = fixture.componentInstance as unknown as { muxStatusLabel(c: CourseComponent): string; muxStatusDescription(c: CourseComponent): string };
    return { component, view };
  }
  it('VO-03 explains recovery for errors', () => {
    const { view, component } = panel('errored');
    expect(view.muxStatusDescription(component)).toMatch(/remove.*upload/i);
  });
  it('VO-03 explains a delay after ten minutes', () => {
    const { view, component } = panel('processing', new Date(Date.now() - 11 * 60_000).toISOString());
    expect(view.muxStatusLabel(component)).toMatch(/10 minutes/);
    expect(view.muxStatusDescription(component)).toMatch(/remove.*upload/i);
  });
});

describe('exercise intro video in the builder', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
  afterEach(() => {
    TestBed.resetTestingModule(); vi.restoreAllMocks();
    document.body.classList.remove('builder-modal-open'); document.documentElement.classList.remove('builder-modal-open');
    document.body.removeAttribute('style');
  });
  function openExercise(mux?: object) {
    const fixture = TestBed.createComponent(CourseBuilder);
    const exercise = { id: 'ex', title: 'Exercise', type: 'exercise', content: '- Do it', resourceUrl: '', durationMinutes: 5,
      attachments: [], ...(mux ? { mux } : {}) };
    const inputs = { courseContent: { _id: 'course', createdAt: '', updatedAt: '', sections: [{ id: 's', title: 'Chapter', components: [exercise] }] },
      courseContentLoading: false, courseContentSaving: false, courseSubmitting: false, courseContentError: '', muxUploadComponentId: '',
      muxUploadError: '', muxUploadProgress: {}, attachmentUploadComponentId: '', attachmentUploadProgress: {}, attachmentUploadStage: {},
      attachmentUploadError: '' };
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Edit')!.click();
    fixture.detectChanges();
    return host;
  }
  const labels = (host: HTMLElement) => [...host.querySelectorAll('label.builder-field > span')].map(s => s.textContent?.trim());

  it('offers an optional intro video and an exercise link', () => {
    const host = openExercise();
    expect(labels(host)).toContain('Exercise link');
    expect(labels(host)).not.toContain('Fallback video URL');
    expect(host.querySelector('.mux-upload-panel')?.textContent).toContain('Optional intro video');
    expect(host.querySelector('input.mux-file-input')).not.toBeNull();
  });

  it('shows Exercise as the selected lesson type', () => {
    const select = [...openExercise().querySelectorAll('label.builder-field')]
      .find(label => label.textContent?.includes('Component type'))!.querySelector('select')!;
    expect(select.value).toBe('exercise');
  });

  it('lets the teacher delete an uploaded intro video', () => {
    // A processing video has no player: jsdom cannot run the real Mux player, and on CI another
    // spec file can register it before any stand-in (the specs share one environment).
    const host = openExercise({ uploadId: 'u', assetId: 'a', playbackId: 'p', status: 'processing', captions: [] });
    expect([...host.querySelectorAll('.mux-upload-panel button')].map(b => b.textContent?.trim())).toContain('Delete video');
  });
});
