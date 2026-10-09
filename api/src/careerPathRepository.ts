import { apiConfig, hasMongoConfig } from './config.js';
import type { CareerPathDocument, CareerPathSelection } from './careerPath.js';
import { getMongoDatabase } from './mongo.js';

export interface CareerPathRepository {
  listPaths(): Promise<CareerPathDocument[]>;
  savePath(document: CareerPathDocument): Promise<void>;
  getSelection(userId: string): Promise<CareerPathSelection | null>;
  saveSelection(selection: CareerPathSelection): Promise<void>;
  countSelections(pathId: string): Promise<number>;
}

export class MongoCareerPathRepository implements CareerPathRepository {
  private async collection<T extends { _id: string }>(suffix: string) {
    return (await getMongoDatabase()).collection<T>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_${suffix}`);
  }

  async listPaths(): Promise<CareerPathDocument[]> {
    return (await this.collection<CareerPathDocument>('career_paths')).find().toArray();
  }

  async savePath(document: CareerPathDocument): Promise<void> {
    await (await this.collection<CareerPathDocument>('career_paths')).replaceOne({ _id: document._id }, document, { upsert: true });
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
  private readonly paths = new Map<string, CareerPathDocument>();
  private readonly selections = new Map<string, CareerPathSelection>();

  async listPaths(): Promise<CareerPathDocument[]> {
    return [...this.paths.values()];
  }

  async savePath(document: CareerPathDocument): Promise<void> {
    this.paths.set(document._id, structuredClone(document));
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
