import { Component, computed, signal } from '@angular/core';

type UserRole = 'student' | 'teacher' | 'admin';

type LoginResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
    status: 'active' | 'disabled';
    createdAt: string;
  };
  permissions: {
    canCreateCourses: boolean;
    hasAdminAccess: boolean;
  };
};

type LoginState = {
  user: LoginResponse['user'];
  permissions: LoginResponse['permissions'];
};

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly appVersion = '0.1.5';
  protected readonly currentYear = new Date().getFullYear();

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly rememberMe = signal(true);
  protected readonly passwordVisible = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly loginError = signal('');
  protected readonly loginState = signal<LoginState | null>(this.restoreLoginState());

  protected readonly isFeedbackOpen = signal(false);
  protected readonly feedbackPage = signal('');
  protected readonly feedbackRating = signal('great');
  protected readonly feedbackText = signal('');
  protected readonly feedbackSubmitted = signal(false);

  protected readonly canSubmit = computed(
    () => this.email().trim().length > 0 && this.password().trim().length > 0 && !this.isSubmitting(),
  );

  protected readonly feedbackOptions = [
    { value: 'great', icon: ':)', label: 'Great' },
    { value: 'okay', icon: ':|', label: 'Okay' },
    { value: 'needs-work', icon: ':(', label: 'Needs work' },
  ];

  protected readonly learningHighlights = [
    'Career paths for manual, agile, and advanced testing roles.',
    'Structured courses built around ISTQB and practical training.',
    'One place for learning progress, certifications, and follow-up.',
  ];

  protected readonly student = computed(() => ({
    name: this.loginState()?.user.displayName || 'Alex',
    currentRole: this.currentRoleLabel(this.loginState()?.user.role),
    targetRole: this.targetRoleLabel(this.loginState()?.user.role),
    pathProgress: this.pathProgressValue(this.loginState()?.user.role),
  }));

  protected readonly courses = signal([
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

  protected readonly nextActions = computed(() => {
    const role = this.loginState()?.user.role;
    const roleSpecificAction =
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

  protected readonly activeCourse = computed(
    () => this.courses().find((course) => course.status === 'In progress') ?? this.courses()[0],
  );

  protected readonly recommendedCourses = computed(() =>
    this.courses().filter((course) => course.status === 'Recommended'),
  );

  protected updateEmail(value: string): void {
    this.email.set(value);
    this.loginError.set('');
  }

  protected updatePassword(value: string): void {
    this.password.set(value);
    this.loginError.set('');
  }

  protected toggleRememberMe(): void {
    this.rememberMe.update((value) => !value);
  }

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((value) => !value);
  }

  protected async submitLogin(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }

    this.isSubmitting.set(true);
    this.loginError.set('');

    try {
      const response = await fetch(`${this.apiBaseUrl()}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: this.email().trim(),
          password: this.password(),
        }),
      });

      const body = (await response.json()) as LoginResponse | { message?: string };

      if (!response.ok) {
        this.loginState.set(null);
        this.clearStoredSession();
        const errorMessage = 'message' in body ? body.message : undefined;
        this.loginError.set(errorMessage ?? 'Unable to log in.');
        return;
      }

      const login = body as LoginResponse;
      this.loginState.set({
        user: login.user,
        permissions: login.permissions,
      });
      this.storeSession(login);
      this.password.set('');
      this.feedbackSubmitted.set(false);
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch {
      this.loginState.set(null);
      this.clearStoredSession();
      this.loginError.set(
        'Unable to reach the API. Make sure the backend is running on port 3001.',
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected logout(): void {
    this.loginState.set(null);
    this.password.set('');
    this.loginError.set('');
    this.isFeedbackOpen.set(false);
    this.clearStoredSession();
  }

  protected openFeedback(): void {
    this.feedbackPage.set(this.currentPageLabel());
    this.feedbackSubmitted.set(false);
    this.isFeedbackOpen.set(true);
  }

  protected closeFeedback(): void {
    this.isFeedbackOpen.set(false);
  }

  protected selectFeedbackRating(rating: string): void {
    this.feedbackRating.set(rating);
  }

  protected updateFeedbackText(text: string): void {
    this.feedbackText.set(text);
  }

  protected submitFeedback(): void {
    this.feedbackSubmitted.set(true);
  }

  private apiBaseUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${window.location.hostname}:3001`;
  }

  private storeSession(login: LoginResponse): void {
    const storage = this.rememberMe() ? window.localStorage : window.sessionStorage;
    const otherStorage = this.rememberMe() ? window.sessionStorage : window.localStorage;

    otherStorage.removeItem('qiEducationSession');
    storage.setItem(
      'qiEducationSession',
      JSON.stringify({
        token: login.token,
        user: login.user,
        permissions: login.permissions,
      }),
    );
  }

  private clearStoredSession(): void {
    window.localStorage.removeItem('qiEducationSession');
    window.sessionStorage.removeItem('qiEducationSession');
  }

  private restoreLoginState(): LoginState | null {
    const rawSession =
      window.localStorage.getItem('qiEducationSession') ??
      window.sessionStorage.getItem('qiEducationSession');

    if (!rawSession) {
      return null;
    }

    try {
      const session = JSON.parse(rawSession) as {
        user: LoginResponse['user'];
        permissions: LoginResponse['permissions'];
      };

      return {
        user: session.user,
        permissions: session.permissions,
      };
    } catch {
      this.clearStoredSession();
      return null;
    }
  }

  private currentPageLabel(): string {
    return this.loginState() ? 'Home' : 'Login';
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
