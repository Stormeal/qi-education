import type { AuthUser } from '../src/auth.js';
import { MongoAuthRepository } from '../src/mongoAuthRepository.js';
import { fakeAuthCollection } from './fakeAuthCollection.js';

// In-memory Mongo operation double with pauses for cross-instance race tests.
export function authStoreDouble(users: AuthUser[] = []) {
  const fake = fakeAuthCollection();
  for (const { id, ...user } of users) fake.documents.set(id, structuredClone({ _id: id, ...user }));
  const state = {
    fake,
    writes: [] as string[],
    beforeRead: async () => {},
    beforeWrite: async (_field: string) => {},
    repository: () => new MongoAuthRepository(async () => fake.collection),
  };
  const find = fake.operations.findOne;
  fake.operations.findOne = async filter => {
    const snapshot = await find(filter);
    await state.beforeRead();
    return snapshot;
  };
  const update = fake.operations.findOneAndUpdate;
  fake.operations.findOneAndUpdate = async (filter, change, options) => {
    const field = Object.keys(change.$set ?? change.$addToSet ?? {})[0];
    await state.beforeWrite(field);
    const result = await update(filter, change, options);
    if (result) state.writes.push(field);
    return result;
  };
  return state;
}
