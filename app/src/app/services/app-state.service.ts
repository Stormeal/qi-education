import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import {
  CourseComponentType,
  CourseSection,
  CourseContentDocument,
  CourseCreateDraft,
  CourseListItem,
  CourseSummary,
  FeedbackEntry,
  FeedbackOption,
  FeedbackTriageUpdate,
  LoginState,
  NextAction,
  UserRole,
} from '../app.models';
import { AuthService } from './auth.service';
import { CourseService } from './course.service';
import { FeedbackService } from './feedback.service';
import { SessionService } from './session.service';

@Injectable({ providedIn: 'root' })
export class AppStateService {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly courseService = inject(CourseService);
  private readonly feedbackService = inject(FeedbackService);
  private readonly sessionService = inject(SessionService);

  readonly appVersion = '0.1.19';
  readonly currentYear = new Date().getFullYear();

  readonly email = signal('');
  readonly password = signal('');
  readonly rememberMe = signal(true);
  readonly passwordVisible = signal(false);
  readonly isSubmitting = signal(false);
  readonly isSessionRestoring = signal(false);
  readonly loginError = signal('');
  readonly loginState = signal<LoginState | null>(this.sessionService.restoreLoginState());
  readonly currentPath = signal(this.normalizePath(this.router.url));

  readonly isFeedbackOpen = signal(false);
  readonly feedbackPage = signal('');
  readonly feedbackRating = signal('great');
  readonly feedbackText = signal('');
  readonly feedbackSubmitted = signal(false);
  readonly feedbackSubmitting = signal(false);
  readonly feedbackError = signal('');
  readonly coursesLoading = signal(false);
  readonly coursesError = signal('');
  readonly availableCourses = signal<CourseListItem[]>([]);
  readonly adminFeedbackLoading = signal(false);
  readonly adminFeedbackError = signal('');
  readonly adminFeedback = signal<FeedbackEntry[]>([]);
  readonly adminFeedbackSaving = signal(false);
  readonly courseSubmitting = signal(false);
  readonly courseCreateError = signal('');
  readonly courseSaveNotice = signal('');
  readonly courseContentLoading = signal(false);
  readonly courseContentSaving = signal(false);
  readonly courseContentError = signal('');
  readonly coursePriceSaving = signal(false);
  readonly coursePriceNotice = signal('');
  readonly coursePriceNoticeError = signal(false);
  readonly courseContent = signal<CourseContentDocument | null>(null);
  readonly initialCourseDraftSnapshot = signal('');
  readonly initialCourseContentSnapshot = signal('');
  readonly courseDraft = signal<CourseCreateDraft>({
    title: '',
    description: '',
    requirements: '',
    whatYoullLearn: '',
    audience: '',
    level: '',
    partOfCareer: '',
    teacher: '',
    careerGoals: '',
    status: 'draft',
    priceDkk: null,
  });

  readonly canSubmit = computed(
    () =>
      this.email().trim().length > 0 && this.password().trim().length > 0 && !this.isSubmitting(),
  );

  readonly feedbackOptions: FeedbackOption[] = [
    { value: 'great', icon: ':)', label: 'Great' },
    { value: 'okay', icon: ':|', label: 'Okay' },
    { value: 'needs-work', icon: ':(', label: 'Bad' },
  ];

  readonly learningHighlights = [
    'Career paths for manual, agile, and advanced testing roles.',
    'Structured courses built around ISTQB and practical training.',
    'One place for learning progress, certifications, and follow-up.',
  ];

  readonly student = computed(() => ({
    name: this.loginState()?.user.displayName || 'Alex',
    currentRole: this.currentRoleLabel(this.loginState()?.user.role),
    targetRole: this.targetRoleLabel(this.loginState()?.user.role),
    pathProgress: this.pathProgressValue(this.loginState()?.user.role),
  }));

  readonly courses = signal<CourseSummary[]>([
    {
      title: 'ISTQB Foundation 4.0',
      teacher: 'Testhuset',
      level: 'Foundation',
      status: 'In progress',
      progress: 62,
      nextLesson: 'Test techniques overview',
      goals: ['Core testing', 'Certification'],
    },
    {
      title: 'Agile Tester Extension',
      teacher: 'Testhuset',
      level: 'Specialist',
      status: 'Recommended',
      progress: 0,
      nextLesson: 'Agile testing mindset',
      goals: ['Agile projects', 'Team quality'],
    },
    {
      title: 'Test Management Basics',
      teacher: 'Testhuset',
      level: 'Management',
      status: 'Recommended',
      progress: 0,
      nextLesson: 'Planning risk-based test work',
      goals: ['Risk', 'Leadership'],
    },
  ]);

  readonly nextActions = computed<NextAction[]>(() => {
    const role = this.loginState()?.user.role;
    const roleSpecificAction: NextAction =
      role === 'admin'
        ? {
            title: 'Review platform administration',
            chapter: 'Admin',
            meta: 'Check user roles, access levels, and learning operations.',
            state: 'next',
            progress: 0,
          }
        : role === 'teacher'
          ? {
              title: 'Create a new course draft',
              chapter: 'Teacher tools',
              meta: 'Build the next Testhuset learning module.',
              state: 'next',
              progress: 0,
            }
          : {
              title: 'Pick a specialization track',
              chapter: 'Next step',
              meta: 'Agile, technical, or management.',
              state: 'next',
              progress: 0,
            };

    return [
      {
        title: 'Test analysis and design',
        chapter: 'Chapter 3',
        meta: 'Finished before the current chapter.',
        state: 'complete',
        progress: 100,
      },
      {
        title: 'Test design techniques',
        chapter: 'Chapter 4',
        meta: 'Current chapter in ISTQB Foundation 4.0.',
        state: 'current',
        progress: 62,
      },
      roleSpecificAction,
    ];
  });

  readonly activeCourse = computed(
    () => this.courses().find((course) => course.status === 'In progress') ?? this.courses()[0],
  );

  readonly isCoursesPage = computed(() => this.currentPath() === '/courses');
  readonly isCourseEditorPage = computed(() => {
    const path = this.currentPath();

    return path === '/courses/new' || /^\/courses\/[^/]+\/edit$/.test(path);
  });
  readonly isCourseViewPage = computed(
    () => this.courseViewIdFromPath(this.currentPath()) !== null,
  );
  readonly selectedCourse = computed(() => {
    const courseId = this.courseViewIdFromPath(this.currentPath());

    return courseId
      ? (this.availableCourses().find((course) => course.id === courseId) ?? null)
      : null;
  });
  readonly isAdminPage = computed(
    () => this.currentPath() === '/admin' && !!this.loginState()?.permissions.hasAdminAccess,
  );
  readonly courseFormMode = computed<'create' | 'edit'>(() => {
    const path = this.currentPath();

    if (path === '/courses/new') {
      return 'create';
    }

    return this.isCourseEditPath(path) ? 'edit' : 'create';
  });
  readonly courseEditingId = computed(() => this.courseEditIdFromPath(this.currentPath()));
  readonly courseContentId = computed(() => {
    const editId = this.courseEditingId();

    if (editId) {
      return editId;
    }

    return this.courseViewIdFromPath(this.currentPath());
  });
  readonly loadedCourseContentId = signal<string | null>(null);
  private courseSaveNoticeTimeout: ReturnType<typeof setTimeout> | null = null;
  private coursePriceNoticeTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly recommendedCourses = computed(() =>
    this.courses().filter((course) => course.status === 'Recommended'),
  );

  constructor() {
    this.sessionService.onUnauthorized(() => {
      this.loginState.set(null);
      this.password.set('');
      this.loginError.set('Please log in again.');
      this.isFeedbackOpen.set(false);
      void this.navigateHome();
    });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        this.currentPath.set(this.normalizePath(event.urlAfterRedirects));
        this.syncCourseEditorDraftFromPath();
        void this.loadCoursesWhenNeeded();
        void this.loadCourseContentWhenNeeded();
        void this.loadAdminFeedbackWhenNeeded();
      });

    this.syncCourseEditorDraftFromPath();
    this.restoreStoredSession();
  }

  updateEmail(value: string): void {
    this.email.set(value);
    this.loginError.set('');
  }

  updatePassword(value: string): void {
    this.password.set(value);
    this.loginError.set('');
  }

  toggleRememberMe(): void {
    this.rememberMe.update((value) => !value);
  }

  togglePasswordVisibility(): void {
    this.passwordVisible.update((value) => !value);
  }

  async submitLogin(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }

    this.isSubmitting.set(true);
    this.loginError.set('');

    try {
      const result = await this.authService.login(this.email(), this.password());

      if (!result.ok) {
        this.loginState.set(null);
        this.sessionService.clearStoredSession();
        this.loginError.set(result.message);
        return;
      }

      const login = result.login;
      this.loginState.set({
        token: login.token,
        user: login.user,
        permissions: login.permissions,
      });
      this.sessionService.storeSession(login, this.rememberMe());
      this.password.set('');
      this.feedbackSubmitted.set(false);
      this.loadCoursesWhenNeeded();
      this.loadAdminFeedbackWhenNeeded();
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch {
      this.loginState.set(null);
      this.sessionService.clearStoredSession();
      this.loginError.set('Unable to reach the API. Please try again shortly.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  logout(): void {
    this.loginState.set(null);
    this.password.set('');
    this.loginError.set('');
    this.isFeedbackOpen.set(false);
    this.courseCreateError.set('');
    this.courseContentError.set('');
    this.courseContent.set(null);
    this.loadedCourseContentId.set(null);
    this.initialCourseDraftSnapshot.set('');
    this.initialCourseContentSnapshot.set('');
    this.courseDraft.set(this.createCourseDraft());
    this.adminFeedback.set([]);
    this.adminFeedbackError.set('');
    this.sessionService.clearStoredSession();
    void this.navigateHome();
  }

  private async restoreStoredSession(): Promise<void> {
    const restoredSession = this.loginState();

    if (!restoredSession?.token) {
      return;
    }

    this.isSessionRestoring.set(true);

    try {
      const restored = await this.authService.restoreSession(restoredSession.token);

      if (!restored) {
        this.loginState.set(null);
        this.sessionService.clearStoredSession();
        return;
      }

      this.loginState.set({
        token: restoredSession.token,
        user: restored.user,
        permissions: restored.permissions,
      });
      this.loadCoursesWhenNeeded();
      this.loadAdminFeedbackWhenNeeded();
    } catch {
      this.loginState.set(null);
      this.sessionService.clearStoredSession();
    } finally {
      this.isSessionRestoring.set(false);
    }
  }

  navigateHome(): void {
    this.updatePath('/');
  }

  navigateCourses(): void {
    this.updatePath('/courses');
  }

  openCourse(courseId: string): void {
    this.updatePath(`/courses/${encodeURIComponent(courseId)}`);
  }

  navigateAdmin(): void {
    if (!this.loginState()?.permissions.hasAdminAccess) {
      return;
    }

    this.updatePath('/admin');
  }

  openFeedback(): void {
    this.feedbackPage.set(this.currentPageLabel());
    this.feedbackSubmitted.set(false);
    this.feedbackError.set('');
    this.isFeedbackOpen.set(true);
  }

  closeFeedback(): void {
    this.isFeedbackOpen.set(false);
    this.feedbackSubmitting.set(false);
  }

  selectFeedbackRating(rating: string): void {
    this.feedbackRating.set(rating);
  }

  updateFeedbackText(text: string): void {
    this.feedbackText.set(text);
    this.feedbackError.set('');
  }

  async submitFeedback(): Promise<void> {
    if (this.feedbackSubmitting()) {
      return;
    }

    const token = this.loginState()?.token;

    if (!token) {
      this.feedbackError.set('Please log in again before sending feedback.');
      return;
    }

    this.feedbackSubmitting.set(true);
    this.feedbackError.set('');

    try {
      const result = await this.feedbackService.submitFeedback(
        token,
        this.feedbackPage(),
        this.feedbackRating(),
        this.feedbackText(),
      );

      if (!result.ok) {
        this.feedbackError.set(result.message);
        return;
      }

      this.feedbackText.set('');
      this.feedbackSubmitted.set(true);
    } catch {
      this.feedbackError.set('Unable to reach the API. Please try again.');
    } finally {
      this.feedbackSubmitting.set(false);
    }
  }

  openCreateCourse(): void {
    this.clearCourseSaveNotice();
    this.courseDraft.set(this.createCourseDraft());
    this.courseCreateError.set('');
    this.courseContentError.set('');
    this.courseContent.set(null);
    this.loadedCourseContentId.set(null);
    this.initialCourseDraftSnapshot.set(this.serializeCourseDraft(this.courseDraft()));
    this.initialCourseContentSnapshot.set('');
    void this.updatePath('/courses/new');
  }

  cancelCreateCourse(): void {
    if (this.courseSubmitting()) {
      return;
    }

    this.clearCourseSaveNotice();
    this.courseCreateError.set('');
    const courseId = this.courseEditingId();

    if (courseId) {
      this.openCourse(courseId);
      return;
    }

    void this.navigateCourses();
  }

  openEditCourse(courseId: string): void {
    const course = this.availableCourses().find((item) => item.id === courseId);

    if (!course) {
      return;
    }

    this.clearCourseSaveNotice();
    this.courseDraft.set({
      title: course.title,
      description: course.description,
      requirements: this.formatBulletList(course.requirements),
      whatYoullLearn: this.formatBulletList(course.whatYoullLearn),
      audience: course.audience,
      level: course.level,
      partOfCareer: course.partOfCareer,
      teacher: course.teacher,
      careerGoals: course.careerGoals.join(', '),
      status: course.status,
      priceDkk: course.priceDkk,
    });
    this.courseCreateError.set('');
    this.courseContentError.set('');
    this.courseContent.set(null);
    this.loadedCourseContentId.set(null);
    this.initialCourseDraftSnapshot.set(this.serializeCourseDraft(this.courseDraft()));
    this.initialCourseContentSnapshot.set('');
    void this.updatePath(`/courses/${encodeURIComponent(course.id)}/edit`);
  }

  updateCourseTitle(value: string): void {
    this.courseDraft.update((draft) => ({ ...draft, title: value }));
    this.courseCreateError.set('');
  }

  updateCourseDescription(value: string): void {
    this.courseDraft.update((draft) => ({ ...draft, description: value }));
    this.courseCreateError.set('');
  }

  updateCourseRequirements(value: string): void {
    this.courseDraft.update((draft) => ({
      ...draft,
      requirements: this.normalizeBulletListValue(value),
    }));
    this.courseCreateError.set('');
  }

  updateCourseWhatYoullLearn(value: string): void {
    this.courseDraft.update((draft) => ({
      ...draft,
      whatYoullLearn: this.normalizeBulletListValue(value),
    }));
    this.courseCreateError.set('');
  }

  updateCourseAudience(value: string): void {
    this.courseDraft.update((draft) => ({ ...draft, audience: value }));
    this.courseCreateError.set('');
  }

  updateCourseLevel(value: string): void {
    this.courseDraft.update((draft) => ({ ...draft, level: value }));
    this.courseCreateError.set('');
  }

  updateCoursePartOfCareer(value: string): void {
    this.courseDraft.update((draft) => ({ ...draft, partOfCareer: value }));
    this.courseCreateError.set('');
  }

  updateCourseCareerGoals(value: string): void {
    this.courseDraft.update((draft) => ({ ...draft, careerGoals: value }));
    this.courseCreateError.set('');
  }

  updateCourseTeacher(value: string): void {
    this.courseDraft.update((draft) => ({ ...draft, teacher: value }));
    this.courseCreateError.set('');
  }

  updateCourseStatus(value: string): void {
    this.courseDraft.update((draft) => ({
      ...draft,
      status: value as CourseCreateDraft['status'],
    }));
    this.courseCreateError.set('');
  }

  addCourseSection(): void {
    this.courseContent.update((content) =>
      content
        ? {
            ...content,
            sections: [
              ...content.sections,
              {
                id: this.createContentId('section'),
                title: `Chapter ${content.sections.length + 1}`,
                components: [],
              },
            ],
          }
        : content,
    );
    this.courseContentError.set('');
  }

  removeCourseSection(sectionIndex: number): void {
    this.courseContent.update((content) =>
      content
        ? {
            ...content,
            sections: content.sections.filter((_, index) => index !== sectionIndex),
          }
        : content,
    );
    this.courseContentError.set('');
  }

  updateCourseSectionTitle(sectionIndex: number, value: string): void {
    this.courseContent.update((content) =>
      content
        ? {
            ...content,
            sections: content.sections.map((section, index) =>
              index === sectionIndex ? { ...section, title: value } : section,
            ),
          }
        : content,
    );
    this.courseContentError.set('');
  }

  addCourseComponent(sectionIndex: number, type: CourseComponentType): void {
    this.courseContent.update((content) =>
      content
        ? {
            ...content,
            sections: content.sections.map((section, index) =>
              index === sectionIndex
                ? {
                    ...section,
                    components: [
                      ...section.components,
                      {
                        id: this.createContentId('component'),
                        title: `New component ${section.components.length + 1}`,
                        type,
                        durationMinutes: 0,
                        content: '',
                        resourceUrl: '',
                      },
                    ],
                  }
                : section,
            ),
          }
        : content,
    );
    this.courseContentError.set('');
  }

  removeCourseComponent(sectionIndex: number, componentIndex: number): void {
    this.courseContent.update((content) =>
      content
        ? {
            ...content,
            sections: content.sections.map((section, index) =>
              index === sectionIndex
                ? {
                    ...section,
                    components: section.components.filter(
                      (_, currentIndex) => currentIndex !== componentIndex,
                    ),
                  }
                : section,
            ),
          }
        : content,
    );
    this.courseContentError.set('');
  }

  updateCourseComponentTitle(sectionIndex: number, componentIndex: number, value: string): void {
    this.updateCourseComponent(sectionIndex, componentIndex, (component) => ({
      ...component,
      title: value,
    }));
  }

  updateCourseComponentType(sectionIndex: number, componentIndex: number, value: string): void {
    this.updateCourseComponent(sectionIndex, componentIndex, (component) => ({
      ...component,
      type: value as CourseComponentType,
      resourceUrl: value === 'video' ? component.resourceUrl : '',
    }));
  }

  updateCourseComponentDuration(sectionIndex: number, componentIndex: number, value: string): void {
    const parsed = Number.parseInt(value, 10);
    this.updateCourseComponent(sectionIndex, componentIndex, (component) => ({
      ...component,
      durationMinutes: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
    }));
  }

  updateCourseComponentContent(sectionIndex: number, componentIndex: number, value: string): void {
    this.updateCourseComponent(sectionIndex, componentIndex, (component) => ({
      ...component,
      content: value,
    }));
  }

  updateCourseComponentUrl(sectionIndex: number, componentIndex: number, value: string): void {
    this.updateCourseComponent(sectionIndex, componentIndex, (component) => ({
      ...component,
      resourceUrl: value,
    }));
  }

  moveCourseComponent(sectionIndex: number, fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) {
      return;
    }

    this.courseContent.update((content) =>
      content
        ? {
            ...content,
            sections: content.sections.map((section, currentSectionIndex) => {
              if (currentSectionIndex !== sectionIndex) {
                return section;
              }

              const components = [...section.components];
              const [moved] = components.splice(fromIndex, 1);

              if (!moved) {
                return section;
              }

              components.splice(toIndex, 0, moved);
              return {
                ...section,
                components,
              };
            }),
          }
        : content,
    );
    this.courseContentError.set('');
  }

  async submitCourse(): Promise<void> {
    if (this.courseSubmitting()) {
      return;
    }

    const token = this.loginState()?.token;
    const user = this.loginState()?.user;

    if (!token || !user) {
      this.courseCreateError.set('Please log in again before creating a course.');
      return;
    }

    if (!this.loginState()?.permissions.canCreateCourses) {
      this.courseCreateError.set('Teacher or admin access is required.');
      return;
    }

    const draft = this.courseDraft();
    const mode = this.courseFormMode();
    const courseId = this.courseEditingId();
    const content = this.courseContent();
    const metadataChanged =
      mode === 'create' || this.serializeCourseDraft(draft) !== this.initialCourseDraftSnapshot();
    const contentChanged =
      mode === 'edit' &&
      !!courseId &&
      !!content &&
      this.serializeCourseContent(content) !== this.initialCourseContentSnapshot();

    if (!metadataChanged && !contentChanged) {
      return;
    }

    if (mode === 'edit' && !courseId) {
      this.courseCreateError.set('Select a course to edit before saving.');
      return;
    }

    this.courseSubmitting.set(true);
    this.courseContentSaving.set(contentChanged);
    this.courseCreateError.set('');
    this.courseContentError.set('');
    this.clearCourseSaveNotice();

    try {
      let savedCourse: CourseListItem | null = null;

      if (metadataChanged) {
        const result = await this.courseService.saveCourse(
          mode,
          draft,
          token,
          user.displayName,
          courseId,
        );

        if (!result.ok) {
          this.courseCreateError.set(result.message);
          return;
        }

        savedCourse = result.course;

        if (mode === 'edit') {
          this.availableCourses.update((courses) =>
            courses.map((course) => (course.id === result.course.id ? result.course : course)),
          );
        } else {
          this.availableCourses.update((courses) => [result.course, ...courses]);
        }
      }

      const contentCourseId = savedCourse?.id ?? courseId;

      if (contentChanged && contentCourseId && content) {
        const contentResult = await this.courseService.saveCourseContent(
          contentCourseId,
          content.sections,
          token,
        );

        if (!contentResult.ok) {
          this.courseContentError.set(contentResult.message);
          return;
        }

        this.courseContent.set(contentResult.content);
        this.loadedCourseContentId.set(contentResult.content._id);
        this.initialCourseContentSnapshot.set(this.serializeCourseContent(contentResult.content));
      }

      const finalDraft = savedCourse
        ? {
            title: savedCourse.title,
            description: savedCourse.description,
            requirements: this.formatBulletList(savedCourse.requirements),
            whatYoullLearn: this.formatBulletList(savedCourse.whatYoullLearn),
            audience: savedCourse.audience,
            level: savedCourse.level,
            partOfCareer: savedCourse.partOfCareer,
            teacher: savedCourse.teacher,
            careerGoals: savedCourse.careerGoals.join(', '),
            status: savedCourse.status,
            priceDkk: savedCourse.priceDkk,
          }
        : draft;
      this.courseDraft.set(finalDraft);
      this.initialCourseDraftSnapshot.set(this.serializeCourseDraft(finalDraft));
      this.showCourseSaveNotice(this.courseSaveMessage(mode, metadataChanged, contentChanged));

      if (mode === 'create' && savedCourse) {
        void this.updatePath(`/courses/${encodeURIComponent(savedCourse.id)}/edit`);
      }
    } catch {
      if (contentChanged && !metadataChanged) {
        this.courseContentError.set(
          'Unable to reach the API while saving content. Please try again.',
        );
      } else {
        this.courseCreateError.set(
          mode === 'edit'
            ? 'Unable to reach the API while saving. Please try again.'
            : 'Unable to reach the API. Please try again.',
        );
      }
    } finally {
      this.courseSubmitting.set(false);
      this.courseContentSaving.set(false);
    }
  }

  reloadAdminFeedback(): void {
    void this.loadAdminFeedback(true);
  }

  async saveCoursePrice(courseId: string, priceDkk: number | null): Promise<void> {
    const token = this.loginState()?.token;

    if (!token || !this.loginState()?.permissions.hasAdminAccess) {
      return;
    }

    this.coursePriceSaving.set(true);
    this.clearCoursePriceNotice();

    try {
      const result = await this.courseService.saveCoursePrice(courseId, priceDkk, token);

      if (!result.ok) {
        this.showCoursePriceNotice(result.message, true);
        return;
      }

      this.availableCourses.update((courses) =>
        courses.map((course) => (course.id === result.course.id ? result.course : course)),
      );
      this.courseDraft.update((draft) =>
        this.courseEditingId() === result.course.id
          ? { ...draft, priceDkk: result.course.priceDkk }
          : draft,
      );
      this.showCoursePriceNotice('Course price saved.', false);
    } catch {
      this.showCoursePriceNotice('Unable to save course price. Please try again.', true);
    } finally {
      this.coursePriceSaving.set(false);
    }
  }

  async updateAdminFeedbackTriage(update: FeedbackTriageUpdate): Promise<void> {
    const token = this.loginState()?.token;

    if (!token || !this.loginState()?.permissions.hasAdminAccess || this.adminFeedbackSaving()) {
      return;
    }

    const previousFeedback = this.adminFeedback();
    this.adminFeedbackSaving.set(true);
    this.adminFeedbackError.set('');
    this.adminFeedback.update((feedback) =>
      feedback.map((item) =>
        item.id === update.id
          ? { ...item, workStatus: update.workStatus, priority: update.priority }
          : item,
      ),
    );

    try {
      const result = await this.feedbackService.updateTriage(token, update);

      if (!result.ok) {
        this.adminFeedback.set(previousFeedback);
        this.adminFeedbackError.set(result.message);
        return;
      }

      this.adminFeedback.update((feedback) =>
        feedback.map((item) => (item.id === result.feedback.id ? result.feedback : item)),
      );
    } catch {
      this.adminFeedback.set(previousFeedback);
      this.adminFeedbackError.set('Unable to reach the API. Please try again.');
    } finally {
      this.adminFeedbackSaving.set(false);
    }
  }

  private async loadCoursesWhenNeeded(): Promise<void> {
    if (!this.loginState() || !this.currentPath().startsWith('/courses') || this.coursesLoading()) {
      return;
    }

    this.coursesLoading.set(true);
    this.coursesError.set('');

    try {
      this.availableCourses.set(await this.courseService.listCourses());
      this.syncCourseEditorDraftFromPath(true);
      await this.loadCourseContentWhenNeeded();
    } catch (error) {
      this.coursesError.set(
        error instanceof Error ? error.message : 'Unable to reach the API. Please try again.',
      );
    } finally {
      this.coursesLoading.set(false);
    }
  }

  private async loadCourseContentWhenNeeded(): Promise<void> {
    const courseId = this.courseContentId();

    if (!this.loginState() || !courseId) {
      this.courseContent.set(null);
      this.courseContentError.set('');
      this.loadedCourseContentId.set(null);
      this.courseContentLoading.set(false);
      return;
    }

    if (this.courseContentLoading() || this.loadedCourseContentId() === courseId) {
      return;
    }

    this.courseContentLoading.set(true);
    this.courseContentError.set('');

    try {
      const loadedContent = await this.courseService.loadCourseContent(courseId);
      this.courseContent.set(loadedContent);
      this.loadedCourseContentId.set(courseId);
      this.initialCourseContentSnapshot.set(this.serializeCourseContent(loadedContent));
    } catch (error) {
      if (
        (error instanceof Error && error.message === 'Course content not found') ||
        (this.isCourseViewPage() && this.isCourseContentUnavailableError(error))
      ) {
        const emptyContent = this.createEmptyCourseContent(courseId);

        this.courseContent.set(emptyContent);
        this.loadedCourseContentId.set(courseId);
        this.initialCourseContentSnapshot.set(this.serializeCourseContent(emptyContent));
        this.courseContentError.set('');
      } else {
        this.courseContent.set(null);
        this.courseContentError.set(
          error instanceof Error
            ? error.message
            : 'Unable to load course content. Please try again.',
        );
      }
    } finally {
      this.courseContentLoading.set(false);
    }
  }

  private async loadAdminFeedbackWhenNeeded(): Promise<void> {
    if (!this.loginState() || !this.isAdminPage() || this.adminFeedbackLoading()) {
      return;
    }

    await this.loadAdminFeedback(false);
  }

  private async loadAdminFeedback(force: boolean): Promise<void> {
    const token = this.loginState()?.token;

    if (!token || !this.loginState()?.permissions.hasAdminAccess) {
      this.adminFeedbackError.set('Admin access is required.');
      return;
    }

    if (this.adminFeedbackLoading() || (!force && this.adminFeedback().length > 0)) {
      return;
    }

    this.adminFeedbackLoading.set(true);
    this.adminFeedbackError.set('');

    try {
      this.adminFeedback.set(await this.feedbackService.listFeedback(token, force));
    } catch (error) {
      this.adminFeedbackError.set(
        error instanceof Error ? error.message : 'Unable to reach the API. Please try again.',
      );
    } finally {
      this.adminFeedbackLoading.set(false);
    }
  }

  private createCourseDraft(
    displayName = this.loginState()?.user.displayName ?? '',
  ): CourseCreateDraft {
    return {
      title: '',
      description: '',
      requirements: '',
      whatYoullLearn: '',
      audience: '',
      level: '',
      partOfCareer: '',
      teacher: displayName,
      careerGoals: '',
      status: 'draft',
      priceDkk: null,
    };
  }

  private syncCourseEditorDraftFromPath(allowMissingCourseError = false): void {
    const path = this.currentPath();

    if (path === '/courses/new') {
      this.courseCreateError.set('');
      this.courseContentError.set('');
      this.courseContent.set(null);
      this.loadedCourseContentId.set(null);
      this.initialCourseDraftSnapshot.set(this.serializeCourseDraft(this.createCourseDraft()));
      this.initialCourseContentSnapshot.set('');
      this.courseDraft.set(this.createCourseDraft());
      return;
    }

    const editId = this.courseEditIdFromPath(path);

    if (!editId) {
      return;
    }

    const course = this.availableCourses().find((item) => item.id === editId);

    if (!course) {
      if (allowMissingCourseError && !this.coursesLoading()) {
        this.courseCreateError.set('Course not found.');
      }

      return;
    }

    this.courseCreateError.set('');
    this.courseDraft.set({
      title: course.title,
      description: course.description,
      requirements: this.formatBulletList(course.requirements),
      whatYoullLearn: this.formatBulletList(course.whatYoullLearn),
      audience: course.audience,
      level: course.level,
      partOfCareer: course.partOfCareer,
      teacher: course.teacher,
      careerGoals: course.careerGoals.join(', '),
      status: course.status,
      priceDkk: course.priceDkk,
    });
    this.initialCourseDraftSnapshot.set(
      this.serializeCourseDraft({
        title: course.title,
        description: course.description,
        requirements: this.formatBulletList(course.requirements),
        whatYoullLearn: this.formatBulletList(course.whatYoullLearn),
        audience: course.audience,
        level: course.level,
        partOfCareer: course.partOfCareer,
        teacher: course.teacher,
        careerGoals: course.careerGoals.join(', '),
        status: course.status,
        priceDkk: course.priceDkk,
      }),
    );
    if (this.loadedCourseContentId() !== course.id) {
      this.courseContent.set(null);
    }
  }

  private showCourseSaveNotice(message: string): void {
    if (this.courseSaveNoticeTimeout) {
      clearTimeout(this.courseSaveNoticeTimeout);
    }

    this.courseSaveNotice.set(message);
    this.courseSaveNoticeTimeout = setTimeout(() => {
      this.courseSaveNotice.set('');
      this.courseSaveNoticeTimeout = null;
    }, 4000);
  }

  private clearCourseSaveNotice(): void {
    if (this.courseSaveNoticeTimeout) {
      clearTimeout(this.courseSaveNoticeTimeout);
      this.courseSaveNoticeTimeout = null;
    }

    this.courseSaveNotice.set('');
  }

  private showCoursePriceNotice(message: string, isError: boolean): void {
    if (this.coursePriceNoticeTimeout) {
      clearTimeout(this.coursePriceNoticeTimeout);
    }

    this.coursePriceNotice.set(message);
    this.coursePriceNoticeError.set(isError);
    this.coursePriceNoticeTimeout = setTimeout(() => {
      this.coursePriceNotice.set('');
      this.coursePriceNoticeError.set(false);
      this.coursePriceNoticeTimeout = null;
    }, 4000);
  }

  private clearCoursePriceNotice(): void {
    if (this.coursePriceNoticeTimeout) {
      clearTimeout(this.coursePriceNoticeTimeout);
      this.coursePriceNoticeTimeout = null;
    }

    this.coursePriceNotice.set('');
    this.coursePriceNoticeError.set(false);
  }

  private courseSaveMessage(
    mode: 'create' | 'edit',
    metadataChanged: boolean,
    contentChanged: boolean,
  ): string {
    if (mode === 'create') {
      return 'Course created successfully.';
    }

    if (metadataChanged && contentChanged) {
      return 'Course details and content saved.';
    }

    if (metadataChanged) {
      return 'Course details saved.';
    }

    return 'Course content saved.';
  }

  private updateCourseComponent(
    sectionIndex: number,
    componentIndex: number,
    update: (component: CourseSection['components'][number]) => CourseSection['components'][number],
  ): void {
    this.courseContent.update((content) =>
      content
        ? {
            ...content,
            sections: content.sections.map((section, currentSectionIndex) =>
              currentSectionIndex === sectionIndex
                ? {
                    ...section,
                    components: section.components.map((component, currentComponentIndex) =>
                      currentComponentIndex === componentIndex ? update(component) : component,
                    ),
                  }
                : section,
            ),
          }
        : content,
    );
    this.courseContentError.set('');
  }

  private createContentId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private serializeCourseDraft(draft: CourseCreateDraft): string {
    return JSON.stringify(draft);
  }

  private formatBulletList(items: string[]): string {
    return items.map((item) => `• ${item}`).join('\n');
  }

  private normalizeBulletListValue(value: string): string {
    return value
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.replace(/^[•*-]\s*/, '').trim();
        return trimmed ? `• ${trimmed}` : '';
      })
      .join('\n');
  }

  private serializeCourseContent(content: CourseContentDocument): string {
    return JSON.stringify({
      _id: content._id,
      sections: content.sections,
    });
  }

  private createEmptyCourseContent(courseId: string): CourseContentDocument {
    const now = new Date().toISOString();

    return {
      _id: courseId,
      sections: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  private isCourseContentUnavailableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return true;
    }

    return ['Unexpected server error', 'Unable to load course content.'].includes(error.message);
  }

  private courseEditIdFromPath(path: string): string | null {
    const match = path.match(/^\/courses\/([^/]+)\/edit$/);

    if (!match) {
      return null;
    }

    return decodeURIComponent(match[1]);
  }

  private courseViewIdFromPath(path: string): string | null {
    const match = path.match(/^\/courses\/([^/]+)$/);

    if (!match) {
      return null;
    }

    return decodeURIComponent(match[1]);
  }

  private isCourseEditPath(path: string): boolean {
    return this.courseEditIdFromPath(path) !== null;
  }

  private updatePath(path: string): void {
    if (this.currentPath() === path) {
      return;
    }

    void this.router.navigateByUrl(path).then((navigated) => {
      if (navigated) {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    });
  }

  private currentPageLabel(): string {
    if (!this.loginState()) {
      return 'Login';
    }

    if (this.isAdminPage()) {
      return 'Admin';
    }

    return this.isCoursesPage() || this.isCourseEditorPage() || this.isCourseViewPage()
      ? 'Courses'
      : 'Home';
  }

  private normalizePath(path: string): string {
    const withoutQuery = path.split('?')[0]?.split('#')[0] || '/';

    if (withoutQuery === '/courses' || withoutQuery === '/courses/new') {
      return withoutQuery;
    }

    if (/^\/courses\/[^/]+(?:\/edit)?$/.test(withoutQuery)) {
      return withoutQuery;
    }

    if (withoutQuery.endsWith('/admin')) {
      return '/admin';
    }

    return withoutQuery.endsWith('/courses') ? '/courses' : '/';
  }

  private currentRoleLabel(role: UserRole | undefined): string {
    switch (role) {
      case 'admin':
        return 'Platform admin';
      case 'teacher':
        return 'Teacher';
      default:
        return 'Student';
    }
  }

  private targetRoleLabel(role: UserRole | undefined): string {
    switch (role) {
      case 'admin':
        return 'Full platform oversight';
      case 'teacher':
        return 'Course creator';
      default:
        return 'ISTQB Advanced Test Analyst';
    }
  }

  private pathProgressValue(role: UserRole | undefined): number {
    switch (role) {
      case 'admin':
        return 92;
      case 'teacher':
        return 74;
      default:
        return 38;
    }
  }
}
