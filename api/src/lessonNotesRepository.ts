import type { Collection } from 'mongodb';
import { apiConfig, hasMongoConfig } from './config.js';
import { getMongoDatabase } from './mongo.js';

export type LessonNote = { id: string; courseId: string; componentId: string; body: string; videoSeconds: number | null; createdAt: string; updatedAt: string };
export type LessonNoteDocument = LessonNote & { _id: string; userId: string };
export interface LessonNotesRepository {
  list(userId: string, courseId: string): Promise<LessonNoteDocument[]>;
  get(userId: string, id: string): Promise<LessonNoteDocument | null>;
  create(userId: string, note: LessonNote): Promise<void>;
  update(userId: string, id: string, body: string, updatedAt: string): Promise<LessonNoteDocument | null>;
  delete(userId: string, id: string): Promise<boolean>;
}
type NotesCollection = Pick<Collection<LessonNoteDocument>, 'find' | 'findOne' | 'insertOne' | 'updateOne' | 'deleteOne'>;
export class MongoLessonNotesRepository implements LessonNotesRepository {
  constructor(private readonly collection: () => Promise<NotesCollection> = async () =>
    (await getMongoDatabase()).collection<LessonNoteDocument>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_lesson_notes`)) {}
  async list(userId: string, courseId: string) {
    return (await this.collection()).find({ userId, courseId }).sort({ createdAt: -1, _id: -1 }).toArray();
  }
  async get(userId: string, id: string) { return (await this.collection()).findOne({ _id: id, userId }); }
  async create(userId: string, note: LessonNote) { await (await this.collection()).insertOne({ ...note, _id: note.id, userId }); }
  async update(userId: string, id: string, body: string, updatedAt: string) {
    const result = await (await this.collection()).updateOne({ _id: id, userId }, { $set: { body, updatedAt } });
    return result.matchedCount ? this.get(userId, id) : null;
  }
  async delete(userId: string, id: string) { return (await (await this.collection()).deleteOne({ _id: id, userId })).deletedCount > 0; }
}
export class InMemoryLessonNotesRepository implements LessonNotesRepository {
  private readonly notes = new Map<string, LessonNoteDocument>();
  async list(userId: string, courseId: string) {
    return structuredClone([...this.notes.values()].reverse().filter(note => note.userId === userId && note.courseId === courseId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  async get(userId: string, id: string) {
    const note = this.notes.get(id);
    return note?.userId === userId ? structuredClone(note) : null;
  }
  async create(userId: string, note: LessonNote) { this.notes.set(note.id, { ...structuredClone(note), _id: note.id, userId }); }
  async update(userId: string, id: string, body: string, updatedAt: string) {
    const note = this.notes.get(id);
    if (!note || note.userId !== userId) return null;
    Object.assign(note, { body, updatedAt }); return structuredClone(note);
  }
  async delete(userId: string, id: string) {
    return this.notes.get(id)?.userId === userId ? this.notes.delete(id) : false;
  }
}
export function createLessonNotesRepository(): LessonNotesRepository {
  return hasMongoConfig() ? new MongoLessonNotesRepository() : new InMemoryLessonNotesRepository();
}
