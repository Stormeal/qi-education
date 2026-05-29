import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { lucideChevronLeft, lucideChevronRight } from '@ng-icons/lucide';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  COURSE_CATEGORIES,
  COURSE_LANGUAGES,
  CourseCategory,
  CourseLanguage,
  CourseListItem,
  FeedbackOption,
  StudentSummary,
} from '../../app.models';
import { ApiClientService } from '../../services/api-client.service';
import { CourseService } from '../../services/course.service';
import { AppButton } from '../../ui/app-button/app-button';
import { FeedbackDialog } from '../../ui/feedback-dialog/feedback-dialog';
import { LoadingSkeleton } from '../../ui/loading-skeleton/loading-skeleton';
import { PageHeader } from '../../ui/page-header/page-header';

type CourseCollectionTab = 'popular' | 'newest';
type CourseCatalogView = 'published' | 'drafts';
type CatalogSort = 'popular' | 'newest' | 'rating' | 'price-asc' | 'price-desc';

type FacetCount = {
  value: string;
  count: number;
};

type RatingFilterOption = {
  value: number;
  label: string;
};

type PopularInstructorCard = {
  name: string;
  topics: string[];
  rating: number;
  ratingCount: number;
  coursesCount: number;
};

@Component({
  selector: 'app-courses-page',
  imports: [AppButton, FeedbackDialog, LoadingSkeleton, PageHeader, RouterLink],
  templateUrl: './courses-page.html',
  styleUrls: ['../../app.scss', './courses-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoursesPage {
  private readonly apiClient = inject(ApiClientService);
  private readonly courseService = inject(CourseService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly carouselPreviousIcon = this.asSafeIcon(lucideChevronLeft);
  protected readonly carouselNextIcon = this.asSafeIcon(lucideChevronRight);

  readonly appVersion = input.required<string>();
  readonly currentYear = input.required<number>();
  readonly student = input.required<StudentSummary>();
  readonly userEmail = input.required<string>();
  readonly userRoleLabel = input.required<string>();
  readonly canAccessAdmin = input.required<boolean>();
  readonly courses = input.required<CourseListItem[]>();
  readonly coursesLoading = input.required<boolean>();
  readonly coursesError = input.required<string>();
  readonly canCreateCourses = input.required<boolean>();
  readonly isFeedbackOpen = input.required<boolean>();
  readonly feedbackSubmitted = input.required<boolean>();
  readonly feedbackPage = input.required<string>();
  readonly feedbackRating = input.required<string>();
  readonly feedbackText = input.required<string>();
  readonly feedbackSubmitting = input.required<boolean>();
  readonly feedbackError = input.required<string>();
  readonly feedbackOptions = input.required<FeedbackOption[]>();

  readonly homeClicked = output<void>();
  readonly coursesClicked = output<void>();
  readonly libraryClicked = output<void>();
  readonly feedbackOpened = output<void>();
  readonly loggedOut = output<void>();
  readonly createCourseOpened = output<void>();
  readonly feedbackClosed = output<void>();
  readonly feedbackRatingSelected = output<string>();
  readonly feedbackTextChanged = output<string>();
  readonly feedbackSubmittedClicked = output<void>();
  readonly adminClicked = output<void>();

  protected readonly activeView = signal<CourseCatalogView>('published');
  protected readonly activeCollection = signal<CourseCollectionTab>('popular');
  protected readonly carouselStart = signal(0);
  protected readonly carouselMotion = signal<'next' | 'previous' | ''>('');
  protected readonly loadedThumbnailIds = signal<Record<string, boolean>>({});
  protected readonly thumbnailsReady = signal(false);
  private carouselMotionTimeout: number | null = null;

  // Browse-all filter state (synced to URL query params).
  protected readonly searchQuery = signal('');
  protected readonly selectedCategories = signal<string[]>([]);
  protected readonly selectedLevels = signal<string[]>([]);
  protected readonly selectedLanguage = signal<string>('');
  protected readonly minRating = signal(0);
  protected readonly priceMin = signal<number | null>(null);
  protected readonly priceMax = signal<number | null>(null);
  protected readonly sortBy = signal<CatalogSort>('popular');
  protected readonly filtersOpen = signal(false);

  protected readonly categoryOptions = COURSE_CATEGORIES;
  protected readonly languageOptions = COURSE_LANGUAGES;
  private readonly knownLevels = ['Beginner', 'Intermediate', 'Advanced'];
  protected readonly ratingOptions: RatingFilterOption[] = [
    { value: 4.5, label: '4.5 & up' },
    { value: 4, label: '4.0 & up' },
    { value: 3.5, label: '3.5 & up' },
    { value: 3, label: '3.0 & up' },
  ];
  protected readonly sortOptions: { value: CatalogSort; label: string }[] = [
    { value: 'popular', label: 'Most popular' },
    { value: 'newest', label: 'Newest' },
    { value: 'rating', label: 'Highest rated' },
    { value: 'price-asc', label: 'Price: low to high' },
    { value: 'price-desc', label: 'Price: high to low' },
  ];
  private readonly catalogSortValues: CatalogSort[] = [
    'popular',
    'newest',
    'rating',
    'price-asc',
    'price-desc',
  ];
  protected readonly popularTopics = [
    'Microsoft Playwright',
    'AI Agents & Agentic AI',
    'Selenium WebDriver',
    'Postman',
    'Java',
    'Software testing',
    'ISTQB Certified Tester Foundation Level (CTFL)',
    'Automation testing',
    'pytest',
    'Artificial Intelligence (AI)',
  ];

  constructor() {
    effect(() => {
      if (this.coursesLoading() || this.coursesError()) {
        return;
      }

      this.thumbnailsReady.set(false);
      this.courseService
        .preloadCourseThumbnails(this.visibleFeaturedCourses())
        .then(() => this.thumbnailsReady.set(true));
    });

    this.readFiltersFromUrl();

    effect(() => {
      const queryParams = {
        q: this.searchQuery() || null,
        category: this.selectedCategories().length ? this.selectedCategories().join(',') : null,
        level: this.selectedLevels().length ? this.selectedLevels().join(',') : null,
        lang: this.selectedLanguage() || null,
        rating: this.minRating() > 0 ? String(this.minRating()) : null,
        priceMin: this.priceMin() !== null ? String(this.priceMin()) : null,
        priceMax: this.priceMax() !== null ? String(this.priceMax()) : null,
        sort: this.sortBy() !== 'popular' ? this.sortBy() : null,
      };

      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams,
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });
  }

  protected readonly creatorCourses = computed(() =>
    this.courses().filter((course) => course.teacher.trim() === this.student().name.trim()),
  );

  protected readonly hasCreatorCourses = computed(() => this.creatorCourses().length > 0);

  protected readonly visibleCourses = computed(() => {
    if (this.activeView() === 'drafts') {
      return this.creatorCourses().filter((course) => course.status !== 'published');
    }

    return this.courses().filter((course) => course.status === 'published');
  });

  protected readonly featuredCourses = computed(() => {
    const items = [...this.visibleCourses()];

    if (this.activeCollection() === 'newest') {
      return items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    }

    return items.sort((left, right) => this.comparePopular(left, right));
  });

  protected readonly visibleFeaturedCourses = computed(() => {
    const items = this.featuredCourses();

    if (items.length <= 4) {
      return items;
    }

    return items.slice(this.currentCarouselStart(), this.currentCarouselStart() + 4);
  });

  protected readonly canRetreatCarousel = computed(() => this.currentCarouselStart() > 0);

  protected readonly canAdvanceCarousel = computed(
    () => this.currentCarouselStart() < this.maxCarouselStart(),
  );

  protected readonly popularInstructors = computed<PopularInstructorCard[]>(() => {
    const grouped = new Map<
      string,
      { topics: Set<string>; weightedRating: number; ratingCount: number; coursesCount: number }
    >();

    for (const course of this.courses().filter((item) => item.status === 'published')) {
      const existing = grouped.get(course.teacher) ?? {
        topics: new Set<string>(),
        weightedRating: 0,
        ratingCount: 0,
        coursesCount: 0,
      };

      existing.coursesCount += 1;
      existing.ratingCount += course.ratingCount;
      existing.weightedRating += course.rating * course.ratingCount;

      if (course.partOfCareer) {
        existing.topics.add(course.partOfCareer);
      }

      for (const goal of course.careerGoals) {
        existing.topics.add(goal);
      }

      grouped.set(course.teacher, existing);
    }

    return [...grouped.entries()]
      .map(([name, value]) => ({
        name,
        topics: [...value.topics].slice(0, 2),
        rating: value.ratingCount > 0 ? Math.round((value.weightedRating / value.ratingCount) * 10) / 10 : 0,
        ratingCount: value.ratingCount,
        coursesCount: value.coursesCount,
      }))
      .sort((left, right) => {
        if (left.rating !== right.rating) {
          return right.rating - left.rating;
        }

        if (left.ratingCount !== right.ratingCount) {
          return right.ratingCount - left.ratingCount;
        }

        return right.coursesCount - left.coursesCount;
      })
      .slice(0, 4);
  });

  protected setCollection(tab: CourseCollectionTab): void {
    if (this.activeCollection() === tab) {
      return;
    }

    this.activeCollection.set(tab);
    this.carouselStart.set(0);
  }

  protected setView(view: CourseCatalogView): void {
    if (this.activeView() === view) {
      return;
    }

    this.activeView.set(view);
    this.carouselStart.set(0);
  }

  protected advanceCarousel(): void {
    const maxStart = this.maxCarouselStart();
    const nextStart = Math.min(this.currentCarouselStart() + 4, maxStart);

    if (nextStart === this.currentCarouselStart()) {
      return;
    }

    this.setCarouselMotion('next');
    this.carouselStart.set(nextStart);
  }

  protected retreatCarousel(): void {
    const nextStart = Math.max(this.currentCarouselStart() - 4, 0);

    if (nextStart === this.currentCarouselStart()) {
      return;
    }

    this.setCarouselMotion('previous');
    this.carouselStart.set(nextStart);
  }

  protected thumbnailUrl(course: CourseListItem): string {
    if (!course.thumbnailAssetId) {
      return '';
    }

    return this.apiClient.resourceUrl(
      `/courses/${encodeURIComponent(course.id)}/thumbnail?v=${encodeURIComponent(course.thumbnailAssetId)}`,
    );
  }

  protected isThumbnailLoaded(courseId: string): boolean {
    return this.loadedThumbnailIds()[courseId] ?? false;
  }

  protected markThumbnailLoaded(courseId: string): void {
    this.loadedThumbnailIds.update((loaded) =>
      loaded[courseId] ? loaded : { ...loaded, [courseId]: true },
    );
  }

  protected ratingLabel(value: number): string {
    return value.toFixed(1);
  }

  protected ratingCountLabel(value: number): string {
    return `${new Intl.NumberFormat('en-US').format(value)} ratings`;
  }

  protected instructorMetaLabel(value: PopularInstructorCard): string {
    return value.topics.length > 0 ? value.topics.join(', ') : 'Course instructor';
  }

  protected coursePriceLabel(priceDkk: number | null): string {
    if (priceDkk === null) {
      return 'Free';
    }

    return `${new Intl.NumberFormat('da-DK').format(priceDkk)} DKK`;
  }

  protected controlValue(event: Event): string {
    const control = event.target;
    return control instanceof HTMLInputElement || control instanceof HTMLSelectElement
      ? control.value
      : '';
  }

  protected controlChecked(event: Event): boolean {
    const control = event.target;
    return control instanceof HTMLInputElement ? control.checked : false;
  }

  protected teacherInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }

  // --- Browse-all filtering ------------------------------------------------

  protected readonly catalogCourses = computed(() =>
    this.courses().filter((course) => course.status === 'published'),
  );

  protected readonly priceCeiling = computed(() => {
    const max = this.catalogCourses().reduce(
      (highest, course) => Math.max(highest, course.priceDkk ?? 0),
      0,
    );

    return max <= 0 ? 2000 : Math.ceil(max / 100) * 100;
  });

  protected readonly effectivePriceMin = computed(() => this.priceMin() ?? 0);
  protected readonly effectivePriceMax = computed(() => this.priceMax() ?? this.priceCeiling());

  protected readonly categoryFacets = computed<FacetCount[]>(() => {
    const counts = new Map<string, number>();

    for (const course of this.catalogCourses()) {
      const category = course.category ?? 'Uncategorized';
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }

    return COURSE_CATEGORIES.filter((category) => counts.has(category)).map((category) => ({
      value: category,
      count: counts.get(category) ?? 0,
    }));
  });

  protected readonly levelFacets = computed<FacetCount[]>(() => {
    const counts = new Map<string, number>();

    for (const course of this.catalogCourses()) {
      const level = this.normalizeLevel(course.level);
      counts.set(level, (counts.get(level) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((left, right) => this.levelOrder(left.value) - this.levelOrder(right.value));
  });

  protected readonly languageFacets = computed<string[]>(() => {
    const present = new Set<string>();

    for (const course of this.catalogCourses()) {
      for (const language of course.languages ?? []) {
        present.add(language);
      }
    }

    return COURSE_LANGUAGES.filter((language) => present.has(language));
  });

  protected readonly filteredCatalogCourses = computed(() => {
    const terms = this.searchQuery().trim().toLowerCase().split(/\s+/).filter(Boolean);
    const categories = this.selectedCategories();
    const levels = this.selectedLevels();
    const language = this.selectedLanguage();
    const minRating = this.minRating();
    const priceMin = this.effectivePriceMin();
    const priceMax = this.effectivePriceMax();

    return this.catalogCourses().filter((course) => {
      if (categories.length > 0 && !categories.includes(course.category ?? 'Uncategorized')) {
        return false;
      }

      if (levels.length > 0 && !levels.includes(this.normalizeLevel(course.level))) {
        return false;
      }

      if (language && !(course.languages ?? []).includes(language as CourseLanguage)) {
        return false;
      }

      if (course.rating < minRating) {
        return false;
      }

      const price = course.priceDkk ?? 0;
      if (price < priceMin || price > priceMax) {
        return false;
      }

      if (terms.length > 0) {
        const haystack = [course.title, course.teacher, course.partOfCareer, ...course.careerGoals]
          .join(' ')
          .toLowerCase();

        if (!terms.every((term) => haystack.includes(term))) {
          return false;
        }
      }

      return true;
    });
  });

  protected readonly catalogResults = computed(() => {
    const items = [...this.filteredCatalogCourses()];

    switch (this.sortBy()) {
      case 'newest':
        return items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      case 'rating':
        return items.sort(
          (left, right) => right.rating - left.rating || right.ratingCount - left.ratingCount,
        );
      case 'price-asc':
        return items.sort((left, right) => (left.priceDkk ?? 0) - (right.priceDkk ?? 0));
      case 'price-desc':
        return items.sort((left, right) => (right.priceDkk ?? 0) - (left.priceDkk ?? 0));
      default:
        return items.sort((left, right) => this.comparePopular(left, right));
    }
  });

  protected readonly catalogResultCount = computed(() => this.catalogResults().length);

  protected readonly activeFilterCount = computed(() => {
    let count = 0;

    if (this.searchQuery().trim()) count += 1;
    count += this.selectedCategories().length;
    count += this.selectedLevels().length;
    if (this.selectedLanguage()) count += 1;
    if (this.minRating() > 0) count += 1;
    if (this.priceMin() !== null || this.priceMax() !== null) count += 1;

    return count;
  });

  protected readonly hasActiveFilters = computed(() => this.activeFilterCount() > 0);

  protected updateSearchQuery(value: string): void {
    this.searchQuery.set(value);
  }

  protected isCategorySelected(value: string): boolean {
    return this.selectedCategories().includes(value);
  }

  protected toggleCategory(value: string, selected: boolean): void {
    this.selectedCategories.update((categories) =>
      selected
        ? categories.includes(value)
          ? categories
          : [...categories, value]
        : categories.filter((entry) => entry !== value),
    );
  }

  protected isLevelSelected(value: string): boolean {
    return this.selectedLevels().includes(value);
  }

  protected toggleLevel(value: string, selected: boolean): void {
    this.selectedLevels.update((levels) =>
      selected
        ? levels.includes(value)
          ? levels
          : [...levels, value]
        : levels.filter((entry) => entry !== value),
    );
  }

  protected setLanguage(value: string): void {
    this.selectedLanguage.set(COURSE_LANGUAGES.includes(value as CourseLanguage) ? value : '');
  }

  protected setMinRating(value: number): void {
    this.minRating.set(this.minRating() === value ? 0 : value);
  }

  protected updatePriceMin(value: string): void {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return;
    }

    const clamped = Math.min(Math.max(parsed, 0), this.effectivePriceMax());
    this.priceMin.set(clamped);
  }

  protected updatePriceMax(value: string): void {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return;
    }

    const clamped = Math.max(Math.min(parsed, this.priceCeiling()), this.effectivePriceMin());
    this.priceMax.set(clamped);
  }

  protected setSort(value: string): void {
    if (this.catalogSortValues.includes(value as CatalogSort)) {
      this.sortBy.set(value as CatalogSort);
    }
  }

  protected toggleFilters(): void {
    this.filtersOpen.update((open) => !open);
  }

  protected clearAllFilters(): void {
    this.searchQuery.set('');
    this.selectedCategories.set([]);
    this.selectedLevels.set([]);
    this.selectedLanguage.set('');
    this.minRating.set(0);
    this.priceMin.set(null);
    this.priceMax.set(null);
  }

  protected resultCountLabel(value: number): string {
    return `${new Intl.NumberFormat('en-US').format(value)} ${value === 1 ? 'result' : 'results'}`;
  }

  protected normalizeLevel(level: string | null | undefined): string {
    const trimmed = (level ?? '').trim();
    if (!trimmed) {
      return 'Unspecified';
    }

    return this.knownLevels.find((known) => known.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
  }

  private levelOrder(level: string): number {
    const index = this.knownLevels.indexOf(level);
    return index < 0 ? this.knownLevels.length : index;
  }

  private comparePopular(left: CourseListItem, right: CourseListItem): number {
    if (left.isPremium !== right.isPremium) {
      return Number(right.isPremium) - Number(left.isPremium);
    }

    if (left.isBestseller !== right.isBestseller) {
      return Number(right.isBestseller) - Number(left.isBestseller);
    }

    if (left.rating !== right.rating) {
      return right.rating - left.rating;
    }

    if (left.ratingCount !== right.ratingCount) {
      return right.ratingCount - left.ratingCount;
    }

    return right.createdAt.localeCompare(left.createdAt);
  }

  private readFiltersFromUrl(): void {
    const params = this.route.snapshot.queryParamMap;

    this.searchQuery.set(params.get('q') ?? '');
    this.selectedCategories.set(
      this.parseList(params.get('category')).filter((value) =>
        COURSE_CATEGORIES.includes(value as CourseCategory),
      ),
    );
    this.selectedLevels.set(this.parseList(params.get('level')));

    const language = params.get('lang') ?? '';
    this.selectedLanguage.set(COURSE_LANGUAGES.includes(language as CourseLanguage) ? language : '');

    const rating = Number.parseFloat(params.get('rating') ?? '');
    this.minRating.set(Number.isFinite(rating) && rating > 0 ? rating : 0);

    const min = Number.parseInt(params.get('priceMin') ?? '', 10);
    this.priceMin.set(Number.isFinite(min) ? min : null);

    const max = Number.parseInt(params.get('priceMax') ?? '', 10);
    this.priceMax.set(Number.isFinite(max) ? max : null);

    const sort = params.get('sort') ?? '';
    this.sortBy.set(this.catalogSortValues.includes(sort as CatalogSort) ? (sort as CatalogSort) : 'popular');
  }

  private parseList(value: string | null): string[] {
    return value
      ? value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];
  }

  private currentCarouselStart(): number {
    return Math.min(this.carouselStart(), this.maxCarouselStart());
  }

  private maxCarouselStart(): number {
    return Math.max(this.featuredCourses().length - 4, 0);
  }

  private asSafeIcon(svg: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  private setCarouselMotion(direction: 'next' | 'previous'): void {
    if (this.carouselMotionTimeout !== null) {
      window.clearTimeout(this.carouselMotionTimeout);
    }

    this.carouselMotion.set('');
    window.requestAnimationFrame(() => {
      this.carouselMotion.set(direction);
      this.carouselMotionTimeout = window.setTimeout(() => {
        this.carouselMotion.set('');
        this.carouselMotionTimeout = null;
      }, 360);
    });
  }
}
