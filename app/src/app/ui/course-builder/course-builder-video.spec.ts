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
