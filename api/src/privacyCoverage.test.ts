import { readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { PERSONAL_DATA_DOMAINS } from './privacyService.js';
import { privacyFixture } from '../test/privacyFixture.js';

// These stores retain published course content or bounded operational metadata,
// not per-account profile/learning records. New repository files require a policy.
const retainedInfrastructure = {
  'mongoAuthRepository.ts': 'auth adapter covered by authRepository policy',
  'mongoCourseRepository.ts': 'course adapter covered by courseRepository policy',
  'courseAssetRepository.ts': 'course-owned published assets retained with transferred courses; no uploader identity stored',
  'feedbackIssueOperationRepository.ts': 'opaque feedback issue-operation identity and issue reference retained for retry integrity',
  'signInAttemptRepository.ts': 'hashed email security counters expire with their short-lived lock window',
  'clientLimitRepository.ts': 'hashed network/purpose counters expire after their hour window',
};
describe('US-P021 repository privacy coverage', () => {
  it('requires every repository to declare a personal-data or retention policy', async () => {
    const files = (await readdir(new URL('.', import.meta.url))).filter(file => file.endsWith('Repository.ts'));
    const covered = new Set([...Object.values(PERSONAL_DATA_DOMAINS).map(policy => policy.file), ...Object.keys(retainedInfrastructure)]);
    expect(files.filter(file => !covered.has(file))).toEqual([]);
  });
  it('wires each runtime repository to its export and disposition, and executes both against a fresh user', async () => {
    const { stores, service, user, passwordHash } = await privacyFixture();
    for (const [key, policy] of Object.entries(PERSONAL_DATA_DOMAINS)) {
      const repository = stores[key as keyof typeof stores] as unknown as Record<string, unknown>;
      expect(repository, key).toBeDefined();
      if (!['courses', 'content'].includes(key)) expect(typeof repository[policy.erase], key).toBe('function');
      if (policy.export && !['courses', 'content'].includes(key)) expect(typeof repository.collectForExport, key).toBe('function');
    }
    const result = await service.exportUserData(user.id);
    expect(result).toMatchObject({ profile: null, instructorProfile: null, progress: [], notes: [], notifications: [], payments: [], authoring: [] });
    await service.eraseUser(user.id, passwordHash);
    expect((await stores.auth.findById(user.id))?.privacyErasure?.state).toBe('complete');
  });
});
