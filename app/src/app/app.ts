import { Component, computed, signal } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly appVersion = '0.1.2';
  protected readonly currentYear = new Date().getFullYear();
  protected readonly isFeedbackOpen = signal(false);
  protected readonly feedbackPage = signal('');
  protected readonly feedbackRating = signal('great');
  protected readonly feedbackText = signal('');
  protected readonly feedbackSubmitted = signal(false);

  protected readonly feedbackOptions = [
    { value: 'great', icon: ':)', label: 'Great' },
    { value: 'okay', icon: ':|', label: 'Okay' },
    { value: 'needs-work', icon: ':(', label: 'Needs work' },
  ];

  protected readonly student = signal({
    name: 'Alex',
    currentRole: 'Manual tester',
    targetRole: 'ISTQB Advanced Test Analyst',
    pathProgress: 38,
  });

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

  protected readonly nextActions = signal([
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
    {
      title: 'Pick a specialization track',
      chapter: 'Next step',
      meta: 'Agile, technical, or management.',
      state: 'next',
      progress: 0,
    },
  ]);

  protected readonly activeCourse = computed(
    () => this.courses().find((course) => course.status === 'In progress') ?? this.courses()[0],
  );

  protected readonly recommendedCourses = computed(() =>
    this.courses().filter((course) => course.status === 'Recommended'),
  );

  protected logout(): void {
    // Auth integration will replace this placeholder.
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

  private currentPageLabel(): string {
    const path = window.location.pathname === '/' ? 'Home' : window.location.pathname;
    return window.location.hash ? `${path} ${window.location.hash}` : path;
  }
}
