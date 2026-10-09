import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { FeedbackOption, StudentSummary } from '../../app.models';
import { FeedbackDialog } from '../../ui/feedback-dialog/feedback-dialog';
import { PageHeader } from '../../ui/page-header/page-header';

type CareerPathWizardStep = 'intro' | 'upload' | 'processing' | 'questions' | 'choose-career' | 'roadmap';

type DigitalCvExperience = { role: string; company: string; period: string };

type DigitalCv = {
  fileName: string;
  headline: string;
  skills: string[];
  experience: DigitalCvExperience[];
  certifications: string[];
};

type CareerQuestion = { id: string; text: string };

type CareerOption = { id: string; title: string; description: string };

type PathMilestoneStatus = 'complete' | 'current' | 'upcoming';

type PathMilestone = {
  id: string;
  title: string;
  description: string;
  status: PathMilestoneStatus;
  suggestedCourses: string[];
};

const MOCK_DIGITAL_CV: Omit<DigitalCv, 'fileName'> = {
  headline: 'Manual QA Tester',
  skills: ['Manual Testing', 'Test Case Design', 'Jira', 'Agile / Scrum', 'SQL Basics'],
  experience: [
    { role: 'QA Tester', company: 'Nordic Fintech ApS', period: '2023 - Present' },
    { role: 'Junior QA Intern', company: 'Webshop A/S', period: '2022 - 2023' },
  ],
  certifications: ['ISTQB Foundation Level'],
};

const CAREER_QUESTIONS: CareerQuestion[] = [
  { id: 'leadership', text: 'Are you interested in leading or mentoring a team?' },
  { id: 'automation', text: 'Do you enjoy writing and maintaining automated tests?' },
  { id: 'technical', text: 'Would you like to specialize in a technical domain, like architecture?' },
  { id: 'stakeholders', text: 'Are you comfortable presenting results to stakeholders?' },
];

const CAREER_OPTIONS: CareerOption[] = [
  {
    id: 'test-manager',
    title: 'Test Manager',
    description: 'Lead QA teams, own the quality process, and report to stakeholders.',
  },
  {
    id: 'test-architect',
    title: 'Test Architect',
    description: 'Design test strategy and automation architecture across teams.',
  },
  {
    id: 'automation-engineer',
    title: 'Automation Engineer',
    description: 'Build and maintain automated test suites and CI pipelines.',
  },
  {
    id: 'advanced-test-analyst',
    title: 'Advanced Test Analyst',
    description: 'Specialize in deep test analysis and design techniques.',
  },
];

const MILESTONES_BY_CAREER: Record<string, PathMilestone[]> = {
  'test-manager': [
    {
      id: 'foundation',
      title: 'ISTQB Foundation Level',
      description: 'The baseline certification for professional software testers.',
      status: 'complete',
      suggestedCourses: ['ISTQB Foundation 4.0'],
    },
    {
      id: 'advanced-test-manager',
      title: 'ISTQB Advanced Test Manager',
      description: 'Covers test planning, estimation, risk, and team leadership.',
      status: 'current',
      suggestedCourses: ['ISTQB Advanced Test Manager', 'Test Estimation in Practice'],
    },
    {
      id: 'leading-agile-teams',
      title: 'Leading Agile Teams',
      description: 'Build the people and process skills to run a QA team.',
      status: 'upcoming',
      suggestedCourses: ['Leading Agile Teams', 'Coaching for Test Leads'],
    },
    {
      id: 'stakeholder-reporting',
      title: 'Stakeholder Communication & Reporting',
      description: 'Translate quality metrics into decisions stakeholders can act on.',
      status: 'upcoming',
      suggestedCourses: ['Stakeholder Communication & Reporting'],
    },
  ],
  'test-architect': [
    {
      id: 'foundation',
      title: 'ISTQB Foundation Level',
      description: 'The baseline certification for professional software testers.',
      status: 'complete',
      suggestedCourses: ['ISTQB Foundation 4.0'],
    },
    {
      id: 'advanced-test-analyst',
      title: 'ISTQB Advanced Test Analyst',
      description: 'Deepen test analysis and design technique fundamentals.',
      status: 'current',
      suggestedCourses: ['ISTQB Advanced Test Analyst'],
    },
    {
      id: 'advanced-technical-test-analyst',
      title: 'ISTQB Advanced Technical Test Analyst',
      description: 'The technical track: architecture, tooling, and quality attributes.',
      status: 'upcoming',
      suggestedCourses: ['ISTQB Advanced Technical Test Analyst'],
    },
    {
      id: 'test-automation-architecture',
      title: 'Test Automation Architecture',
      description: 'Design frameworks and strategy that scale across teams.',
      status: 'upcoming',
      suggestedCourses: ['Test Automation Architecture', 'Microsoft Playwright in Practice'],
    },
  ],
  'automation-engineer': [
    {
      id: 'foundation',
      title: 'ISTQB Foundation Level',
      description: 'The baseline certification for professional software testers.',
      status: 'complete',
      suggestedCourses: ['ISTQB Foundation 4.0'],
    },
    {
      id: 'selenium-fundamentals',
      title: 'Selenium WebDriver Fundamentals',
      description: 'Get hands-on with the most widely used browser automation tool.',
      status: 'current',
      suggestedCourses: ['Selenium WebDriver Fundamentals'],
    },
    {
      id: 'playwright-in-practice',
      title: 'Microsoft Playwright in Practice',
      description: 'Modern, fast, cross-browser automation for real projects.',
      status: 'upcoming',
      suggestedCourses: ['Microsoft Playwright in Practice'],
    },
    {
      id: 'cicd-for-automation',
      title: 'CI/CD for Test Automation',
      description: 'Wire automated suites into pipelines that run on every change.',
      status: 'upcoming',
      suggestedCourses: ['CI/CD for Test Automation'],
    },
  ],
  'advanced-test-analyst': [
    {
      id: 'foundation',
      title: 'ISTQB Foundation Level',
      description: 'The baseline certification for professional software testers.',
      status: 'complete',
      suggestedCourses: ['ISTQB Foundation 4.0'],
    },
    {
      id: 'test-design-deep-dive',
      title: 'Test Design Techniques Deep Dive',
      description: 'Go beyond the basics of boundary value and equivalence partitioning.',
      status: 'current',
      suggestedCourses: ['Test Design Techniques Deep Dive'],
    },
    {
      id: 'advanced-test-analyst',
      title: 'ISTQB Advanced Test Analyst',
      description: 'The certification that formalizes advanced analysis skills.',
      status: 'upcoming',
      suggestedCourses: ['ISTQB Advanced Test Analyst'],
    },
    {
      id: 'risk-based-testing',
      title: 'Risk-Based Testing Mastery',
      description: 'Prioritize test effort where it protects the most value.',
      status: 'upcoming',
      suggestedCourses: ['Risk-Based Testing Mastery'],
    },
  ],
};

@Component({
  selector: 'app-career-path-page',
  imports: [FeedbackDialog, PageHeader],
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
  readonly hasStartedCareerPath = input.required<boolean>();
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
  readonly startCareerPathClicked = output<void>();

  protected readonly careerOptions = CAREER_OPTIONS;
  protected readonly careerQuestions = CAREER_QUESTIONS;

  protected readonly wizardStep = signal<CareerPathWizardStep>('intro');
  protected readonly isDraggingOverDropzone = signal(false);
  protected readonly digitalCv = signal<DigitalCv | null>(null);
  protected readonly questionAnswers = signal<Record<string, boolean>>({});
  protected readonly selectedCareerId = signal<string | null>(null);

  protected readonly allQuestionsAnswered = computed(
    () => this.careerQuestions.every((question) => this.questionAnswers()[question.id] !== undefined),
  );

  protected readonly recommendedCareerId = computed(() => {
    const answers = this.questionAnswers();

    if (answers['leadership']) {
      return 'test-manager';
    }

    if (answers['technical']) {
      return 'test-architect';
    }

    if (answers['automation']) {
      return 'automation-engineer';
    }

    return 'advanced-test-analyst';
  });

  protected readonly selectedCareer = computed(
    () => this.careerOptions.find((career) => career.id === this.selectedCareerId()) ?? null,
  );

  protected readonly orderedCareerOptions = computed(() => {
    const recommendedId = this.recommendedCareerId();
    const recommended = this.careerOptions.find((career) => career.id === recommendedId);
    const rest = this.careerOptions.filter((career) => career.id !== recommendedId);

    return recommended ? [recommended, ...rest] : this.careerOptions;
  });

  protected readonly activeMilestones = computed(() => {
    const careerId = this.selectedCareerId();

    return careerId ? (MILESTONES_BY_CAREER[careerId] ?? []) : [];
  });

  protected readonly roadmapNodeCount = computed(() => this.activeMilestones().length + 2);

  constructor() {
    effect(() => {
      if (this.hasStartedCareerPath() && this.wizardStep() === 'intro') {
        this.digitalCv.set({ fileName: 'career-test-cv.pdf', ...MOCK_DIGITAL_CV });
        this.questionAnswers.set({ leadership: false, automation: false, technical: true, stakeholders: true });
        this.selectedCareerId.set('test-architect');
        this.wizardStep.set('roadmap');
      }
    });
  }

  protected beginWizard(): void {
    this.startCareerPathClicked.emit();
    this.wizardStep.set('upload');
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
    const file = event.dataTransfer?.files?.[0];

    if (file) {
      this.submitCv(file.name);
    }
  }

  protected onCvFileSelected(event: Event): void {
    const input = event.target;
    const file = input instanceof HTMLInputElement ? input.files?.[0] : null;

    if (file) {
      this.submitCv(file.name);
    }
  }

  protected answerQuestion(questionId: string, answer: boolean): void {
    this.questionAnswers.update((answers) => ({ ...answers, [questionId]: answer }));
  }

  protected continueToCareerChoice(): void {
    this.wizardStep.set('choose-career');
  }

  protected selectCareer(careerId: string): void {
    this.selectedCareerId.set(careerId);
    this.wizardStep.set('roadmap');
  }

  protected changeCareer(): void {
    this.wizardStep.set('choose-career');
  }

  protected restartWizard(): void {
    this.digitalCv.set(null);
    this.questionAnswers.set({});
    this.selectedCareerId.set(null);
    this.wizardStep.set('upload');
  }

  private submitCv(fileName: string): void {
    this.wizardStep.set('processing');

    window.setTimeout(() => {
      this.digitalCv.set({ fileName, ...MOCK_DIGITAL_CV });
      this.wizardStep.set('questions');
    }, 1200);
  }
}
