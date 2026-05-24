import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CourseListItem, FeedbackOption, StudentSummary } from '../../app.models';
import { ApiClientService } from '../../services/api-client.service';
import { AppButton } from '../../ui/app-button/app-button';
import { FeedbackDialog } from '../../ui/feedback-dialog/feedback-dialog';
import { LoadingSkeleton } from '../../ui/loading-skeleton/loading-skeleton';
import { PageHeader } from '../../ui/page-header/page-header';

type CourseCollectionTab = 'popular' | 'newest';
type CourseCatalogView = 'published' | 'drafts';

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

    return items.sort((left, right) => {
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
    });
  });

  protected readonly visibleFeaturedCourses = computed(() => {
    const items = this.featuredCourses();

    if (items.length <= 4) {
      return items;
    }

    const start = this.carouselStart() % items.length;
    const visible = items.slice(start, start + 4);

    if (visible.length === 4) {
      return visible;
    }

    return [...visible, ...items.slice(0, 4 - visible.length)];
  });

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
    const items = this.featuredCourses();

    if (items.length <= 4) {
      return;
    }

    this.carouselStart.update((value) => (value + 3) % items.length);
  }

  protected thumbnailUrl(course: CourseListItem): string {
    if (!course.thumbnailAssetId) {
      return '';
    }

    return this.apiClient.resourceUrl(
      `/courses/${encodeURIComponent(course.id)}/thumbnail?v=${encodeURIComponent(course.thumbnailAssetId)}`,
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

  protected teacherInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }
}
