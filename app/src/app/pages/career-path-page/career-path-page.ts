import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { lucideCheck, lucideChevronLeft, lucideChevronRight } from '@ng-icons/lucide';
import { CareerPath, FeedbackOption, StudentSummary } from '../../app.models';
import { CareerTree } from '../../ui/career-tree/career-tree';
import { CareerMap } from '../../ui/career-map/career-map';
import { CareerPathService } from '../../services/career-path.service';
import { ConfirmService } from '../../services/confirm.service';
import { Button } from '../../ui/button/button';
import { IconButton } from '../../ui/icon-button/icon-button';
import { CvScan } from '../../ui/cv-scan/cv-scan';
import { plural } from '../../utils/plural';
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

const CAREER_WINDOW = 4;

@Component({
  selector: 'app-career-path-page',
  imports: [Button, CareerMap, CareerTree, CvScan, IconButton, PageHeader],
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
    { id: 'upload', label: 'Your CV' }, { id: 'questions', label: 'Questions' },
    { id: 'choose-career', label: 'Choose career' }, { id: 'roadmap', label: 'Your path' },
  ];
  protected readonly setupIndex = computed(() => this.setupSteps.findIndex((item) => item.id === this.wizardStep()));

  protected readonly wizardStep = signal<CareerPathWizardStep>('intro');
  protected readonly cvScanOpen = signal(false);
  protected readonly cvSaved = signal('');
  protected readonly questionAnswers = signal<Record<string, boolean>>({});
  protected readonly draftPathId = signal('');
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  // A career being previewed without following it; empty means the saved focus is shown.
  protected readonly previewPathId = signal('');
  // US-L026: the all-careers map, opened from the tree.
  protected readonly mapOpen = signal(false);

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

  // More than four careers: show four at a time and step one career per click.
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly checkIcon = this.sanitizer.bypassSecurityTrustHtml(lucideCheck);
  protected readonly previousIcon = this.sanitizer.bypassSecurityTrustHtml(lucideChevronLeft);
  protected readonly nextIcon = this.sanitizer.bypassSecurityTrustHtml(lucideChevronRight);
  private readonly requestedCareerStart = signal(0);
  protected readonly careerCarousel = computed(() => this.orderedPaths().length > CAREER_WINDOW);
  protected readonly maxCareerStart = computed(() => Math.max(0, this.orderedPaths().length - CAREER_WINDOW));
  protected readonly careerStart = computed(() => Math.min(this.requestedCareerStart(), this.maxCareerStart()));
  protected readonly visiblePaths = computed(() =>
    this.orderedPaths().slice(this.careerStart(), this.careerStart() + CAREER_WINDOW));
  protected readonly careerRangeLabel = computed(() =>
    `Careers ${this.careerStart() + 1} to ${this.careerStart() + this.visiblePaths().length} of ${this.orderedPaths().length}`);

  // Wraps at the ends so the buttons never disable under keyboard focus.
  protected moveCareers(step: 1 | -1): void {
    const positions = this.maxCareerStart() + 1;
    this.requestedCareerStart.set((this.careerStart() + step + positions) % positions);
  }

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
      milestones: path.steps.length,
      available: courses.filter((course) => course.available).length,
      total: courses.length,
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

  protected continueToQuestions(): void {
    this.showStep('questions');
  }

  protected toggleCvScan(): void {
    this.cvSaved.set('');
    this.cvScanOpen.update((open) => !open);
  }

  protected cvScanDone(saved: number): void {
    this.cvScanOpen.set(false);
    this.cvSaved.set(saved ? `Saved ${plural(saved, 'achievement')} from your CV.` : '');
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

  /** US-L026: shows a career from the map as a preview, so followed careers and focus never change. */
  protected openFromMap(pathId: string): void {
    this.mapOpen.set(false);
    this.previewPathId.set(pathId);
    this.saveError.set('');
    this.showStep('roadmap');
  }

  protected async unfollow(path: CareerPath): Promise<void> {
    if (!await this.confirm.ask({ title: `Stop following ${path.title}?`, confirmLabel: 'Stop following',
      message: 'Your achievements, completed courses and enrollments are kept. You can follow it again at any time.' })) return;
    await this.save(path.id, () => this.careerPath.unfollow(path.id), false);
  }

  /** Stops following every career and reopens setup at Stage 01; achievements and courses are kept. */
  protected async startOver(): Promise<void> {
    const followed = this.followedPaths();
    if (this.saving() || !followed.length) return;
    if (!await this.confirm.ask({ title: 'Start your career path over?', confirmLabel: 'Start over',
      message: `You'll stop following all ${plural(followed.length, 'career')} and go back to the first step. ` +
        'Your achievements, completed courses and enrollments are kept.' })) return;
    this.saving.set(true);
    this.saveError.set('');
    // One at a time; a failure stops here and a second Start over finishes what is left.
    for (const path of followed) {
      const result = await this.careerPath.unfollow(path.id);
      if (!result.ok) {
        this.saving.set(false);
        this.saveError.set(`Not saved. ${result.message}`);
        return;
      }
    }
    this.saving.set(false);
    this.questionAnswers.set({});
    this.previewPathId.set('');
    this.draftPathId.set('');
    this.cvScanOpen.set(false);
    this.showStep('upload');
  }

  protected achievedCount(path: CareerPath): number {
    if (path.schemaVersion !== 2) return this.careerPath.progressFor(path).doneStepIds.size;
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
