import { APP_BASE_HREF } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CourseListItem } from '../../app.models';
import { CoursesPage } from './courses-page';

function makeCourse(partial: Partial<CourseListItem>): CourseListItem {
  return {
    id: 'course',
    ownerUserId: '',
    title: 'Course',
    description: '',
    requirements: [],
    whatYoullLearn: [],
    audience: '',
    level: 'Beginner',
    partOfCareer: '',
    teacher: 'Teacher',
    careerGoals: [],
    status: 'published',
    createdAt: '2026-01-01T00:00:00.000Z',
    priceDkk: null,
    thumbnailAssetId: '',
    isPremium: false,
    isBestseller: false,
    rating: 0,
    ratingCount: 0,
    category: 'Uncategorized',
    languages: [],
    ...partial,
  };
}

const catalog: CourseListItem[] = [
  makeCourse({
    id: 'selenium',
    title: 'Selenium WebDriver with Java',
    teacher: 'Rahul Academy',
    category: 'Automation Testing',
    level: 'Intermediate',
    languages: ['English'],
    priceDkk: 1500,
    rating: 4.6,
    ratingCount: 140,
    createdAt: '2026-02-01T00:00:00.000Z',
    isBestseller: true,
  }),
  makeCourse({
    id: 'api',
    title: 'Rest API Testing Automation',
    teacher: 'Rahul Academy',
    category: 'API Testing',
    level: 'Advanced',
    languages: ['English', 'Danish'],
    priceDkk: 900,
    rating: 4.5,
    ratingCount: 48,
    createdAt: '2026-03-01T00:00:00.000Z',
  }),
  makeCourse({
    id: 'istqb',
    title: 'ISTQB Foundation Level',
    teacher: 'Naved Koshy',
    category: 'Software Testing',
    level: 'Beginner',
    languages: ['Danish'],
    priceDkk: null,
    rating: 3.9,
    ratingCount: 42,
    createdAt: '2026-01-15T00:00:00.000Z',
  }),
  makeCourse({
    id: 'draft',
    title: 'Unpublished Bootcamp',
    status: 'draft',
    category: 'Software Testing',
  }),
];

async function createPage(
  courses: CourseListItem[] = catalog,
): Promise<{ component: CoursesPage; fixture: ComponentFixture<CoursesPage> }> {
  await TestBed.configureTestingModule({
    imports: [CoursesPage],
    providers: [provideRouter([]), { provide: APP_BASE_HREF, useValue: '/' }],
  }).compileComponents();

  const fixture = TestBed.createComponent(CoursesPage);
  const ref = fixture.componentRef;
  ref.setInput('appVersion', '0.0.0');
  ref.setInput('currentYear', 2026);
  ref.setInput('student', { name: 'Alex', currentRole: '', targetRole: '', pathProgress: 0 });
  ref.setInput('userEmail', 'alex@example.com');
  ref.setInput('userId', 'teacher-a');
  ref.setInput('userRoleLabel', 'Student');
  ref.setInput('canAccessAdmin', false);
  ref.setInput('courses', courses);
  ref.setInput('coursesLoading', false);
  ref.setInput('coursesError', '');
  ref.setInput('canCreateCourses', false);
  ref.setInput('isFeedbackOpen', false);
  ref.setInput('feedbackSubmitted', false);
  ref.setInput('feedbackPage', 'courses');
  ref.setInput('feedbackRating', '');
  ref.setInput('feedbackText', '');
  ref.setInput('feedbackSubmitting', false);
  ref.setInput('feedbackError', '');
  ref.setInput('feedbackOptions', []);
  fixture.detectChanges();

  return { component: fixture.componentInstance, fixture };
}

function ids(courses: CourseListItem[]): string[] {
  return courses.map((course) => course.id);
}

describe('owned course drafts (DEF-001)', () => {
  it('uses authenticated IDs instead of matching instructor names', async () => {
    const { fixture } = await createPage([
      Object.assign(makeCourse({ id: 'mine', title: 'My renamed course', status: 'draft', teacher: 'Renamed instructor' }), { ownerUserId: 'teacher-a' }),
      Object.assign(makeCourse({ id: 'other', title: 'Another teachers course', status: 'draft', teacher: 'Alex' }), { ownerUserId: 'teacher-b' }),
      Object.assign(makeCourse({ id: 'legacy', title: 'Legacy unowned course', status: 'draft', teacher: 'Alex' }), { ownerUserId: '' }),
    ]);
    fixture.componentRef.setInput('canCreateCourses', true);
    fixture.detectChanges();
    const drafts = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((button) => button.textContent?.includes('My drafts'))!;
    drafts.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('My renamed course');
    expect(fixture.nativeElement.textContent).not.toContain('Another teachers course');
    expect(fixture.nativeElement.textContent).not.toContain('Legacy unowned course');
    fixture.componentRef.setInput('canAccessAdmin', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Another teachers course');
    expect(fixture.nativeElement.textContent).toContain('Legacy unowned course');
  });
});

describe('CoursesPage browse filters', () => {
  it('RD-05 uses the stored category on the card and in the interactive category filter', async () => {
    const { fixture } = await createPage();
    const body = fixture.nativeElement as HTMLElement;
    expect(body.querySelector('.browse-card[href="/courses/api"]')?.textContent).toContain('API Testing');
    const category = [...body.querySelectorAll<HTMLLabelElement>('label.filter-option')]
      .find(label => label.textContent?.includes('API Testing'))!;
    category.querySelector<HTMLInputElement>('input')!.click();
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const results = [...body.querySelectorAll<HTMLAnchorElement>('.browse-card')].map(card => card.getAttribute('href'));
    expect(results).toEqual(['/courses/api']);
    expect(body.querySelector('.browse-card')?.textContent).not.toContain('Uncategorized');
  });

  it('only includes published courses in the catalog results', async () => {
    const { component } = await createPage();
    const result = ids((component as any).catalogResults());

    expect(result).not.toContain('draft');
    expect(result).toHaveLength(3);
  });

  it('filters by category', async () => {
    const { component, fixture } = await createPage();
    (component as any).toggleCategory('API Testing', true);
    fixture.detectChanges();

    expect(ids((component as any).catalogResults())).toEqual(['api']);
  });

  it('filters by normalized level', async () => {
    const { component, fixture } = await createPage();
    (component as any).toggleLevel('Beginner', true);
    fixture.detectChanges();

    expect(ids((component as any).catalogResults())).toEqual(['istqb']);
  });

  it('filters by language membership', async () => {
    const { component, fixture } = await createPage();
    (component as any).setLanguage('Danish');
    fixture.detectChanges();

    expect(ids((component as any).catalogResults()).sort()).toEqual(['api', 'istqb']);
  });

  it('filters by minimum rating', async () => {
    const { component, fixture } = await createPage();
    (component as any).setMinRating(4.5);
    fixture.detectChanges();

    expect(ids((component as any).catalogResults()).sort()).toEqual(['api', 'selenium']);
  });

  it('filters by search terms across title, teacher and topics', async () => {
    const { component, fixture } = await createPage();
    (component as any).updateSearchQuery('rahul rest');
    fixture.detectChanges();

    expect(ids((component as any).catalogResults())).toEqual(['api']);
  });

  it('treats free courses as price zero within the range', async () => {
    const { component, fixture } = await createPage();
    (component as any).updatePriceMax('1000');
    fixture.detectChanges();

    expect(ids((component as any).catalogResults()).sort()).toEqual(['api', 'istqb']);
  });

  it('sorts by price ascending with free first', async () => {
    const { component, fixture } = await createPage();
    (component as any).setSort('price-asc');
    fixture.detectChanges();

    expect(ids((component as any).catalogResults())).toEqual(['istqb', 'api', 'selenium']);
  });

  it('builds category facet counts from published courses', async () => {
    const { component } = await createPage();
    const facets = (component as any).categoryFacets() as { value: string; count: number }[];

    const software = facets.find((facet) => facet.value === 'Software Testing');
    expect(software?.count).toBe(1);
    expect(facets.some((facet) => facet.value === 'Uncategorized')).toBe(false);
  });

  it('clears all active filters', async () => {
    const { component, fixture } = await createPage();
    (component as any).toggleCategory('API Testing', true);
    (component as any).updateSearchQuery('rest');
    fixture.detectChanges();
    expect((component as any).hasActiveFilters()).toBe(true);

    (component as any).clearAllFilters();
    fixture.detectChanges();

    expect((component as any).hasActiveFilters()).toBe(false);
    expect(ids((component as any).catalogResults())).toHaveLength(3);
  });

  it('does not throw when courses are missing category/languages (stale API)', async () => {
    await TestBed.configureTestingModule({
      imports: [CoursesPage],
      providers: [provideRouter([]), { provide: APP_BASE_HREF, useValue: '/' }],
    }).compileComponents();

    const fixture = TestBed.createComponent(CoursesPage);
    const ref = fixture.componentRef;
    // A course shaped like an older API response: no category/languages fields.
    const legacy = { ...makeCourse({ id: 'legacy', level: undefined as unknown as string }) } as Record<
      string,
      unknown
    >;
    delete legacy['category'];
    delete legacy['languages'];

    ref.setInput('appVersion', '0.0.0');
    ref.setInput('currentYear', 2026);
    ref.setInput('student', { name: 'Alex', currentRole: '', targetRole: '', pathProgress: 0 });
    ref.setInput('userEmail', 'alex@example.com');
    ref.setInput('userRoleLabel', 'Student');
    ref.setInput('canAccessAdmin', false);
    ref.setInput('courses', [legacy as unknown as CourseListItem]);
    ref.setInput('coursesLoading', false);
    ref.setInput('coursesError', '');
    ref.setInput('canCreateCourses', false);
    ref.setInput('isFeedbackOpen', false);
    ref.setInput('feedbackSubmitted', false);
    ref.setInput('feedbackPage', 'courses');
    ref.setInput('feedbackRating', '');
    ref.setInput('feedbackText', '');
    ref.setInput('feedbackSubmitting', false);
    ref.setInput('feedbackError', '');
    ref.setInput('feedbackOptions', []);

    expect(() => fixture.detectChanges()).not.toThrow();

    const component = fixture.componentInstance as any;
    expect(component.languageFacets()).toEqual([]);
    expect(component.categoryFacets().map((facet: { value: string }) => facet.value)).toEqual([
      'Uncategorized',
    ]);
    expect(ids(component.catalogResults())).toEqual(['legacy']);
  });

  it('advances and retreats the featured carousel one card at a time', async () => {
    // Six published courses with distinct ratings for a stable popularity order.
    const many = Array.from({ length: 6 }, (_, i) =>
      makeCourse({ id: `c${i}`, title: `Course ${i}`, rating: 5 - i * 0.1, ratingCount: 100 - i }),
    );
    const { component, fixture } = await createPage(many);
    const c = component as any;

    const order: string[] = c.featuredCourses().map((x: CourseListItem) => x.id);
    expect(order).toHaveLength(6);

    const window = () => c.visibleFeaturedCourses().map((x: CourseListItem) => x.id);
    expect(window()).toEqual(order.slice(0, 4));

    // Forward: shifts by exactly one, not jumping to the end.
    c.advanceCarousel();
    fixture.detectChanges();
    expect(window()).toEqual(order.slice(1, 5));

    c.advanceCarousel();
    fixture.detectChanges();
    expect(window()).toEqual(order.slice(2, 6));

    // At the end (maxStart = 6 - 4 = 2): no further advance.
    expect(c.canAdvanceCarousel()).toBe(false);
    c.advanceCarousel();
    fixture.detectChanges();
    expect(window()).toEqual(order.slice(2, 6));

    // Back: one card at a time.
    c.retreatCarousel();
    fixture.detectChanges();
    expect(window()).toEqual(order.slice(1, 5));
  });

  it('syncs active filters to the URL query params', async () => {
    const { component, fixture } = await createPage();
    const router = TestBed.inject(Router);

    (component as any).toggleCategory('API Testing', true);
    (component as any).setSort('newest');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(router.url).toContain('category=API%20Testing');
    expect(router.url).toContain('sort=newest');
  });
});
