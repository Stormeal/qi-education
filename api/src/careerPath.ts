import { z } from 'zod';
import type { Course } from './course.js';

export const careerPathIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,59}$/);

const careerPathStepSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(600).default(''),
  required: z.boolean().default(true),
  // The first course is the primary recommendation; the rest are accepted alternatives.
  // An empty courseId marks a preview (placeholder) course that cannot be opened or enrolled in.
  courses: z.array(z.object({
    courseId: z.string().trim().max(120).default(''),
    title: z.string().trim().max(160).default(''),
  })).max(8).default([]),
  prerequisiteStepIds: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
});

export const careerPathContentSchema = z.object({
  title: z.string().trim().min(2).max(120),
  summary: z.string().trim().max(600).default(''),
  outcomes: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  estimatedHours: z.number().int().min(0).max(2000).default(0),
  steps: z.array(careerPathStepSchema).max(30).default([]),
});

export const selectCareerPathSchema = z.object({ pathId: careerPathIdSchema });

export type CareerPathContent = z.infer<typeof careerPathContentSchema>;
export type CareerPathDocument = {
  _id: string;
  revision: number;
  published: CareerPathContent | null;
  draft: CareerPathContent | null;
  updatedAt: string;
};
export type CareerPathSelection = { _id: string; pathId: string; revision: number; selectedAt: string };
export type CareerPathIssue = { stepId: string; message: string };

/** Structural checks a revision must pass before learners can see it. */
export function careerPathIssues(content: CareerPathContent, courses: Course[]): CareerPathIssue[] {
  const issues: CareerPathIssue[] = [];
  const courseIds = new Set(courses.map((course) => course.id));
  const stepIds = new Set<string>();
  const requiredCourseStep = new Map<string, string>();

  if (!content.steps.some((step) => step.required)) issues.push({ stepId: '', message: 'Add at least one required step.' });

  for (const step of content.steps) {
    const issue = (message: string) => issues.push({ stepId: step.id, message: `${step.title}: ${message}` });
    if (stepIds.has(step.id)) issue('Step IDs must be unique.');
    stepIds.add(step.id);
    if (step.courses.length === 0) issue('Add at least one course.');
    for (const course of step.courses) {
      if (!course.courseId) {
        if (!course.title) issue('Name the preview course or pick a real one.');
        continue;
      }
      if (!courseIds.has(course.courseId)) issue(`Course "${course.title || course.courseId}" no longer exists.`);
      if (!step.required) continue;
      const other = requiredCourseStep.get(course.courseId);
      if (other && other !== step.id) issue(`Course "${course.title || course.courseId}" is already required by another step.`);
      requiredCourseStep.set(course.courseId, step.id);
    }
  }

  const prerequisites = new Map(content.steps.map((step) => [step.id, step.prerequisiteStepIds]));
  const state = new Map<string, 'visiting' | 'done'>();
  const inCycle = (id: string): boolean => {
    if (state.get(id) === 'done') return false;
    if (state.get(id) === 'visiting') return true;
    state.set(id, 'visiting');
    const cyclic = (prerequisites.get(id) ?? []).some(inCycle);
    state.set(id, 'done');
    return cyclic;
  };
  for (const step of content.steps) {
    const unknown = step.prerequisiteStepIds.find((id) => !prerequisites.has(id));
    if (unknown) issues.push({ stepId: step.id, message: `${step.title}: Prerequisite "${unknown}" is not a step in this path.` });
    else if (inCycle(step.id)) issues.push({ stepId: step.id, message: `${step.title}: Prerequisites form a loop.` });
  }

  return issues;
}

/** Learner view of the published revision; course titles and availability come from the live catalog. */
export function learnerCareerPath(document: CareerPathDocument, courses: Course[]) {
  if (!document.published) return null;
  const byId = new Map(courses.map((course) => [course.id, course]));
  return {
    id: document._id,
    revision: document.revision,
    ...document.published,
    steps: document.published.steps.map((step) => ({
      ...step,
      courses: step.courses.map((reference) => {
        const course = reference.courseId ? byId.get(reference.courseId) : undefined;
        return {
          courseId: reference.courseId,
          title: course?.title ?? reference.title,
          placeholder: !reference.courseId,
          available: course?.status === 'published',
        };
      }),
    })),
  };
}

const preview = (...titles: string[]) => titles.map((title) => ({ courseId: '', title }));
const step = (id: string, title: string, description: string, courses: string[], prerequisiteStepIds: string[] = []) =>
  ({ id, title, description, required: true, courses: preview(...courses), prerequisiteStepIds });
const foundation = step('foundation', 'ISTQB Foundation Level',
  'The baseline certification for professional software testers.', ['ISTQB Foundation 4.0']);

/** Starting drafts for admins. They are never stored or shown to learners until an admin saves and publishes. */
export const careerPathSeeds: Record<string, CareerPathContent> = {
  'technical-tester': {
    title: 'Technical Tester', estimatedHours: 0,
    summary: 'Build and maintain automated test suites and the tooling around them.',
    outcomes: ['Automate browser and API tests', 'Run suites in a delivery pipeline'],
    steps: [foundation,
      step('automation-engineer', 'Test Automation Engineering', 'Design maintainable automation and choose the right level to test at.', ['ISTQB Test Automation Engineer'], ['foundation']),
      step('browser-automation', 'Browser automation in practice', 'Hands-on cross-browser automation for real projects.', ['Automation with Playwright'], ['automation-engineer']),
      step('api-testing', 'API testing', 'Test services directly, below the user interface.', ['Fundamental Postman'], ['foundation'])],
  },
  'test-manager': {
    title: 'Test Manager', estimatedHours: 0,
    summary: 'Lead QA teams, own the quality process, and report to stakeholders.',
    outcomes: ['Plan and estimate test work', 'Lead a test team', 'Report quality to stakeholders'],
    steps: [foundation,
      step('advanced-test-manager', 'ISTQB Advanced Test Manager', 'Covers test planning, estimation, risk, and team leadership.', ['ISTQB Advanced Test Manager', 'Test Estimation in Practice'], ['foundation']),
      step('leading-agile-teams', 'Leading Agile Teams', 'Build the people and process skills to run a QA team.', ['Leading Agile Teams'], ['advanced-test-manager']),
      step('stakeholder-reporting', 'Stakeholder Communication & Reporting', 'Translate quality metrics into decisions stakeholders can act on.', ['Stakeholder Communication & Reporting'], ['advanced-test-manager'])],
  },
  'test-analyst': {
    title: 'Test Analyst', estimatedHours: 0,
    summary: 'Specialize in deep test analysis and design techniques.',
    outcomes: ['Apply advanced test design techniques', 'Prioritize testing by risk'],
    steps: [foundation,
      step('test-design', 'Test Design Techniques Deep Dive', 'Go beyond the basics of boundary value and equivalence partitioning.', ['Test Design Techniques Deep Dive'], ['foundation']),
      step('advanced-test-analyst', 'ISTQB Advanced Test Analyst', 'The certification that formalizes advanced analysis skills.', ['ISTQB Advanced Test Analyst'], ['test-design']),
      step('risk-based-testing', 'Risk-Based Testing', 'Prioritize test effort where it protects the most value.', ['Risk-Based Testing Mastery'], ['advanced-test-analyst'])],
  },
  'agile-tester': {
    title: 'Agile Tester', estimatedHours: 0,
    summary: 'Test as part of a delivery team, from refinement to release.',
    outcomes: ['Work test-first with a team', 'Use exploratory testing well'],
    steps: [foundation,
      step('agile-tester', 'ISTQB Agile Tester', 'How testing fits agile roles, ceremonies, and delivery.', ['ISTQB Agile Tester'], ['foundation']),
      step('exploratory-testing', 'Exploratory testing', 'Structured exploration with charters and sessions.', ['Exploratory Testing in Practice'], ['agile-tester'])],
  },
  'ai-testing-specialist': {
    title: 'AI Testing Specialist', estimatedHours: 0,
    summary: 'Test AI-based systems and use AI to improve testing.',
    outcomes: ['Assess quality risks of AI systems', 'Use AI tools in test automation'],
    steps: [foundation,
      step('ai-testing', 'ISTQB AI Testing', 'Quality characteristics, risks, and test approaches for AI-based systems.', ['ISTQB AI Testing'], ['foundation']),
      step('ai-in-automation', 'AI in test automation', 'Apply AI assistance to building and maintaining automated tests.', ['Advanced Playwright and AI'], ['ai-testing'])],
  },
};
