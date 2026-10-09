import { CourseDraftRecoveryService, type RecoverableCourseDraft } from './course-draft-recovery.service';
import { vi } from 'vitest';

const draft = { title: 'Unsaved title', description: '', requirements: '', whatYoullLearn: '', audience: '', level: '', partOfCareer: '', teacher: '', careerGoals: '', status: 'draft' as const, priceDkk: null };
function data(title = 'Unsaved title'): Omit<RecoverableCourseDraft, 'key' | 'updatedAt'> {
  return { accountId: 'owner', courseId: 'course', draft: { ...draft, title }, sections: [], revision: { version: 3, revisionId: 'revision' } };
}
describe('US-T003 account and tab scoped draft recovery', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(() => vi.restoreAllMocks());
  it('AC03 restores only the same account/course after refresh and discards intentionally', () => {
    const first = new CourseDraftRecoveryService(); expect(first.save(data())).toBe(true);
    const refreshed = new CourseDraftRecoveryService();
    expect(refreshed.load('owner', 'course')?.draft.title).toBe('Unsaved title');
    expect(refreshed.load('another-account', 'course')).toBeNull();
    expect(refreshed.load('owner', 'another-course')).toBeNull();
    refreshed.remove(refreshed.load('owner', 'course')!.key);
    expect(refreshed.load('owner', 'course')).toBeNull();
  });
  it('DR-03 keeps separate document drafts and prefers the current document', () => {
    const first = new CourseDraftRecoveryService(); first.save(data('First tab'));
    sessionStorage.clear();
    const second = new CourseDraftRecoveryService(); second.save(data('Second tab'));
    expect(first.load('owner', 'course')?.draft.title).toBe('First tab');
    expect(second.load('owner', 'course')?.draft.title).toBe('Second tab');
    second.remove(second.load('owner', 'course')!.key);
    expect(first.load('owner', 'course')?.draft.title).toBe('First tab');
  });
  it('DR-03 a cloned session identifier still creates an independent recovery record', () => {
    const first = new CourseDraftRecoveryService(); first.save(data('Original tab'));
    const duplicate = new CourseDraftRecoveryService(); duplicate.save(data('Duplicated tab'));
    expect(first.load('owner', 'course')?.draft.title).toBe('Original tab');
    expect(duplicate.load('owner', 'course')?.draft.title).toBe('Duplicated tab');
    duplicate.remove(duplicate.load('owner', 'course')!.key);
    expect(first.load('owner', 'course')?.draft.title).toBe('Original tab');
  });
  it('DR-02 ignores corrupt/expired records and reports quota failure', () => {
    const store = new CourseDraftRecoveryService(); store.save(data());
    const key = store.load('owner', 'course')!.key;
    localStorage.setItem(key, '{invalid'); expect(store.load('owner', 'course')).toBeNull();
    store.save(data()); vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 8 * 86400000);
    expect(store.load('owner', 'course')).toBeNull();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota'); });
    expect(store.save(data())).toBe(false);
  });
  it('DR-02 rejects malformed nested content and bounds storage size', () => {
    const store = new CourseDraftRecoveryService(); store.save(data());
    const key = store.load('owner', 'course')!.key;
    const record = JSON.parse(localStorage.getItem(key)!); record.sections = [{ id: 's', title: 'bad', components: [{ type: 'quiz', quiz: { questions: null } }] }];
    localStorage.setItem(key, JSON.stringify(record)); expect(store.load('owner', 'course')).toBeNull();
    expect(store.save(data('x'.repeat(2100000)))).toBe(false);
  });
});
