import { randomUUID } from 'node:crypto';
import type { Collection } from 'mongodb';
import { apiConfig, hasMongoConfig } from './config.js';
import { getMongoDatabase } from './mongo.js';
import { LessonNoteLimitError, type CreateLessonNoteInput, type LessonNote } from './lessonNotes.js';

export interface LessonNotesRepository {
  collectForExport(userId: string): Promise<LessonNote[]>;
  removeForUser(userId: string): Promise<void>;
  list(userId: string, courseId: string): Promise<LessonNote[]>;
  add(userId: string, courseId: string, input: CreateLessonNoteInput): Promise<LessonNote>;
  update(userId: string, courseId: string, noteId: string, text: string): Promise<LessonNote | null>;
  delete(userId: string, courseId: string, noteId: string): Promise<boolean>;
}
export type LessonNotesDocument = { _id: string; userId: string; courseId: string; notes: LessonNote[] };
export type LessonNotesCollection = Pick<Collection<LessonNotesDocument>, 'findOne' | 'updateOne' | 'findOneAndUpdate' | 'find' | 'deleteMany'>;
const key = (userId: string, courseId: string) => JSON.stringify([userId, courseId]);
const filter = (userId: string, courseId: string) => ({ _id: key(userId, courseId), userId, courseId });
const createNote = (courseId: string, input: CreateLessonNoteInput): LessonNote => {
  const now = new Date().toISOString();
  return { ...input, courseId, id: randomUUID(), createdAt: now, updatedAt: now };
};
const exportNote = ({ id, courseId, componentId, text, videoSeconds, createdAt, updatedAt }: LessonNote): LessonNote =>
  ({ id, courseId, componentId, text, videoSeconds, createdAt, updatedAt });
const ordered = (notes: LessonNote[]) => structuredClone(notes).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export class InMemoryLessonNotesRepository implements LessonNotesRepository {
  async collectForExport(userId: string): Promise<LessonNote[]> {
    return [...this.documents].filter(([id]) => (JSON.parse(id) as string[])[0] === userId)
      .flatMap(([, notes]) => notes.map(exportNote));
  }
  async removeForUser(userId: string): Promise<void> {
    for (const id of this.documents.keys()) if ((JSON.parse(id) as string[])[0] === userId) this.documents.delete(id);
  }

  private readonly documents = new Map<string, LessonNote[]>();
  async list(userId: string, courseId: string): Promise<LessonNote[]> {
    return ordered(this.documents.get(key(userId, courseId)) ?? []);
  }
  async add(userId: string, courseId: string, input: CreateLessonNoteInput): Promise<LessonNote> {
    const notes = this.documents.get(key(userId, courseId)) ?? [];
    if (notes.length >= 500) throw new LessonNoteLimitError();
    const note = createNote(courseId, input);
    notes.push(note); this.documents.set(key(userId, courseId), notes);
    return structuredClone(note);
  }
  async update(userId: string, courseId: string, noteId: string, text: string): Promise<LessonNote | null> {
    const note = this.documents.get(key(userId, courseId))?.find(note => note.id === noteId);
    if (!note) return null;
    note.text = text; note.updatedAt = new Date().toISOString();
    return structuredClone(note);
  }
  async delete(userId: string, courseId: string, noteId: string): Promise<boolean> {
    const notes = this.documents.get(key(userId, courseId));
    const index = notes?.findIndex(note => note.id === noteId) ?? -1;
    if (!notes || index < 0) return false;
    notes.splice(index, 1); return true;
  }
}

// One bounded document per account/course makes the limit atomic across hosts.
// These writes do not acquire or alter the course authoring lock.
export class MongoLessonNotesRepository implements LessonNotesRepository {
  async collectForExport(userId: string): Promise<LessonNote[]> {
    const documents = await (await this.collection()).find({ userId }).toArray();
    return documents.flatMap(document => document.notes.map(exportNote));
  }
  async removeForUser(userId: string): Promise<void> {
    const result = await (await this.collection()).deleteMany({ userId }, { writeConcern: { w: 'majority' } });
    if (!result.acknowledged) throw new Error('Lesson notes deletion was not confirmed.');
  }

  constructor(private readonly collection: () => Promise<LessonNotesCollection> = async () =>
    (await getMongoDatabase()).collection<LessonNotesDocument>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_lesson_notes`)) {}

  async list(userId: string, courseId: string): Promise<LessonNote[]> {
    const document = await (await this.collection()).findOne(filter(userId, courseId));
    return ordered(document?.notes ?? []);
  }
  async add(userId: string, courseId: string, input: CreateLessonNoteInput): Promise<LessonNote> {
    const collection = await this.collection();
    const note = createNote(courseId, input);
    const bounded = { ...filter(userId, courseId), 'notes.499': { $exists: false } };
    const update = { $setOnInsert: { userId, courseId }, $push: { notes: note } };
    try {
      const result = await collection.updateOne(bounded, update, { upsert: true, writeConcern: { w: 'majority' } });
      if (!result.acknowledged) throw new Error('Note creation was not confirmed.');
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) throw error;
      // A simultaneous first write may have created the document; retry only
      // the bounded append. A full document cannot match and cannot grow.
      const result = await collection.updateOne(bounded, { $push: { notes: note } }, { writeConcern: { w: 'majority' } });
      if (!result.acknowledged) throw new Error('Note creation was not confirmed.');
      if (!result.matchedCount) throw new LessonNoteLimitError();
    }
    return note;
  }
  async update(userId: string, courseId: string, noteId: string, text: string): Promise<LessonNote | null> {
    const document = await (await this.collection()).findOneAndUpdate({ ...filter(userId, courseId), 'notes.id': noteId },
      { $set: { 'notes.$.text': text, 'notes.$.updatedAt': new Date().toISOString() } },
      { returnDocument: 'after', includeResultMetadata: false, writeConcern: { w: 'majority' } });
    return document?.notes.find(note => note.id === noteId) ?? null;
  }
  async delete(userId: string, courseId: string, noteId: string): Promise<boolean> {
    const result = await (await this.collection()).updateOne({ ...filter(userId, courseId), 'notes.id': noteId },
      { $pull: { notes: { id: noteId } } }, { writeConcern: { w: 'majority' } });
    if (!result.acknowledged) throw new Error('Note deletion was not confirmed.');
    return result.modifiedCount === 1;
  }
}

export function createLessonNotesRepository(): LessonNotesRepository {
  return hasMongoConfig() ? new MongoLessonNotesRepository() : new InMemoryLessonNotesRepository();
}
