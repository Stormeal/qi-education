import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CareerPath, FeedbackOption, StudentSummary } from '../../app.models';
import { CareerPathService } from '../../services/career-path.service';
import { FeedbackDialog } from '../../ui/feedback-dialog/feedback-dialog';
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
  imports: [FeedbackDialog, PageHeader, RouterLink],
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
  protected readonly careerQuestions = CAREER_QUESTIONS;

  protected readonly wizardStep = signal<CareerPathWizardStep>('intro');
  protected readonly isDraggingOverDropzone = signal(false);
  protected readonly cvFileName = signal('');
  protected readonly questionAnswers = signal<Record<string, boolean>>({});
  protected readonly draftPathId = signal('');
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly confirmingPathId = signal('');

  // What changing to the path being confirmed would mean, before anything is saved.
  protected readonly switchImpact = computed(() => {
    const path = this.careerPath.paths().find((item) => item.id === this.confirmingPathId());
    if (!path) return null;
    const done = this.careerPath.progressFor(path).doneStepIds;
    const required = path.steps.filter((step) => step.required);
    return {
      total: required.length,
      kept: required.filter((step) => done.has(step.id)).map((step) => step.title).join(', '),
      keptCount: required.filter((step) => done.has(step.id)).length,
      fresh: required.filter((step) => !done.has(step.id)).map((step) => step.title).join(', '),
    };
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
    const path = this.careerPath.selectedPath();
    const progress = this.careerPath.progress();
    if (!path || !progress) return [];

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
      if (this.careerPath.state() === 'ready' && this.careerPath.selectedPath() && this.wizardStep() === 'intro') {
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

  // Replacing a saved path asks first; a first choice, or re-choosing the current path, saves directly.
  protected choosePath(pathId: string): void {
    const current = this.careerPath.selectedPath();
    if (!current || current.id === pathId) {
      void this.savePath(pathId);
      return;
    }
    this.saveError.set('');
    this.draftPathId.set('');
    this.confirmingPathId.set(pathId);
    this.focusAfterRender('.cp-switch');
    void this.careerPath.loadOutlines(this.careerPath.paths().find((path) => path.id === pathId) ?? null);
  }

  protected cancelSwitch(): void {
    this.focusAfterRender(`[data-path="${this.confirmingPathId()}"] .cp-btn`);
    this.saveError.set('');
    this.draftPathId.set('');
    this.confirmingPathId.set('');
  }

  protected async savePath(pathId: string): Promise<void> {
    if (this.saving()) return;
    this.draftPathId.set(pathId);
    this.saveError.set('');
    this.saving.set(true);
    const result = await this.careerPath.select(pathId);
    this.saving.set(false);

    if (result.ok) {
      this.confirmingPathId.set('');
      this.showStep('roadmap');
    } else this.saveError.set(`Your choice was not saved. ${result.message}`);
  }
}
