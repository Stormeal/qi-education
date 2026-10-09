import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import * as UpChunk from '@mux/upchunk';
import {
  CourseComponent,
  CourseComponentType,
  CourseCatalogMetadataDraft,
  CourseReviewAction,
  CourseReviewState,
  CourseSection,
  CourseContentDocument,
  CourseCreateDraft,
  CourseListItem,
  CourseSummary,
  FeedbackEntry,
  FeedbackOption,
  FeedbackTriageUpdate,
  LoginState,
  MuxVideoStatus,
  QuizComponentContent,
  SignupRequest,
  UserProfileDetails,
  UserRole,
} from '../app.models';
import { AuthService } from './auth.service';
import { CourseService } from './course.service';
import { FeedbackService } from './feedback.service';
import { DEFAULT_AVATAR_COLOR, ProfileService } from './profile.service';
import { SessionService } from './session.service';
import { CareerPathService } from './career-path.service';
import { LearningProgressService } from './learning-progress.service';
import { canEditCourse } from '../utils/course-permissions';
import { CourseDraftRecoveryService, CourseEditorBuffer, RecoverableCourseDraft } from './course-draft-recovery.service';

@Injectable({ providedIn: 'root' })
export class AppStateService {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly courseService = inject(CourseService);
  private readonly feedbackService = inject(FeedbackService);
  private readonly profileService = inject(ProfileService);
  private readonly sessionService = inject(SessionService);
  private readonly learningProgress = inject(LearningProgressService);
  private readonly careerPaths = inject(CareerPathService);
  private readonly courseDraftRecovery = inject(CourseDraftRecoveryService);
  private draftRecoveryContext = '';
  private restoredDraftKey = '';
  private recoverySuppressed = false;
  readonly recoverableCourseDraft = signal<RecoverableCourseDraft | null>(null);
  readonly recoverableCourseDrafts = signal<RecoverableCourseDraft[]>([]);
  readonly courseRecoveryError = signal('');
  readonly focusedCourseBuffer = signal<CourseEditorBuffer | null>(null);
  readonly courseSaveConflict = signal(false);
  readonly latestCourseVersion = signal<CourseContentDocument | null>(null);
  readonly latestCourseLoading = signal(false);


  readonly appVersion = '0.1.64';
  readonly currentYear = new Date().getFullYear();

  readonly email = signal('');
  readonly password = signal('');
  readonly authMode = signal<'login' | 'signup'>('login');
  readonly signupDisplayName = signal('');
  readonly signupPasswordConfirmation = signal('');
  readonly signupError = signal('');
  readonly rememberMe = signal(true);
  readonly passwordVisible = signal(false);
  readonly isSubmitting = signal(false);
  readonly isSessionRestoring = signal(false);
  readonly loginError = signal('');
  readonly loginState = signal<LoginState | null>(this.sessionService.restoreLoginState());
  readonly currentPath = signal(this.normalizePath(this.router.url));

  readonly profileBio = signal('');
  readonly profileJobTitle = signal('');
  readonly profileCompany = signal('');
  readonly profileLearningGoals = signal('');
  readonly profileAvatarColor = signal(DEFAULT_AVATAR_COLOR);
  readonly profileSaving = signal(false);
  readonly profileSaved = signal(false);
  private readonly profileSnapshot = signal('');
  private profileSavedTimeout: ReturnType<typeof setTimeout> | null = null;
  readonly avatarColorOptions: readonly string[] = [
    '#2f4f43',
    '#171b4a',
    '#80592f',
    '#b45309',
    '#0f766e',
    '#9f1239',
  ];

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
  readonly courseReview = signal<CourseReviewState | null>(null);
  readonly courseReviewPending = signal(false);
  readonly courseReviewError = signal('');
  readonly courseReviewReason = signal('');
  readonly courseEditable = computed(() => this.courseFormMode() === 'create' ||
    (!this.courseContentLoading() && (this.courseReview()?.editable ?? (this.editingCourse()?.status ?? this.courseDraft().status) === 'draft')));
  readonly courseContentError = signal('');
  readonly muxUploadComponentId = signal('');
  readonly muxUploadError = signal('');
  readonly muxUploadProgress = signal<Record<string, number>>({});
  readonly attachmentUploadComponentId = signal('');
  readonly attachmentUploadProgress = signal<Record<string, number>>({});
  readonly attachmentUploadStage = signal<Record<string, 'uploading' | 'saving'>>({});
  readonly attachmentUploadError = signal('');
  readonly coursePriceSaving = signal(false);
  readonly coursePriceNotice = signal('');
  readonly coursePriceNoticeError = signal(false);
  readonly courseCatalogSaving = signal(false);
  readonly courseCatalogNotice = signal('');
  readonly courseCatalogNoticeError = signal(false);
  readonly courseThumbnailUploading = signal(false);
  readonly courseThumbnailError = signal('');
  readonly courseEnrollmentSubmitting = signal(false);
  readonly courseEnrollmentError = signal('');
  readonly courseContent = signal<CourseContentDocument | null>(null);
  readonly initialCourseDraftSnapshot = signal('');
  readonly initialCourseContentSnapshot = signal('');
  readonly courseEditorBufferDirty = signal(false);
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
  readonly canSignupSubmit = computed(
    () =>
      this.signupDisplayName().trim().length > 1 &&
      this.email().trim().length > 0 &&
      this.password().length >= 8 &&
      this.signupPasswordConfirmation().length > 0 &&
      !this.isSubmitting(),
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
    name: this.loginState()?.user.displayName || 'Learner',
    currentRole: this.currentRoleLabel(this.loginState()?.user.role),
    targetRole: this.profileLearningGoals(),
    pathProgress: null,
  }));

  readonly courses = computed<CourseSummary[]>(() => this.enrolledCourses().map(course => {
    const progress = this.learningProgress.summary(this.loginState()?.user.email ?? '', course.id);
    return { id: course.id, title: course.title, teacher: course.teacher, level: course.level,
      status: progress.state !== 'ready' ? 'Unavailable' : progress.total > 0 && progress.completed === progress.total ? 'Completed' : 'In progress',
      progress: progress.percent, progressState: progress.state, completed: progress.completed, total: progress.total,
      nextLesson: progress.nextLesson, goals: course.careerGoals };
  }));
  readonly activeCourse = computed(() => this.courses().find(course => course.status !== 'Completed') ?? this.courses()[0] ?? null);

  readonly isCoursesPage = computed(() => this.currentPath() === '/courses');
  readonly isLibraryPage = computed(() => this.currentPath() === '/library');
  readonly isProfilePage = computed(() => this.currentPath() === '/profile');
  readonly profileDirty = computed(() => this.serializeProfile() !== this.profileSnapshot());
  readonly profileMemberSince = computed(() => {
    const createdAt = this.loginState()?.user.createdAt;

    if (!createdAt) {
      return '';
    }

    const date = new Date(createdAt);

    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  });
  readonly isLearningWorkspacePage = computed(
    () => this.libraryCourseViewIdFromPath(this.currentPath()) !== null,
  );
  readonly isCourseEditorPage = computed(() => {
    const path = this.currentPath();

    return path === '/courses/new' || /^\/courses\/[^/]+\/edit$/.test(path);
  });
  readonly isCourseViewPage = computed(
    () => this.courseCatalogIdFromPath(this.currentPath()) !== null,
  );
  readonly selectedCourseId = computed(
    () =>
      this.courseCatalogIdFromPath(this.currentPath()) ??
      this.libraryCourseViewIdFromPath(this.currentPath()),
  );
  readonly selectedCourse = computed(() => {
    const courseId = this.selectedCourseId();

    return courseId
      ? (this.availableCourses().find((course) => course.id === courseId) ?? null)
      : null;
  });
  readonly enrolledCourseIds = computed(() => this.loginState()?.user.enrolledCourseIds ?? []);
  readonly enrolledCourses = computed(() => {
    const enrolledIds = new Set(this.enrolledCourseIds());

    return this.availableCourses().filter((course) => enrolledIds.has(course.id));
  });
  readonly selectedCourseIsEnrolled = computed(() => {
    const courseId = this.selectedCourseId();

    return courseId ? this.enrolledCourseIds().includes(courseId) : false;
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
  readonly editingCourse = computed(() => {
    const editId = this.courseEditingId();
    const reviewed = this.courseReview()?.course;
    if (reviewed?.id === editId) return reviewed;
    return editId ? this.availableCourses().find((course) => course.id === editId) ?? null : null;
  });
  readonly selectedCourseCanEdit = computed(() => this.canEditCourse(this.selectedCourse()));
  readonly canUseCourseEditor = computed(() =>
    this.courseFormMode() === 'edit'
      ? this.canEditCourse(this.editingCourse())
      : this.loginState()?.user.status === 'active' && !!this.loginState()?.permissions.canCreateCourses,
  );
  readonly hasUnsavedCourseChanges = computed(() => {
    if (!this.isCourseEditorPage() || !this.canUseCourseEditor()) return false;
    const content = this.courseContent();
    return !!this.courseReviewReason().trim() || this.courseEditorBufferDirty() ||
      this.serializeCourseDraft(this.courseDraft()) !== this.initialCourseDraftSnapshot() ||
      (!!content && this.serializeCourseContent(content) !== this.initialCourseContentSnapshot());
  });
  readonly courseEditorAccessMessage = computed(() => {
    if (this.coursesError()) return this.coursesError();
    if (this.courseFormMode() === 'edit' && !this.editingCourse()) {
      return this.coursesLoading() ? 'Loading course…' : 'Course not found.';
    }
    return 'You do not have permission to edit this course.';
  });
  readonly courseContentId = computed(() => {
    const editId = this.courseEditingId();

    if (editId) {
      return editId;
    }

    return this.selectedCourseId();
  });
  readonly loadedCourseContentId = signal<string | null>(null);
  private loadedCourseContentView = '';
  private pendingCourseContentKey = '';
  private courseContentGeneration = 0;
  private courseOperationGeneration = 0;
  private initializedCourseEditorPath = '';

  private courseResponseIsCurrent(): () => boolean {
    const session = this.loginState();
    const path = this.currentPath();
    const generation = this.courseOperationGeneration;
    return () => session === this.loginState() && path === this.currentPath() &&
      generation === this.courseOperationGeneration;
  }

  private resetCourseOperations(): void {
    this.learningProgress.cancelLoads();
    this.courseOperationGeneration++;
    this.draftRecoveryContext = ''; this.restoredDraftKey = ''; this.recoverySuppressed = false;
    this.recoverableCourseDraft.set(null); this.recoverableCourseDrafts.set([]); this.focusedCourseBuffer.set(null);
    this.courseSaveConflict.set(false); this.latestCourseVersion.set(null); this.latestCourseLoading.set(false); this.courseRecoveryError.set('');
    this.courseReview.set(null);
    this.courseReviewPending.set(false);
    this.courseReviewError.set('');
    this.courseReviewReason.set('');
    this.courseContentGeneration++;
    this.courseCatalogLoadPromise = null;
    this.pendingCourseContentKey = '';
    this.loadedCourseContentView = '';
    this.courseSubmitting.set(false);
    this.courseContentSaving.set(false);
    this.courseContentLoading.set(false);
    this.coursesLoading.set(false);
    this.coursePriceSaving.set(false);
    this.courseCatalogSaving.set(false);
    this.courseThumbnailUploading.set(false);
    this.courseEnrollmentSubmitting.set(false);
    this.attachmentUploadComponentId.set('');
    this.attachmentUploadProgress.set({});
    this.attachmentUploadStage.set({});
    this.muxUploadComponentId.set('');
    this.muxUploadProgress.set({});
  }
  private courseSaveNoticeTimeout: ReturnType<typeof setTimeout> | null = null;
  private coursePriceNoticeTimeout: ReturnType<typeof setTimeout> | null = null;
  private courseCatalogNoticeTimeout: ReturnType<typeof setTimeout> | null = null;
  private courseCatalogLoadPromise: Promise<CourseListItem[]> | null = null;

  constructor() {
    this.sessionService.setSessionContextProvider(() => this.loginState());
    this.sessionService.onUnauthorized(() => {
      this.logout(true);
      this.loginError.set('Please log in again.');
      this.isFeedbackOpen.set(false);
      void this.navigateHome();
    });

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!this.hasUnsavedCourseChanges()) return;
      this.persistCourseRecovery();
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('beforeunload', warnBeforeUnload));
    effect(() => {
      this.loginState(); this.currentPath(); this.courseContentLoading(); this.courseReview();
      this.courseDraft(); this.courseContent(); this.focusedCourseBuffer(); this.courseEditorBufferDirty();
      untracked(() => {
        const account = this.loginState()?.user.id, courseId = this.courseEditingId() ?? 'new';
        const context = account && this.isCourseEditorPage() && this.canUseCourseEditor() ? `${account}:${courseId}` : '';
        if (context !== this.draftRecoveryContext) {
          this.draftRecoveryContext = ''; this.restoredDraftKey = ''; this.recoverySuppressed = false;
          this.recoverableCourseDraft.set(null); this.recoverableCourseDrafts.set([]); this.focusedCourseBuffer.set(null);
          this.courseSaveConflict.set(false); this.latestCourseVersion.set(null); this.latestCourseLoading.set(false);
          this.courseRecoveryError.set('');
        }
        if (!context || this.courseContentLoading() || (courseId !== 'new' && (!this.courseReview() || this.loadedCourseContentId() !== courseId))) return;
        if (!this.draftRecoveryContext) {
          this.draftRecoveryContext = context;
          const drafts = this.courseDraftRecovery.loadAll(account!, courseId);
          this.recoverableCourseDrafts.set(drafts); this.recoverableCourseDraft.set(drafts[0] ?? null);
        }
        this.persistCourseRecovery();
      });
    });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        const path = this.normalizePath(event.urlAfterRedirects);
        if (path !== this.currentPath()) {
          this.resetCourseOperations();
          this.courseEditorBufferDirty.set(false);
        }
        this.currentPath.set(path);
        this.syncCourseEditorDraftFromPath();
        void this.loadCoursesWhenNeeded();
        void this.loadCourseContentWhenNeeded();
        void this.loadAdminFeedbackWhenNeeded();
      });

    effect(() => {
      const login = this.loginState();
      const path = this.currentPath();
      if (login && (path === '/' || path === '/career-path' || path === '/admin')) {
        untracked(() => void this.careerPaths.load(login.token, login.user.email));
      }
    });

    this.syncCourseEditorDraftFromPath();
    this.restoreStoredSession();
  }

  updateEmail(value: string): void {
    this.email.set(value);
    this.loginError.set('');
    this.signupError.set('');
  }

  updatePassword(value: string): void {
    this.password.set(value);
    this.loginError.set('');
    this.signupError.set('');
  }

  updateSignupDisplayName(value: string): void {
    this.signupDisplayName.set(value);
    this.signupError.set('');
  }

  updateSignupPasswordConfirmation(value: string): void {
    this.signupPasswordConfirmation.set(value);
    this.signupError.set('');
  }

  setAuthMode(mode: 'login' | 'signup'): void {
    if (this.authMode() === mode || this.isSubmitting()) {
      return;
    }

    this.authMode.set(mode);
    this.loginError.set('');
    this.signupError.set('');
    this.password.set('');
    this.signupPasswordConfirmation.set('');
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
      this.learningProgress.reset();
      this.loginState.set({
        token: login.token,
        user: login.user,
        permissions: login.permissions,
      });
      this.sessionService.storeSession(login, this.rememberMe());
      this.password.set('');
      this.feedbackSubmitted.set(false);
      this.loadProfileForCurrentUser();
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

  async submitSignup(): Promise<void> {
    if (!this.canSignupSubmit()) {
      return;
    }

    const validationMessage = this.signupValidationMessage({
      displayName: this.signupDisplayName(),
      email: this.email(),
      password: this.password(),
    });

    if (validationMessage) {
      this.signupError.set(validationMessage);
      return;
    }

    if (this.password() !== this.signupPasswordConfirmation()) {
      this.signupError.set('Passwords must match.');
      return;
    }

    this.isSubmitting.set(true);
    this.signupError.set('');
    this.loginError.set('');

    try {
      const result = await this.authService.signup({
        displayName: this.signupDisplayName(),
        email: this.email(),
        password: this.password(),
      });

      if (!result.ok) {
        this.loginState.set(null);
        this.sessionService.clearStoredSession();
        this.signupError.set(result.message);
        return;
      }

      const login = result.login;
      this.learningProgress.reset();
      this.loginState.set({
        token: login.token,
        user: login.user,
        permissions: login.permissions,
      });
      this.sessionService.storeSession(login, this.rememberMe());
      this.password.set('');
      this.signupPasswordConfirmation.set('');
      this.signupDisplayName.set('');
      this.authMode.set('login');
      this.feedbackSubmitted.set(false);
      this.loadProfileForCurrentUser();
      this.loadCoursesWhenNeeded();
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch {
      this.loginState.set(null);
      this.sessionService.clearStoredSession();
      this.signupError.set('Unable to reach the API. Please try again shortly.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  confirmDiscardCourseChanges(): boolean {
    const accepted = !this.hasUnsavedCourseChanges() || window.confirm('Discard unsaved course changes?');
    if (accepted && this.hasUnsavedCourseChanges()) { this.clearCourseRecovery(); this.recoverySuppressed = true; }
    return accepted;
  }

  logout(forced = false): void {
    if (forced) this.persistCourseRecovery();
    if (!forced && !this.confirmDiscardCourseChanges()) return;
    this.learningProgress.reset();
    this.initializedCourseEditorPath = '';
    this.courseEditorBufferDirty.set(false);
    this.resetCourseOperations();
    this.loginState.set(null);
    this.courseService.clearPrivateThumbnails();
    this.availableCourses.set([]);
    this.courseCatalogLoadPromise = null;
    this.coursesLoading.set(false);
    this.password.set('');
    this.loginError.set('');
    this.isFeedbackOpen.set(false);
    this.courseCreateError.set('');
    this.courseContentError.set('');
    this.muxUploadComponentId.set('');
    this.muxUploadError.set('');
    this.muxUploadProgress.set({});
    this.attachmentUploadComponentId.set('');
    this.attachmentUploadProgress.set({});
    this.attachmentUploadStage.set({});
    this.attachmentUploadError.set('');
    this.courseThumbnailUploading.set(false);
    this.courseThumbnailError.set('');
    this.courseEnrollmentError.set('');
    this.courseEnrollmentSubmitting.set(false);
    this.courseContent.set(null);
    this.loadedCourseContentId.set(null);
    this.initialCourseDraftSnapshot.set('');
    this.initialCourseContentSnapshot.set('');
    this.courseDraft.set(this.createCourseDraft());
    this.adminFeedback.set([]);
    this.adminFeedbackError.set('');
    this.profileBio.set('');
    this.profileJobTitle.set('');
    this.profileCompany.set('');
    this.profileLearningGoals.set('');
    this.profileAvatarColor.set(DEFAULT_AVATAR_COLOR);
    this.profileSnapshot.set('');
    this.profileSaved.set(false);
    this.sessionService.clearStoredSession();
    this.clearCourseCatalogNotice();
    this.clearCoursePriceNotice();
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
      if (this.loginState() !== restoredSession) return;

      if (!restored) {
        this.logout(true);
        return;
      }

      this.resetCourseOperations();
      this.initializedCourseEditorPath = '';
      this.learningProgress.reset();
      this.availableCourses.set([]);
      this.courseContent.set(null);
      this.loadedCourseContentId.set(null);
      this.courseService.clearPrivateThumbnails();
      this.loginState.set({
        token: restoredSession.token,
        user: restored.user,
        permissions: restored.permissions,
      });
      this.loadProfileForCurrentUser();
      this.loadCoursesWhenNeeded();
      this.loadAdminFeedbackWhenNeeded();
    } catch {
      if (this.loginState() === restoredSession) this.logout(true);
    } finally {
      this.isSessionRestoring.set(false);
    }
  }

  retryLearningProgress(): void {
    void this.loadCoursesWhenNeeded();
  }

  navigateHome(): void {
    this.updatePath('/');
  }

  navigateCourses(): void {
    this.updatePath('/courses');
  }

  navigateLibrary(): void {
    this.updatePath('/library');
  }

  openCourse(courseId: string): void {
    this.updatePath(`/courses/${encodeURIComponent(courseId)}`);
  }

  openLearningCourse(courseId: string): void {
    this.updatePath(`/library/${encodeURIComponent(courseId)}`);
  }

  navigateAdmin(): void {
    if (!this.loginState()?.permissions.hasAdminAccess) {
      return;
    }

    this.updatePath('/admin');
  }

  navigateCareerPath(): void {
    this.updatePath('/career-path');
  }

  navigateProfile(): void {
    this.updatePath('/profile');
  }

  updateProfileBio(value: string): void {
    this.profileBio.set(value);
    this.profileSaved.set(false);
  }

  updateProfileJobTitle(value: string): void {
    this.profileJobTitle.set(value);
    this.profileSaved.set(false);
  }

  updateProfileCompany(value: string): void {
    this.profileCompany.set(value);
    this.profileSaved.set(false);
  }

  updateProfileLearningGoals(value: string): void {
    this.profileLearningGoals.set(value);
    this.profileSaved.set(false);
  }

  selectProfileAvatarColor(value: string): void {
    this.profileAvatarColor.set(value);
    this.profileSaved.set(false);
  }

  saveProfile(): void {
    const userId = this.loginState()?.user.id;

    if (!userId || this.profileSaving() || !this.profileDirty()) {
      return;
    }

    this.profileSaving.set(true);

    const details: UserProfileDetails = {
      bio: this.profileBio().trim(),
      jobTitle: this.profileJobTitle().trim(),
      company: this.profileCompany().trim(),
      learningGoals: this.profileLearningGoals().trim(),
      avatarColor: this.profileAvatarColor(),
    };

    try {
      this.profileService.saveProfile(userId, details);
      this.profileBio.set(details.bio);
      this.profileJobTitle.set(details.jobTitle);
      this.profileCompany.set(details.company);
      this.profileLearningGoals.set(details.learningGoals);
      this.profileSnapshot.set(this.serializeProfile());
      this.showProfileSaved();
    } finally {
      this.profileSaving.set(false);
    }
  }

  private loadProfileForCurrentUser(): void {
    const profile = this.profileService.loadProfile(this.loginState()?.user.id ?? '');
    this.profileBio.set(profile.bio);
    this.profileJobTitle.set(profile.jobTitle);
    this.profileCompany.set(profile.company);
    this.profileLearningGoals.set(profile.learningGoals);
    this.profileAvatarColor.set(profile.avatarColor);
    this.profileSnapshot.set(this.serializeProfile());
    this.profileSaved.set(false);
  }

  private serializeProfile(): string {
    return JSON.stringify({
      bio: this.profileBio().trim(),
      jobTitle: this.profileJobTitle().trim(),
      company: this.profileCompany().trim(),
      learningGoals: this.profileLearningGoals().trim(),
      avatarColor: this.profileAvatarColor(),
    });
  }

  private showProfileSaved(): void {
    if (this.profileSavedTimeout) {
      clearTimeout(this.profileSavedTimeout);
    }

    this.profileSaved.set(true);
    this.profileSavedTimeout = setTimeout(() => {
      this.profileSaved.set(false);
      this.profileSavedTimeout = null;
    }, 4000);
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

    if (!this.canEditCourse(course) || !course) {
      return;
    }

    void this.updatePath(`/courses/${encodeURIComponent(course.id)}/edit`);
  }

  canEditCourse(course: CourseListItem | null | undefined): boolean {
    return canEditCourse(course, this.loginState()?.user);
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
                      this.createCourseComponent(type, section.components.length + 1),
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
    this.updateCourseComponent(sectionIndex, componentIndex, (component): CourseComponent => {
      const nextType = value as CourseComponentType;

      if (nextType === 'quiz') {
        const quizQuestion =
          component.type === 'quiz'
            ? this.primaryQuizQuestionText(component.quiz)
            : component.content;

        return {
          id: component.id,
          title: component.title,
          type: 'quiz',
          durationMinutes: component.durationMinutes,
          content: quizQuestion,
          resourceUrl: '',
          attachments: [],
          quiz: component.type === 'quiz' ? component.quiz : this.createEmptyQuizContent(),
        } as CourseComponent;
      }

      if (nextType === 'video') {
        return {
          id: component.id,
          title: component.title,
          type: 'video',
          durationMinutes: component.durationMinutes,
          content: component.type === 'quiz' ? this.primaryQuizQuestionText(component.quiz) : component.content,
          resourceUrl: component.resourceUrl,
          attachments: [],
        } as CourseComponent;
      }

      if (nextType === 'resources') {
        return {
          id: component.id,
          title: component.title,
          type: 'resources',
          durationMinutes: component.durationMinutes,
          content: component.type === 'quiz' ? this.primaryQuizQuestionText(component.quiz) : component.content,
          resourceUrl: '',
          attachments: component.type === 'resources' ? component.attachments : [],
        } as CourseComponent;
      }

      return {
        id: component.id,
        title: component.title,
        type: 'text',
        durationMinutes: component.durationMinutes,
        content: component.type === 'quiz' ? this.primaryQuizQuestionText(component.quiz) : component.content,
        resourceUrl: '',
        attachments: component.type === 'text' ? component.attachments : [],
      } as CourseComponent;
    });
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

  async uploadCourseComponentAttachment(
    sectionIndex: number,
    componentIndex: number,
    file: File,
    markerId: string,
  ): Promise<void> {
    const isCurrent = this.courseResponseIsCurrent();
    if (this.attachmentUploadComponentId()) {
      return;
    }

    const token = this.loginState()?.token;
    const courseId = this.courseEditingId();
    const content = this.courseContent();
    const section = content?.sections[sectionIndex];
    const component = section?.components[componentIndex];

    if (!token) {
      this.attachmentUploadError.set('Please log in again before uploading attachments.');
      return;
    }

    if (!courseId || !content || !section || !component) {
      this.attachmentUploadError.set('Save the course before uploading attachments.');
      return;
    }

    if (component.type !== 'text' && component.type !== 'resources') {
      this.attachmentUploadError.set('Attachments are available for text and resources components.');
      return;
    }

    if (!this.isAllowedComponentAttachment(component.type, file)) {
      this.attachmentUploadError.set(
        component.type === 'text'
          ? 'Text documentation supports documents, PDFs, images, and PowerPoint files.'
          : 'Resources supports ZIP files, PowerPoint files, and images.',
      );
      return;
    }

    // Keep in step with the API upload limit (api/src/server.ts); the host caps bodies near 4.5 MB.
    if (file.size > 4 * 1024 * 1024) {
      this.attachmentUploadError.set('Attachments must be 4 MB or smaller.');
      return;
    }

    this.attachmentUploadComponentId.set(component.id);
    this.attachmentUploadProgress.update((progress) => ({ ...progress, [component.id]: 0 }));
    this.attachmentUploadStage.update((stage) => ({ ...stage, [component.id]: 'uploading' }));
    this.attachmentUploadError.set('');

    try {
      if (!await this.saveOutlineBeforeMedia(courseId, token, isCurrent)) return;

      const result = await this.courseService.uploadComponentAttachment(
        courseId,
        section.id,
        component.id,
        file,
        token,
        markerId,
        (progress) => {
          if (!isCurrent()) return;
          this.attachmentUploadProgress.update((currentProgress) => ({
            ...currentProgress,
            [component.id]: Math.min(progress, 95),
          }));
        },
        this.courseReview(),
      );

      if (!isCurrent()) return;

      if (!result.ok) {
        this.courseSaveFailed(result, 'content');
        this.attachmentUploadError.set(result.message);
        return;
      }

      const finalContent = this.normalizeCourseContent(result.content);
      this.acceptCourseContentSave(finalContent);
      this.loadedCourseContentId.set(finalContent._id);
      this.initialCourseContentSnapshot.set(this.serializeCourseContent(finalContent));
    } catch {
      if (!isCurrent()) return;
      this.attachmentUploadError.set('Unable to upload the attachment. Please try again.');
    } finally {
      if (!isCurrent()) return;
      this.courseContentSaving.set(false);
      this.attachmentUploadProgress.update(({ [component.id]: _removedProgress, ...progress }) => progress);
      this.attachmentUploadStage.update(({ [component.id]: _removedStage, ...stage }) => stage);
      this.attachmentUploadComponentId.set('');
    }
  }

  async removeCourseComponentAttachment(
    sectionIndex: number,
    componentIndex: number,
    assetId: string,
  ): Promise<void> {
    const isCurrent = this.courseResponseIsCurrent();
    const content = this.courseContent();
    const section = content?.sections[sectionIndex];
    const component = section?.components[componentIndex];

    if (assetId.startsWith('pending-')) {
      this.courseService.cancelComponentAttachmentUpload();
      this.attachmentUploadProgress.update(({ [component?.id ?? '']: _removedProgress, ...progress }) => progress);
      this.attachmentUploadStage.update(({ [component?.id ?? '']: _removedStage, ...stage }) => stage);
      this.attachmentUploadComponentId.set('');
      this.attachmentUploadError.set('');
      const updatedContent = component ? this.removeAttachmentMarker(content!, assetId) : content;

      if (updatedContent) {
        this.courseContent.set(updatedContent);
      }
      return;
    }

    if (this.attachmentUploadComponentId()) {
      return;
    }

    const token = this.loginState()?.token;
    const courseId = this.courseEditingId();

    if (!token || !courseId || !section || !component) {
      this.attachmentUploadError.set('Select a saved component before removing attachments.');
      return;
    }

    this.attachmentUploadComponentId.set(component.id);
    this.attachmentUploadError.set('');

    try {
      if (!await this.saveOutlineBeforeMedia(courseId, token, isCurrent)) return;
      const result = await this.courseService.removeComponentAttachment(
        courseId,
        section.id,
        component.id,
        assetId,
        token,
        this.courseReview(),
      );

      if (!isCurrent()) return;

      if (!result.ok) {
        if (result.message !== 'Upload cancelled.') {
          this.attachmentUploadError.set(result.message);
        }
        return;
      }

      if (result.content.review) this.courseReview.set(result.content.review);
      const updatedContent = this.removeAttachmentMarker(this.normalizeCourseContent(result.content), assetId);
      this.courseContent.set(updatedContent);
      const saveResult = await this.courseService.saveCourseContent(courseId, updatedContent.sections, token, this.courseReview());

      if (!isCurrent()) return;

      if (!saveResult.ok) {
        this.attachmentUploadError.set(saveResult.message);
        return;
      }

      const finalContent = this.normalizeCourseContent(saveResult.content);
      this.acceptCourseContentSave(finalContent);
      this.loadedCourseContentId.set(finalContent._id);
      this.initialCourseContentSnapshot.set(this.serializeCourseContent(finalContent));
    } catch {
      if (!isCurrent()) return;
      this.attachmentUploadError.set('Unable to remove the attachment. Please try again.');
    } finally {
      if (!isCurrent()) return;
      this.courseContentSaving.set(false);
      this.attachmentUploadComponentId.set('');
    }
  }

  async downloadCourseComponentAttachment(
    sectionIndex: number,
    componentIndex: number,
    assetId: string,
    fileName: string,
  ): Promise<void> {
    const isCurrent = this.courseResponseIsCurrent();
    const token = this.loginState()?.token;
    const courseId = this.courseEditingId();
    const content = this.courseContent();
    const component = content?.sections[sectionIndex]?.components[componentIndex];
    const attachment = component?.attachments.find((item) => item.assetId === assetId);

    if (!token || !courseId || !component) {
      this.attachmentUploadError.set('Select a saved component before downloading attachments.');
      return;
    }

    this.attachmentUploadError.set('');

    try {
      const result = await this.courseService.downloadComponentAttachment(courseId, assetId, token);

      if (!isCurrent()) return;

      if (!result.ok) {
        this.attachmentUploadError.set(result.message);
        return;
      }

      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment?.fileName || fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      if (!isCurrent()) return;
      this.attachmentUploadError.set('Unable to download the attachment. Please try again.');
    }
  }

  async uploadCourseComponentMuxVideo(
    sectionIndex: number,
    componentIndex: number,
    file: File,
  ): Promise<void> {
    const isCurrent = this.courseResponseIsCurrent();
    if (this.muxUploadComponentId()) {
      return;
    }

    const token = this.loginState()?.token;
    const courseId = this.courseEditingId();
    const content = this.courseContent();
    const section = content?.sections[sectionIndex];
    const component = section?.components[componentIndex];

    if (!token) {
      this.muxUploadError.set('Please log in again before uploading video.');
      return;
    }

    if (!courseId || !content || !section || !component) {
      this.muxUploadError.set('Save the course before uploading video.');
      return;
    }

    if (component.type !== 'video') {
      this.muxUploadError.set('Select a video component before uploading.');
      return;
    }

    if (component.mux) {
      this.muxUploadError.set('Remove the existing video before uploading a new one.');
      return;
    }

    this.muxUploadComponentId.set(component.id);
    this.muxUploadError.set('');
    this.muxUploadProgress.update((progress) => ({ ...progress, [component.id]: 0 }));

    try {
      if (!await this.saveOutlineBeforeMedia(courseId, token, isCurrent)) return;

      const uploadResult = await this.courseService.createMuxUpload(
        courseId,
        section.id,
        component.id,
        token,
        this.courseReview(),
      );

      if (!isCurrent()) return;

      if (!uploadResult.ok) {
        this.courseSaveFailed(uploadResult, 'content');
        this.muxUploadError.set(uploadResult.message);
        return;
      }

      const updatedContent = this.normalizeCourseContent(uploadResult.content);
      this.acceptCourseContentSave(updatedContent);
      this.loadedCourseContentId.set(updatedContent._id);
      this.initialCourseContentSnapshot.set(this.serializeCourseContent(updatedContent));
      this.updateCourseComponentMuxStatus(sectionIndex, componentIndex, 'uploading');

      await this.uploadFileToMux(uploadResult.uploadUrl, file, (progress) => {
          if (!isCurrent()) return;
        this.muxUploadProgress.update((currentProgress) => ({
          ...currentProgress,
          [component.id]: progress,
        }));
      });

      if (!isCurrent()) return;
      this.updateCourseComponentMuxStatus(sectionIndex, componentIndex, 'processing');
      this.muxUploadProgress.update((currentProgress) => ({
        ...currentProgress,
        [component.id]: 100,
      }));
      void this.refreshMuxVideoUntilReady(courseId, component.id);
    } catch {
      if (!isCurrent()) return;
      const message = 'Unable to upload the video to Mux. Please try again.';

      this.muxUploadError.set(message);
      this.updateCourseComponentMuxStatus(sectionIndex, componentIndex, 'errored', message);
    } finally {
      if (!isCurrent()) return;
      this.courseContentSaving.set(false);
      this.muxUploadComponentId.set('');
    }
  }

  async removeCourseComponentMuxVideo(sectionIndex: number, componentIndex: number): Promise<void> {
    const isCurrent = this.courseResponseIsCurrent();
    if (this.muxUploadComponentId()) {
      return;
    }

    const token = this.loginState()?.token;
    const courseId = this.courseEditingId();
    const content = this.courseContent();
    const section = content?.sections[sectionIndex];
    const component = section?.components[componentIndex];

    if (!token) {
      this.muxUploadError.set('Please log in again before removing video.');
      return;
    }

    if (!courseId || !section || !component) {
      this.muxUploadError.set('Select a saved video component before removing video.');
      return;
    }

    if (component.type !== 'video' || !component.mux) {
      return;
    }

    this.muxUploadComponentId.set(component.id);
    this.muxUploadError.set('');

    try {
      if (!await this.saveOutlineBeforeMedia(courseId, token, isCurrent)) return;
      const result = await this.courseService.removeMuxVideo(courseId, section.id, component.id, token, this.courseReview());

      if (!isCurrent()) return;

      if (!result.ok) {
        this.courseSaveFailed(result, 'content');
        this.muxUploadError.set(result.message);
        return;
      }

      const updatedContent = this.normalizeCourseContent(result.content);
      this.acceptCourseContentSave(updatedContent);
      this.loadedCourseContentId.set(updatedContent._id);
      this.initialCourseContentSnapshot.set(this.serializeCourseContent(updatedContent));
      this.muxUploadProgress.update(({ [component.id]: _removedProgress, ...progress }) => progress);
    } catch {
      if (!isCurrent()) return;
      this.muxUploadError.set('Unable to remove the video. Please try again.');
    } finally {
      if (!isCurrent()) return;
      this.courseContentSaving.set(false);
      this.muxUploadComponentId.set('');
    }
  }

  updateCourseComponentQuizQuestion(
    sectionIndex: number,
    componentIndex: number,
    questionIndex: number,
    value: string,
  ): void {
    this.updateCourseComponent(sectionIndex, componentIndex, (component) => {
      if (component.type !== 'quiz') {
        return component;
      }

      const questions = component.quiz.questions.map((question, index) =>
        index === questionIndex ? { ...question, question: value } : question,
      );

      return {
        ...component,
        content: questions[0]?.question ?? '',
        resourceUrl: '',
        quiz: {
          ...component.quiz,
          questions,
        },
      };
    });
  }

  updateCourseComponentQuizPoints(
    sectionIndex: number,
    componentIndex: number,
    questionIndex: number,
    value: string,
  ): void {
    const parsed = Number.parseInt(value, 10);

    this.updateCourseComponent(sectionIndex, componentIndex, (component) => {
      if (component.type !== 'quiz') {
        return component;
      }

      return {
        ...component,
        resourceUrl: '',
        quiz: {
          ...component.quiz,
          questions: component.quiz.questions.map((question, index) =>
            index === questionIndex
              ? { ...question, points: Number.isFinite(parsed) && parsed > 0 ? parsed : 1 }
              : question,
          ),
        },
      };
    });
  }

  updateCourseComponentQuizPassPoints(sectionIndex: number, componentIndex: number, value: string): void {
    const parsed = Number.parseInt(value, 10);

    this.updateCourseComponent(sectionIndex, componentIndex, (component) => {
      if (component.type !== 'quiz') {
        return component;
      }

      return {
        ...component,
        resourceUrl: '',
        quiz: {
          ...component.quiz,
          passPoints: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
        },
      };
    });
  }

  addCourseComponentQuizQuestion(sectionIndex: number, componentIndex: number): void {
    this.updateCourseComponent(sectionIndex, componentIndex, (component) => {
      if (component.type !== 'quiz') {
        return component;
      }

      const nextQuestion = this.createEmptyQuizQuestion(component.quiz.questions.length + 1);
      return {
        ...component,
        resourceUrl: '',
        quiz: {
          ...component.quiz,
          questions: [...component.quiz.questions, nextQuestion],
        },
      };
    });
  }

  removeCourseComponentQuizQuestion(sectionIndex: number, componentIndex: number, questionIndex: number): void {
    this.updateCourseComponent(sectionIndex, componentIndex, (component) => {
      if (component.type !== 'quiz' || component.quiz.questions.length <= 1) {
        return component;
      }

      const questions = component.quiz.questions.filter((_, index) => index !== questionIndex);
      return {
        ...component,
        content: questions[0]?.question ?? '',
        resourceUrl: '',
        quiz: {
          ...component.quiz,
          questions,
        },
      };
    });
  }

  updateCourseComponentQuizAnswerText(
    sectionIndex: number,
    componentIndex: number,
    questionIndex: number,
    answerIndex: number,
    value: string,
  ): void {
    this.updateCourseComponent(sectionIndex, componentIndex, (component) => {
      if (component.type !== 'quiz') {
        return component;
      }

      return {
        ...component,
        resourceUrl: '',
        quiz: {
          ...component.quiz,
          questions: component.quiz.questions.map((question, index) =>
            index === questionIndex
              ? {
                  ...question,
                  answers: question.answers.map((answer, currentAnswerIndex) =>
                    currentAnswerIndex === answerIndex ? { ...answer, text: value } : answer,
                  ) as QuizComponentContent['questions'][number]['answers'],
                }
              : question,
          ),
        },
      };
    });
  }

  updateCourseComponentQuizAnswerDescription(
    sectionIndex: number,
    componentIndex: number,
    questionIndex: number,
    answerIndex: number,
    value: string,
  ): void {
    this.updateCourseComponent(sectionIndex, componentIndex, (component) => {
      if (component.type !== 'quiz') {
        return component;
      }

      return {
        ...component,
        resourceUrl: '',
        quiz: {
          ...component.quiz,
          questions: component.quiz.questions.map((question, index) =>
            index === questionIndex
              ? {
                  ...question,
                  answers: question.answers.map((answer, currentAnswerIndex) =>
                    currentAnswerIndex === answerIndex ? { ...answer, description: value } : answer,
                  ) as QuizComponentContent['questions'][number]['answers'],
                }
              : question,
          ),
        },
      };
    });
  }

  updateCourseComponentQuizAnswerCorrect(
    sectionIndex: number,
    componentIndex: number,
    questionIndex: number,
    answerIndex: number,
    value: boolean,
  ): void {
    this.updateCourseComponent(sectionIndex, componentIndex, (component) => {
      if (component.type !== 'quiz') {
        return component;
      }

      return {
        ...component,
        resourceUrl: '',
        quiz: {
          ...component.quiz,
          questions: component.quiz.questions.map((question, index) =>
            index === questionIndex
              ? {
                  ...question,
                  answers: question.answers.map((answer, currentAnswerIndex) =>
                    currentAnswerIndex === answerIndex ? { ...answer, isCorrect: value } : answer,
                  ) as QuizComponentContent['questions'][number]['answers'],
                }
              : question,
          ),
        },
      };
    });
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

  updateFocusedCourseBuffer(buffer: CourseEditorBuffer | null): void {
    this.focusedCourseBuffer.set(buffer);
    const section = this.courseContent()?.sections.find(item => item.id === buffer?.sectionId);
    const component = section?.components.find(item => item.id === buffer?.componentId);
    this.courseEditorBufferDirty.set(!!buffer && buffer.value !== (buffer.componentId ? component?.content : section?.title));
    this.persistCourseRecovery();
  }
  private recoverySections(): CourseSection[] {
    const sections = structuredClone(this.courseContent()?.sections ?? []), buffer = this.focusedCourseBuffer();
    const section = sections.find(item => item.id === buffer?.sectionId);
    if (section && buffer) {
      if (!buffer.componentId) section.title = buffer.value.trim() || 'Untitled section';
      else {
        const component = section.components.find(item => item.id === buffer.componentId);
        if (component?.type === 'text') component.content = buffer.value;
      }
    }
    return sections;
  }
  private persistCourseRecovery(): void {
    const accountId = this.loginState()?.user.id, courseId = this.courseEditingId() ?? 'new';
    if (this.recoverySuppressed || !accountId || !this.draftRecoveryContext || !this.isCourseEditorPage() || !this.canUseCourseEditor() || this.courseContentLoading() || this.recoverableCourseDraft()) return;
    if (!this.hasUnsavedCourseChanges()) { this.clearCourseRecovery(); return; }
    if (!this.courseEditable()) return;
    const state = this.courseReview();
    const saved = this.courseDraftRecovery.save({ accountId, courseId, draft: this.courseDraft(), sections: this.recoverySections(),
      revision: courseId === 'new' || !state ? null : { version: state.version, revisionId: state.revisionId } });
    this.courseRecoveryError.set(saved ? '' : 'Draft recovery could not be saved on this device. Keep this page open until your course is saved.');
  }
  private clearCourseRecovery(): void {
    const account = this.loginState()?.user.id;
    if (!account) return;
    const keys = new Set([this.courseDraftRecovery.key(account, this.courseEditingId() ?? 'new'), this.restoredDraftKey]);
    if ([...keys].filter(Boolean).some(key => !this.courseDraftRecovery.remove(key))) {
      this.courseRecoveryError.set('The local draft could not be removed. Discard it if offered again.');
    }
    this.restoredDraftKey = '';
  }
  restoreCourseDraft(): void {
    const saved = this.recoverableCourseDraft(), review = this.courseReview();
    if (!saved || !this.courseEditable() || !this.canUseCourseEditor() || saved.accountId !== this.loginState()?.user.id || saved.courseId !== (this.courseEditingId() ?? 'new')) return;
    this.restoredDraftKey = saved.key;
    this.courseDraft.set(saved.draft);
    if (this.courseContent()) this.courseContent.update(content => content ? { ...content, sections: saved.sections } : null);
    if (review && saved.revision && (review.version !== saved.revision.version || review.revisionId !== saved.revision.revisionId)) {
      this.latestCourseVersion.set({ ...this.courseContent()!, sections: JSON.parse(this.initialCourseContentSnapshot()).sections, review });
      this.courseReview.set({ ...review, ...saved.revision }); this.courseSaveConflict.set(true);
    }
    this.recoverableCourseDraft.set(null); this.recoverableCourseDrafts.set([]); this.persistCourseRecovery();
  }
  selectRecoverableCourseDraft(key: string): void {
    const draft = this.recoverableCourseDrafts().find(item => item.key === key);
    if (draft && draft.accountId === this.loginState()?.user.id && draft.courseId === (this.courseEditingId() ?? 'new')) this.recoverableCourseDraft.set(draft);
  }
  discardRecoverableCourseDraft(): void {
    const saved = this.recoverableCourseDraft();
    if (!saved || saved.accountId !== this.loginState()?.user.id) return;
    if (!this.courseDraftRecovery.remove(saved.key)) { this.courseRecoveryError.set('The local draft could not be removed.'); return; }
    const drafts = this.courseDraftRecovery.loadAll(saved.accountId, saved.courseId);
    this.recoverableCourseDrafts.set(drafts); this.recoverableCourseDraft.set(drafts[0] ?? null);
  }
  async compareLatestCourse(): Promise<void> {
    const id = this.courseEditingId(), token = this.loginState()?.token, isCurrent = this.courseResponseIsCurrent();
    if (!id || !token || this.latestCourseLoading()) return;
    this.latestCourseLoading.set(true);
    try {
      const latest = await this.courseService.loadCourseContent(id, token, 'author');
      if (isCurrent()) this.latestCourseVersion.set(latest);
    } catch (error) { if (isCurrent()) this.courseContentError.set(error instanceof Error ? error.message : 'Unable to load the latest version.'); }
    finally { if (isCurrent()) this.latestCourseLoading.set(false); }
  }
  reconcileCourseDraft(): void {
    const latest = this.latestCourseVersion(), current = this.courseReview();
    if (!latest?.review?.editable || !current || latest.review.revisionId !== current.revisionId || this.courseSubmitting()) return;
    this.courseReview.set(latest.review);
    this.initialCourseDraftSnapshot.set(this.serializeCourseDraft(this.courseDraftFromCourse(latest.review.course)));
    this.initialCourseContentSnapshot.set(this.serializeCourseContent(latest));
    this.courseSaveConflict.set(false); this.latestCourseVersion.set(null);
    this.courseCreateError.set(''); this.courseContentError.set(''); this.persistCourseRecovery();
  }
  useLatestCourseVersion(): void {
    const latest = this.latestCourseVersion();
    if (!latest?.review || this.courseSubmitting() || !window.confirm('Discard your local edits and use the latest saved version?')) return;
    this.clearCourseRecovery(); this.focusedCourseBuffer.set(null); this.courseEditorBufferDirty.set(false);
    this.courseReview.set(latest.review); this.courseContent.set(latest);
    const draft = this.courseDraftFromCourse(latest.review.course); this.courseDraft.set(draft);
    this.initialCourseDraftSnapshot.set(this.serializeCourseDraft(draft)); this.initialCourseContentSnapshot.set(this.serializeCourseContent(latest));
    this.courseSaveConflict.set(false); this.latestCourseVersion.set(null); this.courseCreateError.set(''); this.courseContentError.set('');
  }
  applyCourseBackgroundRefresh(latest: CourseContentDocument): void {
    if (this.hasUnsavedCourseChanges()) {
      if (latest.review && latest.review.version !== this.courseReview()?.version) {
        this.courseSaveConflict.set(true); this.latestCourseVersion.set(latest);
      }
      return;
    }
    this.courseContent.set(latest); if (latest.review) {
      this.courseReview.set(latest.review);
      const draft = this.courseDraftFromCourse(latest.review.course); this.courseDraft.set(draft); this.initialCourseDraftSnapshot.set(this.serializeCourseDraft(draft));
    }
    this.initialCourseContentSnapshot.set(this.serializeCourseContent(latest));
  }
  private courseSaveFailed(result: { message: string; code?: string }, part: 'metadata' | 'content', detailsSaved = false): void {
    if (result.code === 'AUTHORING_CONFLICT' || result.code === 'AUTHORING_REVISION_REQUIRED') this.courseSaveConflict.set(true);
    const message = detailsSaved ? `Details saved. Lessons remain unsaved. ${result.message}` : result.message;
    (part === 'metadata' ? this.courseCreateError : this.courseContentError).set(message);
    this.persistCourseRecovery();
  }
  private acceptCourseContentSave(content: CourseContentDocument): void {
    if (content.review) this.courseReview.set(content.review);
    this.courseContent.set(content); this.initialCourseContentSnapshot.set(this.serializeCourseContent(content));
  }
  private async saveOutlineBeforeMedia(courseId: string, token: string, isCurrent: () => boolean): Promise<boolean> {
    if (this.courseSaveConflict() || this.recoverableCourseDraft()) return false;
    if (this.focusedCourseBuffer() && this.courseContent()) {
      this.courseContent.update(content => content ? { ...content, sections: this.recoverySections() } : null);
      this.focusedCourseBuffer.set(null); this.courseEditorBufferDirty.set(false);
    }
    const content = this.courseContent();
    // The caller owns this busy flag through the complete upload/removal response.
    this.courseContentSaving.set(true);
    if (!content || this.serializeCourseContent(content) === this.initialCourseContentSnapshot()) return true;
    const result = await this.courseService.saveCourseContent(courseId, content.sections, token, this.courseReview());
    if (!isCurrent()) return false;
    if (!result.ok) { this.courseSaveFailed(result, 'content'); return false; }
    this.acceptCourseContentSave(this.normalizeCourseContent(result.content)); return true;
  }

  async submitCourse(): Promise<void> {
    if (this.courseSubmitting() || this.courseContentSaving() || this.attachmentUploadComponentId() || this.muxUploadComponentId() || this.recoverableCourseDraft()) return;
    const token = this.loginState()?.token, user = this.loginState()?.user;
    if (!token || !user) { this.courseCreateError.set('Please log in again before saving.'); return; }
    if (!this.canUseCourseEditor()) { this.courseCreateError.set('You do not have permission to edit this course.'); return; }
    if (this.courseSaveConflict()) { this.courseCreateError.set('Compare the latest saved version and reconcile your draft before saving.'); return; }
    if (!this.courseEditable()) { this.courseCreateError.set('Start a draft revision or wait for the admin review outcome before editing.'); return; }
    if (this.focusedCourseBuffer() && this.courseContent()) {
      this.courseContent.update(content => content ? { ...content, sections: this.recoverySections() } : null);
      this.focusedCourseBuffer.set(null); this.courseEditorBufferDirty.set(false);
    }
    const isCurrent = this.courseResponseIsCurrent(), mode = this.courseFormMode(), courseId = this.courseEditingId();
    const draft = this.courseDraft(), content = this.courseContent();
    const metadataChanged = mode === 'create' || this.serializeCourseDraft(draft) !== this.initialCourseDraftSnapshot();
    const contentChanged = mode === 'edit' && !!content && this.serializeCourseContent(content) !== this.initialCourseContentSnapshot();
    if (!metadataChanged && !contentChanged) return;
    this.courseSubmitting.set(true); this.courseContentSaving.set(contentChanged);
    this.courseCreateError.set(''); this.courseContentError.set(''); this.clearCourseSaveNotice();
    let detailsSaved = false, part: 'metadata' | 'content' = metadataChanged ? 'metadata' : 'content';
    try {
      let savedCourse: CourseListItem | null = null;
      if (metadataChanged) {
        const result = await this.courseService.saveCourse(mode, draft, token, user.displayName, courseId, this.courseReview());
        if (!isCurrent()) return;
        if (!result.ok) { this.courseSaveFailed(result, 'metadata'); return; }
        savedCourse = result.course; detailsSaved = true;
        if (result.review) this.courseReview.set(result.review);
        const savedDraft = this.courseDraftFromCourse(savedCourse);
        this.courseDraft.set(savedDraft); this.initialCourseDraftSnapshot.set(this.serializeCourseDraft(savedDraft));
        if (mode === 'create') this.availableCourses.update(courses => [result.course, ...courses]);
        else if (!this.courseReview()?.liveStatus) this.availableCourses.update(courses => courses.map(course => course.id === result.course.id ? result.course : course));
      }
      if (contentChanged && courseId && content) {
        part = 'content';
        const result = await this.courseService.saveCourseContent(courseId, content.sections, token, this.courseReview());
        if (!isCurrent()) return;
        if (!result.ok) { this.courseSaveFailed(result, 'content', detailsSaved); return; }
        this.acceptCourseContentSave(result.content);
      }
      this.clearCourseRecovery();
      this.showCourseSaveNotice(this.courseSaveMessage(mode, metadataChanged, contentChanged));
      if (mode === 'create' && savedCourse) void this.updatePath(`/courses/${encodeURIComponent(savedCourse.id)}/edit`);
    } catch {
      if (isCurrent()) this.courseSaveFailed({ message: 'Unable to reach the API. Please try again.' }, part, detailsSaved && part === 'content');
    } finally {
      if (isCurrent()) { this.courseSubmitting.set(false); this.courseContentSaving.set(false); this.persistCourseRecovery(); }
    }
  }

  async reviewCourse(action: CourseReviewAction): Promise<void> {
    if (this.recoverableCourseDraft()) { this.courseReviewError.set('Restore or discard the local draft before making a review decision.'); return; }
    if (this.courseReviewPending() || this.courseSubmitting() || this.courseContentLoading() || this.courseThumbnailUploading() || this.attachmentUploadComponentId() || this.muxUploadComponentId()) return;
    const courseId = this.courseEditingId(), token = this.loginState()?.token;
    if (!courseId || !token || !this.canUseCourseEditor()) return;
    if (this.courseEditorBufferDirty()) { this.courseReviewError.set('Finish the open lesson editor before submitting for review.'); return; }
    if (action === 'return' && !this.courseReviewReason().trim()) { this.courseReviewError.set('Enter a reason before returning this revision.'); return; }
    const isCurrent = this.courseResponseIsCurrent();
    this.courseReviewPending.set(true); this.courseReviewError.set('');
    try {
      if (action === 'submit') {
        await this.submitCourse();
        if (!isCurrent() || this.courseCreateError() || this.courseContentError()) return;
      }
      let review = this.courseReview();
      // Draft saves change the review version. Decisions use the reviewed snapshot;
      // only submission refreshes its version after saving the owner's latest work.
      if (action === 'submit') review = (await this.courseService.loadCourseContent(courseId, token, 'author')).review ?? null;
      if (!isCurrent()) return;
      if (!review) throw new Error('Reload the course before using review actions.');
      const response = await this.courseService.performReviewAction(courseId, action, review, this.courseReviewReason(), token);
      if (!isCurrent()) return;
      const loaded = this.normalizeCourseContent(response);
      this.courseReview.set(response.review!);
      // Archive changes live availability only. Keep the private working buffers
      // and their dirty snapshots, including edits not yet saved by this admin.
      if (action !== 'archive') {
        this.courseContent.set(loaded);
        const draft = this.courseDraftFromCourse(response.review!.course);
        this.courseDraft.set(draft); this.initialCourseDraftSnapshot.set(this.serializeCourseDraft(draft));
        this.initialCourseContentSnapshot.set(this.serializeCourseContent(loaded));
        this.courseReviewReason.set('');
      }
      this.showCourseSaveNotice(action === 'publish' ? 'Revision published.' : action === 'return' ? 'Revision returned for changes.' : action === 'submit' ? 'Submitted for admin review.' : action === 'archive' ? 'Course archived; existing learners retain access.' : 'Private revision started; learners keep the published version.');
      try {
        const courses = await this.courseService.listCourses(token);
        if (isCurrent()) this.availableCourses.set(courses);
      } catch { if (isCurrent()) this.coursesError.set('Review action saved. Reload the catalog to see its current state.'); }
    } catch (error) { if (isCurrent()) this.courseReviewError.set(error instanceof Error ? error.message : 'Unable to save the review action. Please retry.'); }
    finally { if (isCurrent()) this.courseReviewPending.set(false); }
  }

  reloadAdminFeedback(): void {
    void this.loadAdminFeedback(true);
  }

  async saveCoursePrice(courseId: string, priceDkk: number | null): Promise<void> {
    const isCurrent = this.courseResponseIsCurrent();
    const token = this.loginState()?.token;

    if (!token || !this.loginState()?.permissions.hasAdminAccess) {
      return;
    }

    this.coursePriceSaving.set(true);
    this.clearCoursePriceNotice();

    try {
      const result = await this.courseService.saveCoursePrice(courseId, priceDkk, token);

      if (!isCurrent()) return;

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
      if (!isCurrent()) return;
      this.showCoursePriceNotice('Unable to save course price. Please try again.', true);
    } finally {
      if (!isCurrent()) return;
      this.coursePriceSaving.set(false);
    }
  }

  async saveCourseCatalogMetadata(
    courseId: string,
    metadata: CourseCatalogMetadataDraft,
  ): Promise<void> {
    const isCurrent = this.courseResponseIsCurrent();
    const token = this.loginState()?.token;

    if (!token || !this.loginState()?.permissions.hasAdminAccess) {
      return;
    }

    this.courseCatalogSaving.set(true);
    this.clearCourseCatalogNotice();

    try {
      const result = await this.courseService.saveCourseCatalogMetadata(courseId, metadata, token);

      if (!isCurrent()) return;

      if (!result.ok) {
        this.showCourseCatalogNotice(result.message, true);
        return;
      }

      this.availableCourses.update((courses) =>
        courses.map((course) => (course.id === result.course.id ? result.course : course)),
      );
      this.showCourseCatalogNotice('Catalog settings saved.', false);
    } catch {
      if (!isCurrent()) return;
      this.showCourseCatalogNotice('Unable to save catalog settings. Please try again.', true);
    } finally {
      if (!isCurrent()) return;
      this.courseCatalogSaving.set(false);
    }
  }

  async uploadCourseThumbnail(file: File): Promise<void> {
    const isCurrent = this.courseResponseIsCurrent();
    const token = this.loginState()?.token;
    const courseId = this.courseEditingId();

    if (!token || !courseId || this.courseThumbnailUploading()) {
      return;
    }

    if (!this.canEditCourse(this.editingCourse())) {
      this.courseThumbnailError.set('You do not have permission to edit this course.');
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.courseThumbnailError.set('Use a JPEG, PNG, or WebP thumbnail.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      this.courseThumbnailError.set('Thumbnail images must be 2 MB or smaller.');
      return;
    }

    this.courseThumbnailUploading.set(true);
    this.courseThumbnailError.set('');

    try {
      const result = await this.courseService.uploadCourseThumbnail(courseId, file, token, this.courseReview());

      if (!isCurrent()) return;

      if (!result.ok) {
        this.courseSaveFailed(result, 'content');
        this.courseThumbnailError.set(result.message);
        return;
      }

      await this.courseService.preloadCourseThumbnails([result.course], token);
      if (!isCurrent()) return;
      if (result.review) this.courseReview.set(result.review);
      else if (this.courseReview()) this.courseReview.update(review => review ? { ...review, course: { ...review.course, thumbnailAssetId: result.course.thumbnailAssetId } } : null);
      if (!this.courseReview()?.liveStatus)
      this.availableCourses.update((courses) =>
        courses.map((course) => (course.id === result.course.id ? result.course : course)),
      );
      this.showCourseSaveNotice('Course thumbnail updated.');
    } catch {
      if (!isCurrent()) return;
      this.courseThumbnailError.set('Unable to upload the course thumbnail. Please try again.');
    } finally {
      if (!isCurrent()) return;
      this.courseThumbnailUploading.set(false);
    }
  }

  async enrollInCourse(courseId: string): Promise<void> {
    const isCurrent = this.courseResponseIsCurrent();
    const token = this.loginState()?.token;

    if (!token || this.courseEnrollmentSubmitting()) {
      this.courseEnrollmentError.set('Please log in again before enrolling.');
      return;
    }

    if (this.enrolledCourseIds().includes(courseId)) {
      this.courseEnrollmentError.set('');
      return;
    }

    this.courseEnrollmentSubmitting.set(true);
    this.courseEnrollmentError.set('');

    try {
      const result = await this.courseService.enrollCourse(courseId, token);

      if (!isCurrent()) return;

      if (!result.ok) {
        this.courseEnrollmentError.set(result.message);
        return;
      }

      const loginState: LoginState = {
        token,
        user: result.login.user,
        permissions: result.login.permissions,
      };
      this.resetCourseOperations();
      this.loginState.set(loginState);
      this.sessionService.updateStoredLoginState(loginState);
      void this.loadCourseContentWhenNeeded();
    } catch {
      if (!isCurrent()) return;
      this.courseEnrollmentError.set('Unable to reach the API. Please try again.');
    } finally {
      if (!isCurrent()) return;
      this.courseEnrollmentSubmitting.set(false);
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
    const isCurrent = this.courseResponseIsCurrent();
    const currentPath = this.currentPath();

    if (
      !this.loginState() ||
      (currentPath !== '/' && currentPath !== '/admin' && !currentPath.startsWith('/courses') && !currentPath.startsWith('/library')) ||
      this.coursesLoading()
    ) {
      return;
    }

    const token = this.loginState()!.token;
    this.coursesLoading.set(true);
    this.coursesError.set('');

    try {
      const courses = await this.loadCourseCatalog();
      if (!isCurrent()) return;
      this.availableCourses.set(courses);
      void this.learningProgress.loadCourses(this.enrolledCourses(), token);
      this.syncCourseEditorDraftFromPath(true);
      await this.courseService.preloadCourseThumbnails(courses, token);
      if (!isCurrent()) return;
      await this.loadCourseContentWhenNeeded();
    } catch (error) {
      if (!isCurrent()) return;
      this.coursesError.set(
        error instanceof Error ? error.message : 'Unable to reach the API. Please try again.',
      );
    } finally {
      if (!isCurrent()) return;
      this.coursesLoading.set(false);
    }
  }

  private async loadCourseCatalog(): Promise<CourseListItem[]> {
    if (!this.courseCatalogLoadPromise) {
      const pending = this.courseService
        .listCourses(this.loginState()!.token)
        .finally(() => {
          if (this.courseCatalogLoadPromise === pending) this.courseCatalogLoadPromise = null;
        });
      this.courseCatalogLoadPromise = pending;
    }

    return this.courseCatalogLoadPromise;
  }

  private async loadCourseContentWhenNeeded(): Promise<void> {
    const courseId = this.courseContentId();
    const token = this.loginState()?.token;
    if (!token || !courseId || (this.isCourseEditorPage() && !this.canUseCourseEditor())) {
      this.courseContentGeneration++;
      this.pendingCourseContentKey = '';
      this.loadedCourseContentView = '';
      this.courseContent.set(null);
      this.courseContentError.set('');
      this.loadedCourseContentId.set(null);
      this.courseContentLoading.set(false);
      return;
    }
    const view = this.isCourseEditorPage() ? 'author' : this.currentPath().startsWith('/library/') ? 'learner' : 'outline';
    const key = `${courseId}:${view}:${token}`;
    if (this.pendingCourseContentKey === key || (this.loadedCourseContentId() === courseId && this.loadedCourseContentView === key)) return;
    const isCurrent = this.courseResponseIsCurrent();
    const generation = ++this.courseContentGeneration;
    this.pendingCourseContentKey = key;
    this.courseContent.set(null);
    this.courseContentLoading.set(true);
    this.courseContentError.set('');
    try {
      const response = view === 'outline' ? await this.courseService.loadCourseOutline(courseId, token) :
        await this.courseService.loadCourseContent(courseId, token, view);
      if (generation !== this.courseContentGeneration || !isCurrent()) return;
      if (view === 'author' && response.review) {
        this.courseReview.set(response.review);
        if (this.serializeCourseDraft(this.courseDraft()) === this.initialCourseDraftSnapshot()) {
          const draft = this.courseDraftFromCourse(response.review.course);
          this.courseDraft.set(draft); this.initialCourseDraftSnapshot.set(this.serializeCourseDraft(draft));
        }
        void this.courseService.preloadCourseThumbnails([response.review.course], token);
      }
      const loadedContent = this.normalizeCourseContent(response);
      this.courseContent.set(loadedContent);
      this.loadedCourseContentId.set(courseId);
      this.loadedCourseContentView = key;
      this.initialCourseContentSnapshot.set(this.serializeCourseContent(loadedContent));
    } catch (error) {
      if (generation !== this.courseContentGeneration || !isCurrent()) return;
      if (view === 'author' && error instanceof Error && error.message === 'Course content not found') {
        const emptyContent = this.createEmptyCourseContent(courseId);
        this.courseContent.set(emptyContent);
        this.loadedCourseContentId.set(courseId);
        this.loadedCourseContentView = key;
        this.initialCourseContentSnapshot.set(this.serializeCourseContent(emptyContent));
      } else {
        this.courseContent.set(null);
        this.loadedCourseContentId.set(null);
        this.loadedCourseContentView = '';
        this.courseContentError.set(error instanceof Error ? error.message : 'Unable to load course content. Please try again.');
      }
    } finally {
      if (generation === this.courseContentGeneration && isCurrent()) {
        this.pendingCourseContentKey = '';
        this.courseContentLoading.set(false);
      }
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

  private signupValidationMessage(input: SignupRequest): string {
    if (input.displayName.trim().length < 2) {
      return 'Enter your full name.';
    }

    if (!input.email.trim()) {
      return 'Enter your email address.';
    }

    if (input.password.length < 8) {
      return 'Password must be at least 8 characters.';
    }

    if (!/[A-Z]/.test(input.password)) {
      return 'Password must include at least one capital letter.';
    }

    if (!/[0-9]/.test(input.password)) {
      return 'Password must include at least one number.';
    }

    return '';
  }

  private syncCourseEditorDraftFromPath(allowMissingCourseError = false): void {
    const path = this.currentPath();
    if (!this.isCourseEditorPage()) {
      this.initializedCourseEditorPath = '';
      return;
    }
    if (this.initializedCourseEditorPath === path) return;

    if (path === '/courses/new') {
      this.initializedCourseEditorPath = path;
      this.clearCourseSaveNotice();
      this.courseCreateError.set('');
      this.courseContentError.set('');
      this.courseContent.set(null);
      this.loadedCourseContentId.set(null);
      this.courseThumbnailUploading.set(false);
      this.courseThumbnailError.set('');
      this.attachmentUploadComponentId.set('');
      this.attachmentUploadProgress.set({});
      this.attachmentUploadStage.set({});
      this.attachmentUploadError.set('');
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

    if (!this.canEditCourse(course)) return;
    this.initializedCourseEditorPath = path;
    this.clearCourseSaveNotice();

    this.courseCreateError.set('');
    this.courseThumbnailError.set('');
    const draft = this.courseDraftFromCourse(course);
    this.courseDraft.set(draft);
    this.initialCourseDraftSnapshot.set(this.serializeCourseDraft(draft));
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

  private showCourseCatalogNotice(message: string, isError: boolean): void {
    if (this.courseCatalogNoticeTimeout) {
      clearTimeout(this.courseCatalogNoticeTimeout);
    }

    this.courseCatalogNotice.set(message);
    this.courseCatalogNoticeError.set(isError);
    this.courseCatalogNoticeTimeout = setTimeout(() => {
      this.courseCatalogNotice.set('');
      this.courseCatalogNoticeError.set(false);
      this.courseCatalogNoticeTimeout = null;
    }, 4000);
  }

  private clearCourseCatalogNotice(): void {
    if (this.courseCatalogNoticeTimeout) {
      clearTimeout(this.courseCatalogNoticeTimeout);
      this.courseCatalogNoticeTimeout = null;
    }

    this.courseCatalogNotice.set('');
    this.courseCatalogNoticeError.set(false);
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

  private updateCourseComponentMuxStatus(
    sectionIndex: number,
    componentIndex: number,
    status: MuxVideoStatus,
    errorMessage = '',
  ): void {
    const wasClean = this.courseContent() && this.serializeCourseContent(this.courseContent()!) === this.initialCourseContentSnapshot();
    this.updateCourseComponent(sectionIndex, componentIndex, (component) => {
      if (component.type !== 'video' || !component.mux) {
        return component;
      }

      return {
        ...component,
        mux: {
          ...component.mux,
          status,
          errorMessage,
        },
      };
    });
    if (wasClean && this.courseContent()) this.initialCourseContentSnapshot.set(this.serializeCourseContent(this.courseContent()!));
  }

  private replacePendingAttachmentMarker(
    content: CourseContentDocument,
    attachment: CourseComponent['attachments'][number],
    markerId: string,
  ): CourseContentDocument {
    const escapedMarker = this.escapeRegExp(markerId);

    return {
      ...content,
      sections: content.sections.map((section) => ({
        ...section,
        components: section.components.map((component) => ({
          ...component,
          content: component.content
            .replace(/rich-attachment-card is-pending/g, 'rich-attachment-card')
            .replace(new RegExp(`rich-attachment-asset-${escapedMarker}`, 'g'), `rich-attachment-asset-${attachment.assetId}`)
            .replace(new RegExp(`id="rich-attachment-${escapedMarker}"`, 'g'), `id="rich-attachment-${attachment.assetId}"`)
            .replace(new RegExp(`data-attachment-id="${escapedMarker}"`, 'g'), `data-attachment-id="${attachment.assetId}"`)
            .replace(new RegExp(`data-attachment-pending="true"`, 'g'), 'data-attachment-pending="false"')
            .replace(/<small>(?:Uploading(?:\s+\d+%)?|Saving file\.\.\.)<\/small>/g, `<small>${this.formatAttachmentSize(attachment.sizeBytes)}</small>`)
            .replace(/<span class="rich-attachment-progress"><span style="width:\s*\d+%;?"><\/span><\/span>/g, '')
            .replace(new RegExp(`data-attachment-download="${escapedMarker}"`, 'g'), `data-attachment-download="${attachment.assetId}"`)
            .replace(new RegExp(`data-attachment-remove="${escapedMarker}"`, 'g'), `data-attachment-remove="${attachment.assetId}"`),
        })),
      })),
    };
  }

  private removeAttachmentMarker(content: CourseContentDocument, assetId: string): CourseContentDocument {
    const escapedAssetId = this.escapeRegExp(assetId);
    const attachmentPattern = new RegExp(
      `<div[^>]*(?:class="[^"]*rich-attachment-card[^"]*rich-attachment-asset-${escapedAssetId}[^"]*"|class="[^"]*rich-attachment-card[^"]*"[^>]*(?:data-attachment-id="${escapedAssetId}"|id="rich-attachment-${escapedAssetId}"))[^>]*[\\s\\S]*?<\\/div>`,
      'g',
    );

    return {
      ...content,
      sections: content.sections.map((section) => ({
        ...section,
        components: section.components.map((component) => ({
          ...component,
          content: component.content.replace(attachmentPattern, ''),
        })),
      })),
    };
  }

  private formatAttachmentSize(sizeBytes: number): string {
    if (sizeBytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
    }

    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private uploadFileToMux(
    uploadUrl: string,
    file: File,
    onProgress: (progress: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const upload = UpChunk.createUpload({
        endpoint: uploadUrl,
        file,
        dynamicChunkSize: true,
      });

      upload.on('progress', (event) => {
        const progress = typeof event.detail === 'number' ? event.detail : 0;

        onProgress(Math.round(progress));
      });
      upload.on('success', () => resolve());
      upload.on('error', (event) => {
        const detail = event.detail;
        const message = typeof detail === 'string' ? detail : 'Mux upload failed.';

        reject(new Error(message));
      });
    });
  }

  private async refreshMuxVideoUntilReady(
    courseId: string,
    componentId: string,
    remainingAttempts = 12,
  ): Promise<void> {
    const token = this.loginState()?.token;
    const generation = this.courseContentGeneration;
    const isCurrent = this.courseResponseIsCurrent();
    const stillEditing = () => isCurrent() && this.loginState()?.token === token && generation === this.courseContentGeneration &&
      this.isCourseEditorPage() && this.courseContentId() === courseId && this.canUseCourseEditor() && this.loadedCourseContentId() === courseId;
    if (!token || remainingAttempts <= 0 || !stillEditing()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
    if (!stillEditing()) return;

    try {
      const loadedContent = this.normalizeCourseContent(await this.courseService.loadCourseContent(courseId, token, 'author'));
      if (!stillEditing()) return;
      this.applyCourseBackgroundRefresh(loadedContent);
      this.loadedCourseContentId.set(courseId);

      const component = this.findCourseComponent(loadedContent, componentId);
      if (component?.type === 'video' && (component.mux?.status === 'ready' || component.mux?.status === 'errored')) {
        return;
      }
    } catch {
      return;
    }

    await this.refreshMuxVideoUntilReady(courseId, componentId, remainingAttempts - 1);
  }

  private findCourseComponent(content: CourseContentDocument, componentId: string): CourseComponent | null {
    for (const section of content.sections) {
      const component = section.components.find((item) => item.id === componentId);

      if (component) {
        return component;
      }
    }

    return null;
  }

  private createContentId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private createCourseComponent(type: CourseComponentType, componentNumber: number): CourseComponent {
    const base = {
      id: this.createContentId('component'),
      title: `New component ${componentNumber}`,
      durationMinutes: 0,
      content: '',
      resourceUrl: '',
      attachments: [],
    };

    switch (type) {
      case 'quiz':
        return {
          ...base,
          type: 'quiz',
          content: 'New question',
          quiz: this.createEmptyQuizContent(),
        };
      case 'video':
        return {
          ...base,
          type: 'video',
        };
      case 'resources':
        return {
          ...base,
          type: 'resources',
          title: `Resources ${componentNumber}`,
        };
      default:
        return {
          ...base,
          type: 'text',
        };
    }
  }

  private createEmptyQuizContent(): QuizComponentContent {
    return {
      passPoints: 1,
      questions: [this.createEmptyQuizQuestion(1)],
    };
  }

  private createEmptyQuizQuestion(questionNumber: number) {
    return {
      id: this.createContentId(`question-${questionNumber}`),
      question: 'New question',
      points: 1,
      answers: [
        this.createEmptyQuizAnswer(1),
        this.createEmptyQuizAnswer(2),
        this.createEmptyQuizAnswer(3),
        this.createEmptyQuizAnswer(4),
      ] as QuizComponentContent['questions'][number]['answers'],
    };
  }

  private createEmptyQuizAnswer(answerNumber: number) {
    return {
      id: this.createContentId(`answer-${answerNumber}`),
      text: '',
      description: '',
      isCorrect: false,
    };
  }

  private primaryQuizQuestionText(quiz: QuizComponentContent): string {
    return quiz.questions[0]?.question?.trim() || '';
  }

  private isAllowedComponentAttachment(type: CourseComponentType, file: File): boolean {
    const contentType = file.type.toLowerCase();
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const isImage =
      contentType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension);
    const isPowerPoint =
      [
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ].includes(contentType) || ['ppt', 'pptx'].includes(extension);

    if (type === 'resources') {
      return (
        isImage ||
        isPowerPoint ||
        ['application/zip', 'application/x-zip-compressed'].includes(contentType) ||
        extension === 'zip'
      );
    }

    return (
      isImage ||
      isPowerPoint ||
      contentType === 'application/pdf' ||
      contentType === 'text/plain' ||
      contentType === 'application/msword' ||
      contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ['pdf', 'txt', 'doc', 'docx'].includes(extension)
    );
  }

  private courseDraftFromCourse(course: CourseListItem): CourseCreateDraft {
    return {
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
    };
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

  private normalizeCourseContent(content: CourseContentDocument): CourseContentDocument {
    if (content.view === 'outline' || content.view === 'learner') return content;
    return {
      ...content,
      sections: content.sections.map((section) => ({
        ...section,
        components: section.components.map((component) => {
          const componentWithAttachments = {
            ...component,
            attachments: Array.isArray(component.attachments) ? component.attachments : [],
          };

          if (component.type !== 'quiz') {
            return componentWithAttachments;
          }

          const existingQuiz = 'quiz' in componentWithAttachments ? componentWithAttachments.quiz : undefined;
          const fallbackQuiz = this.createEmptyQuizContent();
          const legacyQuestion =
            existingQuiz && 'question' in existingQuiz && typeof existingQuiz.question === 'string'
              ? existingQuiz.question
              : componentWithAttachments.content;
          const legacyPoints =
            existingQuiz && 'points' in existingQuiz && typeof existingQuiz.points === 'number'
              ? existingQuiz.points
              : 1;
          const legacyAnswers =
            existingQuiz && 'answers' in existingQuiz && Array.isArray(existingQuiz.answers)
              ? existingQuiz.answers
              : [];
          const existingQuestions =
            existingQuiz && 'questions' in existingQuiz && Array.isArray(existingQuiz.questions)
              ? existingQuiz.questions
              : [];
          const questionsSource =
            existingQuestions.length > 0
              ? existingQuestions
              : [
                  {
                    id: this.createContentId('question-1'),
                    question: legacyQuestion,
                    points: legacyPoints,
                    answers: legacyAnswers,
                  },
                ];

          return {
            ...component,
            attachments: componentWithAttachments.attachments,
            content:
              questionsSource[0]?.question && typeof questionsSource[0].question === 'string'
                ? questionsSource[0].question
                : componentWithAttachments.content,
            quiz: {
              passPoints:
                existingQuiz?.passPoints && existingQuiz.passPoints > 0 ? existingQuiz.passPoints : 1,
              questions: questionsSource.map((question, questionIndex) => {
                const fallbackQuestion = this.createEmptyQuizQuestion(questionIndex + 1);

                return {
                  id:
                    'id' in question && typeof question.id === 'string'
                      ? question.id
                      : fallbackQuestion.id,
                  question:
                    'question' in question && typeof question.question === 'string'
                      ? question.question
                      : fallbackQuestion.question,
                  points:
                    'points' in question &&
                    typeof question.points === 'number' &&
                    question.points > 0
                      ? question.points
                      : 1,
                  answers: fallbackQuestion.answers.map((fallbackAnswer, answerIndex) => {
                    const answer =
                      'answers' in question && Array.isArray(question.answers)
                        ? question.answers[answerIndex]
                        : undefined;

                    return {
                      id:
                        answer && typeof answer.id === 'string'
                          ? answer.id
                          : fallbackAnswer.id,
                      text:
                        answer && typeof answer.text === 'string'
                          ? answer.text
                          : '',
                      description:
                        answer && typeof answer.description === 'string'
                          ? answer.description
                          : '',
                      isCorrect:
                        answer && typeof answer.isCorrect === 'boolean'
                          ? answer.isCorrect
                          : false,
                    };
                  }) as QuizComponentContent['questions'][number]['answers'],
                };
              }),
            },
          };
        }),
      })),
    };
  }

  private courseEditIdFromPath(path: string): string | null {
    const match = path.match(/^\/courses\/([^/]+)\/edit$/);

    if (!match) {
      return null;
    }

    return decodeURIComponent(match[1]);
  }

  private courseViewIdFromPath(path: string): string | null {
    return this.courseCatalogIdFromPath(path) ?? this.libraryCourseViewIdFromPath(path);
  }

  private courseCatalogIdFromPath(path: string): string | null {
    const match = path.match(/^\/courses\/([^/]+)$/);

    if (!match) {
      return null;
    }

    return decodeURIComponent(match[1]);
  }

  private libraryCourseViewIdFromPath(path: string): string | null {
    const match = path.match(/^\/library\/([^/]+)$/);

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

    if (this.isProfilePage()) {
      return 'Profile';
    }

    if (this.isLibraryPage() || this.isLearningWorkspacePage()) {
      return 'My Learning';
    }

    return this.isCoursesPage() || this.isCourseEditorPage() || this.isCourseViewPage()
      ? 'Catalog'
      : 'Home';
  }

  private normalizePath(path: string): string {
    const withoutQuery = path.split('?')[0]?.split('#')[0] || '/';

    if (
      withoutQuery === '/courses' ||
      withoutQuery === '/courses/new' ||
      withoutQuery === '/library' ||
      withoutQuery === '/profile'
    ) {
      return withoutQuery;
    }

    if (/^\/courses\/[^/]+(?:\/edit)?$/.test(withoutQuery) || /^\/library\/[^/]+$/.test(withoutQuery)) {
      return withoutQuery;
    }

    if (withoutQuery.endsWith('/admin')) {
      return '/admin';
    }

    if (withoutQuery.endsWith('/library')) {
      return '/library';
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

}
