import { z } from 'zod';
import type { Course } from './course.js';

export const careerPathIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,59}$/);

const careerPathStepSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(600).default(''),
  required: z.boolean().default(true),
  stage: z.string().trim().max(40).default(''),
  roleMilestone: z.boolean().default(false),
  actions: z.array(z.object({
    id: careerPathIdSchema,
    kind: z.enum(['exam', 'course', 'activity']),
    title: z.string().trim().min(1).max(160),
    courseId: z.string().trim().max(120).default(''),
    cvKeywords: z.array(z.string().trim().min(1).max(80)).max(10).default([]).transform(list => [...new Set(list)]),
  })).max(12).default([]),
  requirementBundles: z.array(z.array(careerPathIdSchema).min(1).max(12)).max(6).default([]),
  // Preparation/learning recommendations only in v2; requirementBundles define completion.
  // In v1 the first course is primary and the rest are accepted alternatives.
  // An empty courseId marks a preview (placeholder) course that cannot be opened or enrolled in.
  courses: z.array(z.object({
    courseId: z.string().trim().max(120).default(''),
    title: z.string().trim().max(160).default(''),
  })).max(8).default([]),
  prerequisiteStepIds: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
});

export const careerPathContentSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]).default(1),
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

/** updatedAt is the edit token: even same-millisecond writes must retire it. */
export function nextCareerPathUpdatedAt(previous?: string, now = Date.now()): string {
  const previousTime = previous ? Date.parse(previous) : NaN;
  return new Date(Number.isFinite(previousTime) ? Math.max(now, previousTime + 1) : now).toISOString();
}

/** Structural checks a revision must pass before learners can see it. */
export function careerPathIssues(content: CareerPathContent, courses: Course[], published: CareerPathContent[] = [], previous?: CareerPathContent | null): CareerPathIssue[] {
  const issues: CareerPathIssue[] = [];
  const courseIds = new Set(courses.map((course) => course.id));
  const stepIds = new Set<string>();
  const requiredCourseStep = new Map<string, string>();
  if (content.schemaVersion === 2 && previous?.schemaVersion === 2) {
    const historical = new Map(previous.steps.flatMap(step => step.actions).map(action => [action.id, action]));
    for (const step of content.steps) for (const action of step.actions) {
      const old = historical.get(action.id);
      if (old && (old.kind !== action.kind || old.courseId !== action.courseId || old.title !== action.title)) {
        issues.push({ stepId: step.id, message: `${step.title}: Action identity "${action.id}" already means a published qualification. Use a new versioned action ID for changed evidence.` });
      }
    }
  }

  if (!content.steps.some((step) => step.required)) issues.push({ stepId: '', message: 'Add at least one required step.' });

  for (const step of content.steps) {
    const issue = (message: string) => issues.push({ stepId: step.id, message: `${step.title}: ${message}` });
    if (stepIds.has(step.id)) issue('Step IDs must be unique.');
    stepIds.add(step.id);
    if (content.schemaVersion !== 2 && step.courses.length === 0) issue('Add at least one course.');
    if (content.schemaVersion === 2) {
      if (!step.requirementBundles.length) issue('Add at least one requirement bundle.');
      const actionIds = new Set(step.actions.map(action => action.id));
      if (actionIds.size !== step.actions.length) issue('Action IDs must be unique within a milestone.');
      for (const bundle of step.requirementBundles) {
        if (!bundle.length || bundle.some(id => !actionIds.has(id))) issue('Every requirement bundle must name actions of this milestone.');
      }
      for (const action of step.actions) {
        if (action.kind === 'course' && !courseIds.has(action.courseId)) issue(`Action "${action.title}" must name an existing course.`);
      }
    }
    for (const course of step.courses) {
      if (!course.courseId) {
        if (!course.title) issue('Name the preview course or pick a real one.');
        continue;
      }
      if (!courseIds.has(course.courseId)) issue(`Course "${course.title || course.courseId}" no longer exists.`);
      if (!step.required || content.schemaVersion === 2) continue;
      const other = requiredCourseStep.get(course.courseId);
      if (other && other !== step.id) issue(`Course "${course.title || course.courseId}" is already required by another step.`);
      requiredCourseStep.set(course.courseId, step.id);
    }
  }

  const graph = content.schemaVersion === 2
    ? [...published.filter(path => path.schemaVersion === 2).flatMap(path => path.steps), ...content.steps]
    : content.steps;
  const definitions = new Map<string, typeof content.steps[number]>();
  const actions = new Map<string, string>();
  // Order in a set/bundle is presentation only; semantic identities must agree.
  const signature = (step: typeof content.steps[number]) => JSON.stringify({
    actions: step.actions.map(({ cvKeywords, ...identity }) => identity).sort((a, b) => a.id.localeCompare(b.id)),
    bundles: step.requirementBundles.map(bundle => [...bundle].sort()).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    prerequisites: [...step.prerequisiteStepIds].sort(),
  });
  if (content.schemaVersion === 2) for (const step of graph) {
    const previous = definitions.get(step.id);
    if (previous && signature(previous) !== signature(step)) issues.push({ stepId: step.id, message: `${step.title}: Conflicting shared milestone identity.` });
    definitions.set(step.id, step);
    for (const action of step.actions) {
      const previousAction = actions.get(action.id);
      // Shared action IDs carry the same completion/prerequisite contract too.
      const definition = signature(step);
      if (previousAction && previousAction !== definition) issues.push({ stepId: step.id, message: `${step.title}: Conflicting shared action identity "${action.id}".` });
      actions.set(action.id, definition);
    }
  }
  const prerequisites = new Map(graph.map((step) => [step.id, step.prerequisiteStepIds]));
  const state = new Map<string, 'visiting' | 'done'>();
  const inCycle = (id: string): boolean => {
    if (state.get(id) === 'done') return false;
    if (state.get(id) === 'visiting') return true;
    state.set(id, 'visiting');
    const cyclic = (prerequisites.get(id) ?? []).some(inCycle);
    state.set(id, 'done');
    return cyclic;
  };
  for (const step of graph) {
    const unknown = step.prerequisiteStepIds.find((id) => !prerequisites.has(id));
    if (unknown) issues.push({ stepId: step.id, message: `${step.title}: Prerequisite "${unknown}" is not a step in the published graph.` });
    else if (inCycle(step.id)) issues.push({ stepId: step.id, message: `${step.title}: Prerequisites form a loop.` });
  }

  return issues;
}

/** Learner view of the published revision; course titles and availability come from the live catalog. */
export function learnerCareerPath(document: CareerPathDocument, courses: Course[]) {
  if (!document.published) return null;
  // Mongo records predating v2 have no defaults persisted on them.
  const published = careerPathContentSchema.parse(document.published);
  const byId = new Map(courses.map((course) => [course.id, course]));
  return {
    id: document._id,
    revision: document.revision,
    ...published,
    steps: published.steps.map((step) => ({
      ...step,
      actions: step.actions.map(action => {
        const stored = action.kind === 'course' ? byId.get(action.courseId) : undefined;
        const course = stored?.status === 'published' ? stored : undefined;
        return { ...action, title: course?.title ?? action.title,
          available: action.kind !== 'course' || !!course };
      }),
      courses: step.courses.map((reference) => {
        const storedCourse = reference.courseId ? byId.get(reference.courseId) : undefined;
        const course = storedCourse?.status === 'published' ? storedCourse : undefined;
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
const legacySeeds = {
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

export const careerPathSeeds: Record<string, CareerPathContent> = Object.fromEntries(
  Object.entries(legacySeeds).map(([id, seed]) => [id, careerPathContentSchema.parse(seed)]),
);

// Unapproved curriculum starting drafts from the candidate map, never automatically published.
// Prerequisites below illustrate progression; curriculum review must approve them before launch.
const starterCvKeywords: Record<string, string[]> = {
  foundation: ['ISTQB Foundation', 'Certified Tester Foundation Level', 'CTFL'],
  'automation-engineer': ['ISTQB Advanced Test Automation Engineer', 'Advanced Level Test Automation Engineer', 'CTAL-TAE'],
  'technical-test-analyst': ['ISTQB Advanced Technical Test Analyst', 'Advanced Level Technical Test Analyst', 'CTAL-TTA'],
  'advanced-test-manager': ['ISTQB Advanced Test Management', 'ISTQB Advanced Test Manager', 'Advanced Level Test Manager', 'CTAL-TM'],
  'agile-leadership-exam': ['ISTQB Advanced Agile Test Leadership at Scale', 'CTAL-ATLaS'],
  'advanced-test-analyst': ['ISTQB Advanced Test Analyst', 'Advanced Level Test Analyst', 'CTAL-TA'],
  'acceptance-testing': ['ISTQB Acceptance Testing', 'CT-AcT'],
};
const milestone = (id: string, title: string, stage: string, preparations: string[], prerequisites: string[],
  kind: 'exam' | 'activity' = 'activity', roleMilestone = false) => ({
  ...step(id, title, 'Starting draft — curriculum criteria and prerequisites require approval.', preparations, prerequisites),
  stage, roleMilestone, actions: [{ id: `${id}-${kind}`, kind,
    title: id === 'foundation' ? 'Passed Foundation exam' : `${kind === 'exam' ? 'Passed exam' : 'Completed activity'}: ${title}`, courseId: '',
    cvKeywords: kind === 'exam' ? starterCvKeywords[id] ?? [] : [] }],
  requirementBundles: [[`${id}-${kind}`]],
});
const sharedFoundation = milestone('foundation', 'ISTQB Foundation', 'Foundation',
  ['ISTQB Foundation', 'Academy on-demand preparation (planned)'], [], 'exam');
const launchSteps = {
  'technical-tester': [sharedFoundation,
    milestone('technical-foundations', 'Technical testing foundations', 'Build skills', ['Grundlæggende testautomatisering', 'Grundlæggende udvikling for testere'], ['foundation']),
    milestone('automation-engineer', 'Test Automation Engineer', 'Specialize', ['ISTQB Advanced Test Automation Engineer v2.0'], ['technical-foundations'], 'exam', true),
    milestone('technical-test-analyst', 'Technical Test Analyst', 'Specialize', ['ISTQB Advanced Technical Test Analyst'], ['technical-foundations'], 'exam'),
    milestone('automation-practice', 'Automation in practice', 'Develop further', ['Automatisering med Playwright', 'Automatisering med Leapwork'], ['automation-engineer']),
    milestone('api-testing', 'API testing', 'Develop further', ['Grundlæggende Postman', 'Grundlæggende SoapUI'], ['technical-foundations'])],
  'test-manager': [sharedFoundation,
    milestone('test-manager-role', 'Test Manager', 'Lead testing', ['Grundlæggende Test Management', 'Eksamineret Test Manager'], ['foundation'], 'activity', true),
    milestone('advanced-test-manager', 'Advanced Test Management', 'Develop further', ['ISTQB Advanced Test Management v3.0'], ['test-manager-role'], 'exam'),
    milestone('agile-leadership-exam', 'Agile test leadership certification', 'Develop further', ['ISTQB Advanced Agile Test Leadership at Scale'], ['test-manager-role'], 'exam'),
    milestone('agile-leadership-practice', 'Agile test leadership in practice', 'Develop further', ['Test Manager i agile projekter'], ['test-manager-role'])],
  'test-analyst': [sharedFoundation,
    milestone('test-design', 'Test design techniques', 'Build skills', ['Testteknikker'], ['foundation']),
    milestone('advanced-test-analyst', 'Advanced Test Analyst', 'Specialize', ['ISTQB Advanced Test Analyst'], ['test-design'], 'exam', true),
    milestone('exploratory-testing', 'Exploratory testing', 'Develop further', ['Udforskende test'], ['test-design']),
    milestone('acceptance-testing', 'Acceptance testing', 'Develop further', ['ISTQB Acceptance Testing'], ['test-design'], 'exam'),
    milestone('risk-based-testing', 'Risk-based testing', 'Develop further', ['Risikobaseret test', 'Risikobaseret test (on-demand)'], ['test-design'])],
};
for (const [id, steps] of Object.entries(launchSteps)) {
  careerPathSeeds[id] = careerPathContentSchema.parse({ ...careerPathSeeds[id], schemaVersion: 2, steps });
}
