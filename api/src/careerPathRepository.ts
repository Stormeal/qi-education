import { apiConfig, hasMongoConfig } from './config.js';
import { nextCareerPathUpdatedAt, type CareerPathDocument, type CareerPathSelection } from './careerPath.js';
import { getMongoDatabase } from './mongo.js';
import { CourseBusyError, InMemoryCourseMutationLock, MongoCourseMutationLock, type CourseMutationLock } from './courseMutationLock.js';

export class CareerPathSchemaError extends Error {
  readonly code = 'career-path-schema';
  constructor() { super('This career path requires milestone schema version 2.'); }
}
function protectMilestoneSchema(current: CareerPathDocument | null | undefined, next: CareerPathDocument): void {
  if ((current?.draft?.schemaVersion === 2 || current?.published?.schemaVersion === 2)
    && next.draft?.schemaVersion !== 2) throw new CareerPathSchemaError();
}

export interface CareerPathRepository {
  withPublicationLock<T>(operation: () => Promise<T>): Promise<T>;
  listPaths(): Promise<CareerPathDocument[]>;
  // Nonempty expected versions must be checked atomically with replacement.
  savePath(document: CareerPathDocument, expectedUpdatedAt?: string): Promise<CareerPathDocument>;
  getSelection(userId: string): Promise<CareerPathSelection | null>;
  saveSelection(selection: CareerPathSelection): Promise<void>;
  countSelections(pathId: string): Promise<number>;
}

export class MongoCareerPathRepository implements CareerPathRepository {
  constructor(private readonly publicationLock: CourseMutationLock = new MongoCourseMutationLock(async () =>
    (await getMongoDatabase()).collection(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_career_path_locks`))) {}

  async withPublicationLock<T>(operation: () => Promise<T>): Promise<T> {
    try { return await this.publicationLock.run('published-graph', operation); }
    catch (error) {
      if (error instanceof CourseBusyError) throw new CareerPathConflictError('Career graph is being updated. Try publishing again shortly.');
      throw error;
    }
  }
  private async collection<T extends { _id: string }>(suffix: string) {
    return (await getMongoDatabase()).collection<T>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_${suffix}`);
  }

  async listPaths(): Promise<CareerPathDocument[]> {
    return (await this.collection<CareerPathDocument>('career_paths')).find().toArray();
  }

  async savePath(document: CareerPathDocument, expectedUpdatedAt?: string): Promise<CareerPathDocument> {
    const collection = await this.collection<CareerPathDocument>('career_paths');
    if (expectedUpdatedAt) {
      protectMilestoneSchema(await collection.findOne({ _id: document._id }), document);
      const saved = { ...document, updatedAt: nextCareerPathUpdatedAt(expectedUpdatedAt) };
      // Only the database predicate decides whether this version is current.
      const result = await collection.replaceOne(
        { _id: document._id, updatedAt: expectedUpdatedAt }, saved,
        { upsert: false, writeConcern: { w: 'majority' } },
      );
      if (result.matchedCount !== 1) throw new CareerPathConflictError();
      return saved;
    }

    // Legacy requests still win without an expected version. Retry internal
    // comparisons so each successful write retires the *persisted* token, even
    // when the route read an old snapshot or another API instance has a skewed clock.
    for (;;) {
      const current = await collection.findOne({ _id: document._id });
      protectMilestoneSchema(current, document);
      const saved = { ...document, updatedAt: nextCareerPathUpdatedAt(current?.updatedAt ?? document.updatedAt) };
      if (!current) {
        try {
          await collection.insertOne(saved, { writeConcern: { w: 'majority' } });
          return saved;
        } catch (error) {
          // Concurrent first saves collide on the unique _id. Other duplicate
          // indexes or provider errors must not become endless creation retries.
          if (error && typeof error === 'object' && 'code' in error && error.code === 11000
            && await collection.findOne({ _id: document._id })) continue;
          throw error;
        }
      }
      const result = await collection.replaceOne(
        { _id: document._id, updatedAt: current.updatedAt }, saved,
        { upsert: false, writeConcern: { w: 'majority' } },
      );
      if (result.matchedCount === 1) return saved;
    }
  }

  async getSelection(userId: string): Promise<CareerPathSelection | null> {
    return (await this.collection<CareerPathSelection>('career_selections')).findOne({ _id: userId });
  }

  async saveSelection(selection: CareerPathSelection): Promise<void> {
    await (await this.collection<CareerPathSelection>('career_selections')).replaceOne({ _id: selection._id }, selection, { upsert: true });
  }

  async countSelections(pathId: string): Promise<number> {
    return (await this.collection<CareerPathSelection>('career_selections')).countDocuments({ pathId });
  }
}

export class InMemoryCareerPathRepository implements CareerPathRepository {
  private readonly publicationLock = new InMemoryCourseMutationLock();
  withPublicationLock<T>(operation: () => Promise<T>): Promise<T> {
    return this.publicationLock.run('published-graph', operation);
  }
  private readonly paths = new Map<string, CareerPathDocument>();
  private readonly selections = new Map<string, CareerPathSelection>();

  async listPaths(): Promise<CareerPathDocument[]> {
    return [...this.paths.values()];
  }

  async savePath(document: CareerPathDocument, expectedUpdatedAt?: string): Promise<CareerPathDocument> {
    const current = this.paths.get(document._id);
    protectMilestoneSchema(current, document);
    if (expectedUpdatedAt && current?.updatedAt !== expectedUpdatedAt) {
      throw new CareerPathConflictError();
    }
    // Do not yield between comparison and replacement (same contract as Mongo).
    const saved = { ...document, updatedAt: nextCareerPathUpdatedAt(current?.updatedAt ?? document.updatedAt) };
    this.paths.set(document._id, structuredClone(saved));
    return saved;
  }

  async getSelection(userId: string): Promise<CareerPathSelection | null> {
    return this.selections.get(userId) ?? null;
  }

  async saveSelection(selection: CareerPathSelection): Promise<void> {
    this.selections.set(selection._id, selection);
  }

  async countSelections(pathId: string): Promise<number> {
    return [...this.selections.values()].filter((selection) => selection.pathId === pathId).length;
  }
}

export function createCareerPathRepository(): CareerPathRepository {
  return hasMongoConfig() ? new MongoCareerPathRepository() : new InMemoryCareerPathRepository();
}

export class CareerPathConflictError extends Error {
  constructor(message = 'Career path changed. Load the latest version before saving, publishing or withdrawing.') {
    super(message);
  }
}
