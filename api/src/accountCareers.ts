import { careerPathContentSchema, type CareerPathContent, type CareerPathDocument, type CareerPathSelection } from './careerPath.js';
import type { CareerPathRepository } from './careerPathRepository.js';
import type { CourseContentRepository } from './courseContentRepository.js';
import type { LearningProgressRepository } from './learningProgressRepository.js';
import type { AccountCareersRepository, CareerAchievement, StoredAccountCareers } from './accountCareersRepository.js';

export type MilestoneState = 'achieved' | 'ready' | 'locked';
export type AccountCareers = StoredAccountCareers & {
  satisfiedActionIds: string[];
  milestoneStates: Record<string, MilestoneState>;
  /** US-A004-AC06: milestones not achieved now whose evidence met an earlier requirement version. */
  earlierCriteriaMet: string[];
};
export class AccountCareersError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) { super(message); }
}
export class StoredCareerDefinitionError extends Error {
  constructor(readonly careerId: string) { super('Invalid stored career definition'); }
}
function storedCareerContent(path: CareerPathDocument): CareerPathContent {
  const parsed = careerPathContentSchema.safeParse(path.published);
  if (!parsed.success) throw new StoredCareerDefinitionError(path._id);
  return parsed.data;
}

type Milestone = CareerPathContent['steps'][number];

export function milestoneStates(steps: Milestone[], satisfied: Set<string>): Record<string, MilestoneState> {
  const graph = new Map(steps.map(step => [step.id, step]));
  const states = new Map<string, MilestoneState>();
  const valid = new Map<string, boolean>();
  const visiting = new Set<string>();
  const validDependencies = (id: string): boolean => {
    if (valid.has(id)) return valid.get(id)!;
    const step = graph.get(id);
    // Evidence does not make withdrawn or corrupt prerequisite graphs valid.
    if (!step || visiting.has(id)) return false;
    visiting.add(id);
    const result = step.prerequisiteStepIds.every(validDependencies);
    visiting.delete(id); valid.set(id, result);
    return result;
  };
  const evaluate = (id: string): MilestoneState => {
    if (states.has(id)) return states.get(id)!;
    const step = graph.get(id);
    // Fail closed on withdrawn dependencies or corrupt/legacy graph data.
    if (!step || !validDependencies(id)) return 'locked';
    const achieved = step.requirementBundles.some(bundle => bundle.length > 0 && bundle.every(action => satisfied.has(action)));
    const state = achieved ? 'achieved'
      : step.prerequisiteStepIds.every(prerequisite => evaluate(prerequisite) === 'achieved') ? 'ready' : 'locked';
    states.set(id, state);
    return state;
  };
  return Object.fromEntries([...graph.keys()].map(id => [id, evaluate(id)]));
}

export class AccountCareersService {
  constructor(private readonly accounts: AccountCareersRepository, private readonly paths: CareerPathRepository,
    private readonly progress: LearningProgressRepository, private readonly content: CourseContentRepository) {}

  private async context(userId: string) {
    const paths = (await this.paths.listPaths()).filter(path => !!path.published);
    const legacy = await this.paths.getSelection(userId);
    const legacyId = legacy && paths.some(path => path._id === legacy.pathId) ? legacy.pathId : null;
    const initial: StoredAccountCareers = { followedPathIds: legacyId ? [legacyId] : [], focusPathId: legacyId, achievements: [] };
    const steps = paths.flatMap(path => {
      const content = storedCareerContent(path);
      return content.schemaVersion === 2 ? content.steps : [];
    });
    return { paths, initial, steps, completedActionIds: await this.completedActions(userId, steps) };
  }

  private async completedActions(userId: string, steps: Milestone[]): Promise<string[]> {
    const courseIds = new Set(steps.flatMap(step => step.actions.filter(action => action.kind === 'course').map(action => action.courseId)));
    const completedCourses = new Set<string>();
    for (const progress of await this.progress.list(userId)) {
      if (!courseIds.has(progress.courseId)) continue;
      // The reviewed repository exposes the published lesson revision to learners.
      const document = await this.content.getCourseContent(progress.courseId);
      const ids = document?.sections.flatMap(section => section.components.map(component => component.id)) ?? [];
      if (ids.length && ids.every(id => progress.completedIds.includes(id))) completedCourses.add(progress.courseId);
    }
    return [...new Set(steps.flatMap(step => step.actions.filter(action => action.kind === 'course' && completedCourses.has(action.courseId)).map(action => action.id)))];
  }

  private view(account: StoredAccountCareers, context: { steps: Milestone[]; completedActionIds: string[] }): AccountCareers {
    const satisfiedActionIds = [...new Set([...account.achievements.map(item => item.actionId), ...context.completedActionIds])];
    const satisfied = new Set(satisfiedActionIds);
    const states = milestoneStates(context.steps, satisfied);
    const met = (bundles: string[][]) => bundles.some(bundle => bundle.length > 0 && bundle.every(action => satisfied.has(action)));
    const earlierCriteriaMet = [...new Set(context.steps.filter(step => states[step.id] !== 'achieved'
      && step.requirementHistory.some(version => met(version.bundles))).map(step => step.id))];
    return { followedPathIds: [...account.followedPathIds], focusPathId: account.focusPathId,
      achievements: structuredClone(account.achievements), satisfiedActionIds, milestoneStates: states, earlierCriteriaMet };
  }

  async get(userId: string): Promise<AccountCareers> {
    const context = await this.context(userId);
    return this.view(await this.accounts.get(userId) ?? context.initial, context);
  }

  async selectLegacy(selection: CareerPathSelection): Promise<void> {
    // Capture the previous read-time mapping before replacing the legacy record.
    const context = await this.context(selection._id);
    await this.paths.saveSelection(selection);
    await this.accounts.mutate(selection._id, context.initial, document => {
      if (!document.followedPathIds.includes(selection.pathId)) document.followedPathIds.push(selection.pathId);
      document.focusPathId = selection.pathId;
    });
  }

  async follow(userId: string, pathId: string, focus = false): Promise<AccountCareers> {
    const context = await this.context(userId);
    if (!context.paths.some(path => path._id === pathId)) throw new AccountCareersError(404, 'Career path not found');
    const account = await this.accounts.mutate(userId, context.initial, document => {
      if (!document.followedPathIds.includes(pathId)) document.followedPathIds.push(pathId);
      if (focus || document.focusPathId === null) document.focusPathId = pathId;
    });
    return this.view(account, context);
  }

  async unfollow(userId: string, pathId: string): Promise<AccountCareers> {
    const context = await this.context(userId);
    const account = await this.accounts.mutate(userId, context.initial, document => {
      document.followedPathIds = document.followedPathIds.filter(id => id !== pathId);
      if (document.focusPathId === pathId) document.focusPathId = null;
    });
    return this.view(account, context);
  }

  async focus(userId: string, pathId: string): Promise<AccountCareers> {
    const context = await this.context(userId);
    const account = await this.accounts.mutate(userId, context.initial, document => {
      if (!document.followedPathIds.includes(pathId)) throw new AccountCareersError(409, 'Follow this career before focusing it.', 'career-not-followed');
      document.focusPathId = pathId;
    });
    return this.view(account, context);
  }

  async declare(userId: string, actionId: string): Promise<AccountCareers> {
    const context = await this.context(userId);
    if (!context.steps.some(step => step.actions.some(action => action.id === actionId))) throw new AccountCareersError(404, 'Achievement action not found');
    const achievement: CareerAchievement = { actionId, provenance: 'self-reported', declaredAt: new Date().toISOString() };
    const account = await this.accounts.mutate(userId, context.initial, document => {
      // Retries reconcile to the first saved outcome, even after unfollowing.
      if (document.achievements.some(item => item.actionId === actionId)) return;
      const candidates = context.paths.filter(path => document.followedPathIds.includes(path._id))
        .flatMap(path => this.v2Steps(path)).filter(step => step.actions.some(action => action.id === actionId));
      if (!candidates.length) throw new AccountCareersError(409, 'Follow a career containing this action before declaring it.', 'career-not-followed');
      const states = this.view(document, context).milestoneStates;
      if (candidates.every(step => states[step.id] === 'locked')) {
        const missing = [...new Set(candidates.flatMap(step => step.prerequisiteStepIds.filter(id => states[id] !== 'achieved')))];
        throw new AccountCareersError(409, `Milestone locked. Achieve prerequisites: ${missing.join(', ')}.`, 'milestone-locked');
      }
      document.achievements.push(achievement);
    });
    return this.view(account, context);
  }

  async recognise(userId: string, actionIds: string[]): Promise<AccountCareers> {
    const context = await this.context(userId);
    const publishedIds = new Set(context.steps.flatMap(step => step.actions.map(action => action.id)));
    if (actionIds.some(id => !publishedIds.has(id))) throw new AccountCareersError(404, 'Achievement action not found');
    const declaredAt = new Date().toISOString();
    const account = await this.accounts.mutate(userId, context.initial, document => {
      const recorded = new Set(document.achievements.map(item => item.actionId));
      for (const actionId of actionIds) {
        if (recorded.has(actionId)) continue;
        document.achievements.push({ actionId, provenance: 'cv', declaredAt });
        recorded.add(actionId);
      }
    });
    return this.view(account, context);
  }

  private v2Steps(path: CareerPathDocument): Milestone[] {
    const content = storedCareerContent(path);
    return content.schemaVersion === 2 ? content.steps : [];
  }
}
