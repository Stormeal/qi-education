import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CareerPath, FeedbackOption, StudentSummary } from '../../app.models';
import { CareerTree } from '../../ui/career-tree/career-tree';
import { CareerPathService } from '../../services/career-path.service';
import { ConfirmService } from '../../services/confirm.service';
import { FeedbackDialog } from '../../ui/feedback-dialog/feedback-dialog';
import { Button } from '../../ui/button/button';
import { PageHeader } from '../../ui/page-header/page-header';

type CareerPathWizardStep = 'intro' | 'upload' | 'questions' | 'choose-career' | 'roadmap';

type CareerQuestion = { id: string; text: string };

const CAREER_QUESTIONS: CareerQuestion[] = [
  { id: 'leadership', text: 'Are you interested in leading or mentoring a team?' },
  { id: 'automation', text: 'Do you enjoy writing and maintaining automated tests?' },
  { id: 'technical', text: 'Would you like to specialize in a technical domain, like architecture?' },
  { id: 'stakeholders', text: 'Are you comfortable presenting results to stakeholders?' },
];

// First "yes" wins. Only a suggestion, and only shown when that path is published.
const SUGGESTED_PATH_BY_ANSWER: [string, string][] = [
  ['leadership', 'test-manager'],
  ['automation', 'technical-tester'],
  ['technical', 'test-analyst'],
];

@Component({
  selector: 'app-career-path-page',
  imports: [Button, CareerTree, FeedbackDialog, PageHeader, RouterLink],
  templateUrl: './career-path-page.html',
  styleUrls: ['../../app.scss', './career-path-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CareerPathPage {
  readonly appVersion = input.required<string>();
  readonly currentYear = input.required<number>();
  readonly student = input.required<StudentSummary>();
  readonly userEmail = input.required<string>();
  readonly userRoleLabel = input.required<string>();
  readonly canAccessAdmin = input.required<boolean>();
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
  readonly adminClicked = output<void>();
  readonly feedbackClosed = output<void>();
  readonly feedbackRatingSelected = output<string>();
  readonly feedbackTextChanged = output<string>();
  readonly feedbackSubmittedClicked = output<void>();
  protected readonly careerPath = inject(CareerPathService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly confirm = inject(ConfirmService);
  protected readonly careerQuestions = CAREER_QUESTIONS;
  protected readonly setupSteps: { id: CareerPathWizardStep; label: string }[] = [
    { id: 'upload', label: 'CV preview' }, { id: 'questions', label: 'Questions' },
    { id: 'choose-career', label: 'Choose career' }, { id: 'roadmap', label: 'Your path' },
  ];
  protected readonly setupIndex = computed(() => this.setupSteps.findIndex((item) => item.id === this.wizardStep()));

  protected readonly wizardStep = signal<CareerPathWizardStep>('intro');
  protected readonly isDraggingOverDropzone = signal(false);
  protected readonly cvFileName = signal('');
  protected readonly questionAnswers = signal<Record<string, boolean>>({});
  protected readonly draftPathId = signal('');
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  // A career being previewed without following it; empty means the saved focus is shown.
  protected readonly previewPathId = signal('');

  protected readonly followedPaths = computed(() => (this.careerPath.careers()?.followedPathIds ?? [])
    .flatMap((id) => this.careerPath.paths().find((path) => path.id === id) ?? []));
  protected readonly viewedPath = computed(() => {
    const id = this.previewPathId() || this.careerPath.careers()?.focusPathId;
    return this.careerPath.paths().find((path) => path.id === id) ?? null;
  });
  // A saved focus whose career is no longer published.
  protected readonly focusWithdrawn = computed(() => {
    const focus = this.careerPath.careers()?.focusPathId;
    return !!focus && !this.previewPathId() && !this.careerPath.paths().some((path) => path.id === focus);
  });

  protected readonly allQuestionsAnswered = computed(
    () => this.careerQuestions.every((question) => this.questionAnswers()[question.id] !== undefined),
  );

  protected readonly suggestedPathId = computed(() => {
    const answers = this.questionAnswers();
    return SUGGESTED_PATH_BY_ANSWER.find(([question]) => answers[question])?.[1] ?? '';
  });

  protected readonly orderedPaths = computed(() => {
    const suggested = this.suggestedPathId();
    return [...this.careerPath.paths()].sort((a, b) => Number(b.id === suggested) - Number(a.id === suggested));
  });

  protected readonly milestones = computed(() => {
    const path = this.viewedPath();
    if (!path) return [];
    const progress = this.careerPath.progressFor(path);

    return path.steps.map((step) => ({
      ...step,
      status: progress.doneStepIds.has(step.id) ? 'complete' : step.id === progress.nextStepId ? 'current' : 'upcoming',
      courses: step.courses.map((course) => ({
        ...course,
        percent: course.available ? this.careerPath.coursePercent(course.courseId) : null,
      })),
    }));
  });

  constructor() {
    // A saved selection opens straight on the learner's path.
    effect(() => {
      if (this.careerPath.state() === 'ready' && this.wizardStep() === 'intro'
        && (this.careerPath.selectedPath() || this.followedPaths().length)) {
        this.wizardStep.set('roadmap');
      }
    });
  }

  protected pathFacts(path: CareerPath) {
    const courses = path.steps.flatMap((step) => step.courses);
    return {
      required: path.steps.filter((step) => step.required).length,
      optional: path.steps.filter((step) => !step.required).length,
      available: courses.filter((course) => course.available).length,
      preview: courses.filter((course) => !course.available).length,
    };
  }

  // A replaced step or button drops keyboard focus to the top of the page; move it to what replaced it.
  private focusAfterRender(selector: string): void {
    setTimeout(() => {
      const target = this.host.nativeElement.querySelector<HTMLElement>(selector);
      if (!target) return;
      if (!target.matches('a, button')) target.tabIndex = -1;
      target.focus();
    });
  }

  private showStep(step: CareerPathWizardStep): void {
    this.wizardStep.set(step);
    this.focusAfterRender('.cp-step h2');
  }

  protected beginWizard(): void {
    this.showStep('upload');
  }

  protected onDropzoneDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingOverDropzone.set(true);
  }

  protected onDropzoneDragLeave(): void {
    this.isDraggingOverDropzone.set(false);
  }

  protected onDropzoneDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingOverDropzone.set(false);
    this.continueToQuestions(event.dataTransfer?.files?.[0]?.name ?? '');
  }

  protected onCvFileSelected(event: Event): void {
    const input = event.target;
    this.continueToQuestions(input instanceof HTMLInputElement ? (input.files?.[0]?.name ?? '') : '');
  }

  // The CV step is a preview: the file never leaves the browser and nothing is read from it.
  protected continueToQuestions(fileName = ''): void {
    this.cvFileName.set(fileName);
    this.showStep('questions');
  }

  protected answerQuestion(questionId: string, answer: boolean): void {
    this.questionAnswers.update((answers) => ({ ...answers, [questionId]: answer }));
  }

  protected continueToCareerChoice(): void {
    this.saveError.set('');
    this.showStep('choose-career');
  }

  protected isFollowed(pathId: string): boolean {
    return this.careerPath.careers()?.followedPathIds.includes(pathId) ?? false;
  }

  /** Following adds a career and shows it; it never replaces another followed career. */
  protected async follow(pathId: string): Promise<void> {
    await this.save(pathId, async () => {
      const followed = await this.careerPath.follow(pathId);
      return followed.ok ? this.careerPath.focus(pathId) : followed;
    });
  }

  /** A followed career becomes the saved focus; any other career is previewed without saving anything. */
  protected async view(pathId: string): Promise<void> {
    if (!this.isFollowed(pathId)) {
      this.previewPathId.set(pathId);
      this.saveError.set('');
      this.showStep('roadmap');
      return;
    }
    await this.save(pathId, () => this.careerPath.focus(pathId));
  }

  protected async unfollow(path: CareerPath): Promise<void> {
    if (!await this.confirm.ask({ title: `Stop following ${path.title}?`, confirmLabel: 'Stop following',
      message: 'Your achievements, completed courses and enrollments are kept. You can follow it again at any time.' })) return;
    await this.save(path.id, () => this.careerPath.unfollow(path.id), false);
  }

  protected achievedCount(path: CareerPath): number {
    const states = this.careerPath.careers()?.milestoneStates ?? {};
    return path.steps.filter((step) => states[step.id] === 'achieved').length;
  }

  private async save(pathId: string, write: () => Promise<{ ok: boolean; message?: string }>, show = true): Promise<void> {
    if (this.saving()) return;
    this.draftPathId.set(pathId);
    this.saveError.set('');
    this.saving.set(true);
    const result = await write();
    this.saving.set(false);
    if (!result.ok) {
      this.saveError.set(`Not saved. ${result.message}`);
      return;
    }
    this.previewPathId.set('');
    this.draftPathId.set('');
    if (show || this.wizardStep() !== 'roadmap') this.showStep('roadmap');
    else this.focusAfterRender('.cp-step h2');
  }

}
