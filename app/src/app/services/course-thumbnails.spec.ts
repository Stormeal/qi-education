import { TestBed } from '@angular/core/testing';
import { CourseListItem } from '../app.models';
import { ApiClientService } from './api-client.service';
import { CourseService } from './course.service';

describe('course thumbnail preloading (X8 DEF-063)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('downloads at most four thumbnails at once and still loads them all', async () => {
    let running = 0, most = 0, done = 0;
    const waiting: (() => void)[] = [];
    TestBed.configureTestingModule({ providers: [{ provide: ApiClientService, useValue: {
      fetch: async () => {
        running++; most = Math.max(most, running);
        await new Promise<void>((resolve) => waiting.push(resolve));
        running--; done++;
        return new Response('image', { status: 200 });
      },
    } }] });
    const courses = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, thumbnailAssetId: `t${i}` }) as CourseListItem);

    const preload = TestBed.inject(CourseService).preloadCourseThumbnails(courses, 'token');
    while (done < 10) {
      await new Promise((resolve) => setTimeout(resolve));
      waiting.splice(0).forEach((release) => release());
    }
    await preload;

    expect(most).toBe(4);
    expect(done).toBe(10);
  });
});
