/*
 * X4 account/admin error-exit inventory (source lines as audited 2026-10-20).
 * Count one explicit handler/status/decision exit, plus each caught mapping per
 * handler (typed 503, forwarded generic 500, forwarded Mongo outage 503). A catch
 * which handles every exception with the same response counts once, not once per
 * repository method. Role 403 counts once per handler. Shared authenticateRequest
 * 401/503 and JSON-parser 400/413/415 are inventoried by X1/server tests, not
 * repeatedly here. Route-specific authentication-error middleware counts once.
 * B = existing test; N = focused test below; U = uncovered/defective.
 * Baseline concurrent [204,410] assertions alone do not prove a post-read claim
 * refusal: deterministic tests below distinguish that exit from initial lookup.
 *
 * adminUsersRoutes.ts (24 = 24 B + 0 N + 0 U)
 * GET /admin/users: 403 :35 B adminUsers AC02 denies; 400 :39 B AC03 rejects
 * invalid search; caught503 :33/35 B AC06 safely handles list storage failures.
 * PATCH role: 403 :46 B AC02 denies; 400 :48 B AC04 rejects role body;
 * own409 :51 B AC04 refuses own role; missing404 :55 B AC04 missing accounts;
 * caught503 :33/46 B adminUserChanges AC13 failed role account write;
 * caught log failure (200, warning) :27/56 B AC13 failed log still commits role.
 * PATCH status: 403 :60 B adminUserChanges AC11 rejects; 400 :62 B AC10 invalid
 * status; own409 :66 B AC10 refuses own status; missing404 :70 B AC10 missing
 * target; caught503 :33/60 B AC13 failed status account write; caught log failure
 * (200, warning) :27/71 B AC13 failed log still commits status.
 * GET changes: 403 :75 B AC11 rejects; caught503 :33/75 B AC11 failed log read.
 * POST reset: 403 :78 B adminUsers AC02 denies; missing404 :80 B AC04 missing
 * accounts; inactive409 :81 B AC06 reports inactive; limit409 :83 B AC06 public
 * and admin mail share three slots; mail503 :84 B AC06 unconfigured/failed mail;
 * caught503 :33/78 B AC06 safely handles reset storage failures (reserve).
 * Authentication error middleware503 :88-89 B AC06 safely handles auth failure.
 *
 * accountProfileRoutes.ts (3 = 3 B + 0 N + 0 U)
 * GET caught503 :14/19 B accountProfile AC08 returns safe503 GET store failures.
 * PUT invalid400 :25 B AC05 rejects incomplete/non-object and invalid fields;
 * caught503 :14/32 B AC08 returns safe503 PUT store failures. Both catches handle
 * ALL errors, so neither generic500 nor a separate forwarded Mongo503 is reachable.
 *
 * instructorProfileRoutes.ts (20 = 11 B + 9 N + 0 U)
 * GET own: role403 :29 B instructorProfile AC05 protects GET own; typed503 :24/29
 * N US-T007 typed outage GET own; generic500 :25/29 B AC08 reports get failure;
 * Mongo503 :25/29 N US-P002 Mongo outage GET own.
 * PUT own: role403 :32 B AC05 protects PUT own; invalid400 :35 B AC04 invalid
 * body; typed503 :24/32 B AC08 reports unavailable storage; generic500 :25/32 B
 * AC08 reports save failure; Mongo503 :25/32 N US-P002 Mongo outage PUT own.
 * GET public: typed503 :24/41 N US-T007 typed outage GET public; generic500
 * :25/41 B AC08 reports list failure public; Mongo503 :25/41 N US-P002 Mongo
 * outage GET public.
 * GET admin: role403 :53 B AC05 protects GET admin; typed503 :24/53 N US-T007
 * typed outage GET admin; generic500 :25/53 B AC08 reports list failure admin;
 * Mongo503 :25/53 N US-P002 Mongo outage GET admin.
 * DELETE admin: role403 :59 B AC05 protects DELETE; typed503 :24/59 N US-T007
 * typed outage DELETE admin; generic500 :25/59 B AC08 reports clear failure;
 * Mongo503 :25/59 N US-P002 Mongo outage DELETE admin.
 *
 * passwordResetRoutes.ts (16 = 9 B + 4 N + 3 U)
 * POST request: invalid400 :31 B passwordReset L004-AC01 invalid request;
 * client429 :32 B clientLimitRoutes AC05 eleventh valid reset; unavailable503
 * :33 B L004-AC05 unconfigured mail; delivery503 :37 B L004-AC05 provider failure;
 * caught generic500 :25/28 B reset storage cannot reserve/activate (plain Error);
 * Mongo outage503 :25/28 U DEF-053, swallowed into500 by the local wrapper.
 * POST check: invalid410 :46 B L004-AC02 malformed/expired/disabled/deleted;
 * caught generic500 :25/41 N US-L004 unexpected token-check failure;
 * Mongo outage503 :25/41 U DEF-053, swallowed into500 by the local wrapper.
 * POST confirm: initial invalid410 :56 B L004-AC02 malformed/expired/disabled;
 * invalid password400 :59 B L004-AC02 signup validation; lost claim410 :61 N
 * US-L004 lost claim; stale account410 :69 N US-L004 account changes after claim;
 * disappeared update410 :73 N US-L004 missing password-update result;
 * caught generic500 :25/51 B fails closed after claimed token meets failed
 * password write (plain Error); Mongo outage503 :25/51 U DEF-053, swallowed500.
 *
 * changePasswordRoutes.ts (6 = 5 B + 1 N + 0 U)
 * POST: incorrect400 :21 B changePassword AC01/03 rejects current proof;
 * policy400 :24 B AC03 invalid new password; equal400 :26 B AC03 different
 * password; missing update503 :32 N US-L013 disappeared password-update result;
 * caught503 :35 B AC04 cancellation failure/thrown password write.
 * Authentication error middleware503 :39-40 B AC04 thrown read failure.
 * Local account recheck401 :18 is excluded with 401s but additionally proved here
 * by US-L013 refuses account removed/disabled after authentication.
 *
 * emailConfirmationRoutes.ts (8 = 5 B + 3 N + 0 U)
 * POST confirm: initial invalid410 :29 B emailConfirmation AC01 malformed,
 * expired, disabled; lost claim410 :31 N US-L014 lost confirmation claim;
 * disappeared update410 :33 N US-L014 disappeared confirmation account;
 * caught503 :22/25 B AC01 confirmation storage failures, consume/account failures.
 * POST resend: client429 :40 B AC02 eleventh resend network429; mail503 :42 N
 * US-L014 confirmation mail unavailable; account429 :45 B AC02 signup mail counts
 * toward three; caught503 :22/37 B AC02 resend reserve/activate storage failure.
 *
 * courseLocksRoutes.ts (3 = 2 B + 1 N + 0 U)
 * GET: role403 :12 B courseLocks US-P005-AC02 anonymous/student/teacher;
 * caught503 :21 B US-P005-AC01 lock store failures; authentication error
 * middleware503 :24-25 N US-P005 authentication-store outage.
 *
 * TOTAL: 80 exits, 59 baseline, 18 newly covered, 3 left uncovered due to DEF-053.
 * Mongo503 is an expected forwarding contract, currently unreachable because the
 * password-reset wrapper catches every error. Reproduction lives temporarily in
 * .git/x4-password-reset-outage.mts, not in passing characterization tests.
 * DEF-047..052 are existing debt and are not duplicated or blessed here.
 */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, hashPassword, verifyPassword, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { apiConfig } from './config.js';
import { InMemoryAccountCareersRepository } from './accountCareersRepository.js';
import { InMemoryAccountProfileRepository } from './accountProfileRepository.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { InMemoryClientLimitRepository } from './clientLimitRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryEmailConfirmationRepository } from './emailConfirmationRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { InMemoryInstructorProfileRepository, InstructorProfileUnavailableError } from './instructorProfileRepository.js';
import { InMemoryLearningProgressRepository } from './learningProgressRepository.js';
import { InMemoryLessonNotesRepository } from './lessonNotesRepository.js';
import { LocalMailSender } from './mailSender.js';
import { InMemoryPasswordResetRepository } from './passwordResetRepository.js';
import { InMemoryPaymentRepository } from './paymentRepository.js';
import { resetTokenHash } from './passwordResetDelivery.js';
import { InMemorySignInAttemptRepository } from './signInAttemptRepository.js';
import { createServer } from './server.js';
import { InMemoryUserChangeRepository } from './userChangeRepository.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  vi.restoreAllMocks();
});
const invalidReset = { message: 'This reset link is no longer valid. Request a new one.', code: 'reset-link-invalid' };
const invalidConfirmation = { message: 'This confirmation link is no longer valid. Request a new one.', code: 'confirm-link-invalid' };
const passwordBody = { currentPassword: 'Password123!', newPassword: 'Changed456!' };
const outage = () => Object.assign(new Error('Synthetic private storage detail'), { name: 'MongoNetworkError' });

async function setup() {
  const auth = new InMemoryAuthRepository(), profiles = new InMemoryInstructorProfileRepository();
  const resets = new InMemoryPasswordResetRepository(), confirmations = new InMemoryEmailConfirmationRepository();
  const mail = new LocalMailSender(() => {}), content = new InMemoryCourseContentRepository();
  const [student, teacher, admin] = await Promise.all(['student', 'teacher', 'admin'].map(role => auth.findByEmail(`${role}@qi-education.local`))) as AuthUser[];
  const server = createServer({
    authRepository: auth, instructorProfileRepository: profiles, passwordResetRepository: resets,
    emailConfirmationRepository: confirmations, mailSender: mail, courseContentRepository: content,
    accountProfileRepository: new InMemoryAccountProfileRepository(), accountCareersRepository: new InMemoryAccountCareersRepository(),
    careerPathRepository: new InMemoryCareerPathRepository(), clientLimitRepository: new InMemoryClientLimitRepository(),
    courseAssetRepository: new InMemoryCourseAssetRepository(), courseRepository: new InMemoryCourseRepository(),
    feedbackRepository: new InMemoryFeedbackRepository(), learningProgressRepository: new InMemoryLearningProgressRepository(),
    lessonNotesRepository: new InMemoryLessonNotesRepository(), paymentRepository: new InMemoryPaymentRepository(),
    signInAttemptRepository: new InMemorySignInAttemptRepository(), userChangeRepository: new InMemoryUserChangeRepository(),
    passwordResetOptions: { now: () => 1000, appPublicUrl: 'https://example.test' },
    emailConfirmationOptions: { now: () => 1000, appPublicUrl: 'https://example.test' },
    muxVideoService: null, muxWebhookService: null, paymentService: null,
    gitHubFeedbackService: { async createIssueFromFeedback() { throw new Error('External services forbidden'); } },
  }).listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  function request(path: string, method = 'GET', body?: unknown, user?: AuthUser) {
    return fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
      ...(user ? { authorization: `Bearer ${createSessionToken(user, apiConfig.AUTH_TOKEN_SECRET, 3600)}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  async function issueReset() {
    expect((await request('/auth/password-reset/request', 'POST', { email: student.email })).status).toBe(202);
    return mail.messages[0].text.match(/#token=([A-Za-z0-9_-]+)/)![1];
  }
  async function issueConfirmation() {
    student.emailConfirmed = false;
    expect((await request('/auth/email-confirmation/resend', 'POST', {}, student)).status).toBe(202);
    return mail.messages[0].text.match(/#token=([A-Za-z0-9_-]+)/)![1];
  }
  return { auth, profiles, resets, confirmations, mail, content, student, teacher, admin, request, issueReset, issueConfirmation };
}

const instructorCases = [
  { label: 'GET own', operation: 'get', method: 'GET', path: '/users/me/instructor-profile' },
  { label: 'PUT own', operation: 'save', method: 'PUT', path: '/users/me/instructor-profile' },
  { label: 'GET public', operation: 'list', method: 'GET', path: '/instructors' },
  { label: 'GET admin', operation: 'list', method: 'GET', path: '/admin/instructor-profiles' },
  { label: 'DELETE admin', operation: 'clear', method: 'DELETE', path: '/admin/instructor-profiles/unknown' },
] as const;

describe('X4 uncovered account/admin error exits', () => {
  it.each(instructorCases.filter(row => row.operation !== 'save'))('US-T007 typed outage $label', async row => {
    const { profiles, admin, request } = await setup();
    vi.spyOn(profiles, row.operation).mockRejectedValueOnce(new InstructorProfileUnavailableError());
    const response = await request(row.path, row.method, undefined, admin);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: 'Instructor profile storage is temporarily unavailable.' });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it.each(instructorCases)('US-P002 Mongo outage $label', async row => {
    const { profiles, admin, request } = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(profiles, row.operation).mockRejectedValueOnce(new Error('Synthetic wrapper', { cause: outage() }));
    const response = await request('/api' + row.path, row.method, row.method === 'PUT' ? { description: 'Keep this text' } : undefined, admin);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: 'Storage is temporarily unavailable. Please try again.', code: 'STORE_UNAVAILABLE', retryable: true });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await profiles.list()).toEqual([]);
  });

  it('US-L004 lost claim refuses a reset after its initial valid lookup', async () => {
    const { auth, resets, student, request, issueReset } = await setup();
    const token = await issueReset(), before = student.passwordHash;
    const consume = vi.spyOn(resets, 'consume').mockResolvedValueOnce(null);
    const write = vi.spyOn(auth, 'updatePasswordHash');
    const response = await request('/auth/password-reset/confirm', 'POST', { token, password: 'Changed456!' });
    expect(response.status).toBe(410); expect(await response.json()).toEqual(invalidReset);
    expect(consume).toHaveBeenCalledOnce(); expect(write).not.toHaveBeenCalled();
    expect((await auth.findById(student.id))?.passwordHash).toBe(before);
  });

  it.each(['removed', 'disabled', 'credential changed'] as const)('US-L004 account changes after claim: %s', async change => {
    const { auth, resets, student, request, issueReset } = await setup();
    const token = await issueReset(), consume = resets.consume.bind(resets);
    vi.spyOn(resets, 'consume').mockImplementationOnce(async (...args) => {
      const claimed = await consume(...args);
      if (change === 'removed') vi.spyOn(auth, 'findById').mockResolvedValueOnce(null);
      else if (change === 'disabled') await auth.updateStatus(student.id, 'disabled');
      else await auth.updatePasswordHash(student.id, hashPassword('Later789!'));
      return claimed;
    });
    const response = await request('/auth/password-reset/confirm', 'POST', { token, password: 'Changed456!' });
    expect(response.status).toBe(410); expect(await response.json()).toEqual(invalidReset);
    expect(await resets.findActive(resetTokenHash(token)!, 1000)).toBeNull();
    expect(verifyPassword('Changed456!', (await auth.findById(student.id))!.passwordHash)).toBe(false);
  });

  it('US-L004 missing password-update result keeps the claimed reset unusable', async () => {
    const { auth, resets, mail, request, issueReset } = await setup();
    const token = await issueReset();
    const write = vi.spyOn(auth, 'updatePasswordHash').mockResolvedValueOnce(null);
    const response = await request('/auth/password-reset/confirm', 'POST', { token, password: 'Changed456!' });
    expect(response.status).toBe(410); expect(await response.json()).toEqual(invalidReset);
    expect(write).toHaveBeenCalledOnce(); expect(mail.messages).toHaveLength(1);
    expect(await resets.findActive(resetTokenHash(token)!, 1000)).toBeNull();
  });

  it('US-L013 disappeared password-update result returns503 after cancelling reset links', async () => {
    const { auth, resets, student, mail, request, issueReset } = await setup();
    const token = await issueReset(), before = student.passwordHash;
    vi.spyOn(auth, 'updatePasswordHash').mockResolvedValueOnce(null);
    const response = await request('/api/users/me/password', 'POST', passwordBody, student);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: 'Password change is temporarily unavailable. Please try again later.' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await resets.findActive(resetTokenHash(token)!, 1000)).toBeNull();
    expect((await auth.findById(student.id))?.passwordHash).toBe(before); expect(mail.messages).toHaveLength(1);
  });

  it.each(['removed', 'disabled'] as const)('US-L013 refuses account %s after authentication', async state => {
    const { auth, resets, student, request } = await setup();
    vi.spyOn(auth, 'findById').mockResolvedValueOnce(student).mockResolvedValueOnce(state === 'removed' ? null : { ...student, status: 'disabled' });
    const invalidate = vi.spyOn(resets, 'invalidateAll'), write = vi.spyOn(auth, 'updatePasswordHash');
    const response = await request('/users/me/password', 'POST', passwordBody, student);
    expect(response.status).toBe(401); expect(await response.json()).toEqual({ message: 'Authentication required' });
    expect(invalidate).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  });

  it('US-L014 lost confirmation claim refuses a token after its initial valid lookup', async () => {
    const { auth, confirmations, request, issueConfirmation } = await setup();
    const token = await issueConfirmation();
    const consume = vi.spyOn(confirmations, 'consume').mockResolvedValueOnce(null), write = vi.spyOn(auth, 'confirmEmail');
    const response = await request('/auth/email-confirmation/confirm', 'POST', { token });
    expect(response.status).toBe(410); expect(await response.json()).toEqual(invalidConfirmation);
    expect(consume).toHaveBeenCalledOnce(); expect(write).not.toHaveBeenCalled();
  });

  it('US-L014 disappeared confirmation account keeps its claimed token unusable', async () => {
    const { auth, confirmations, student, request, issueConfirmation } = await setup();
    const token = await issueConfirmation();
    const write = vi.spyOn(auth, 'confirmEmail').mockResolvedValueOnce(null);
    const response = await request('/api/auth/email-confirmation/confirm', 'POST', { token });
    expect(response.status).toBe(410); expect(await response.json()).toEqual(invalidConfirmation);
    expect(write).toHaveBeenCalledOnce(); expect((await auth.findById(student.id))?.emailConfirmed).toBe(false);
    expect(await confirmations.findActive(resetTokenHash(token)!, 1000)).toBeNull();
  });

  it.each(['settings', 'provider'] as const)('US-L014 confirmation mail unavailable: %s', async failure => {
    const { mail, confirmations, student, request } = await setup();
    student.emailConfirmed = false;
    if (failure === 'settings') Object.defineProperty(mail, 'available', { value: false });
    else vi.spyOn(mail, 'send').mockRejectedValueOnce(new Error('Synthetic private mail detail'));
    const reserve = vi.spyOn(confirmations, 'reserve');
    const response = await request('/auth/email-confirmation/resend', 'POST', {}, student);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: 'We could not send email right now. Please try again later.' });
    expect(reserve).toHaveBeenCalledOnce(); expect(mail.messages).toEqual([]);
    expect(await confirmations.findActive(reserve.mock.calls[0][1], 1000)).toBeNull();
  });

  it('US-P005 authentication-store outage never reads lock storage', async () => {
    const { auth, content, admin, request } = await setup();
    vi.spyOn(auth, 'findById').mockRejectedValueOnce(outage());
    const list = vi.spyOn(content, 'listCourseMutationLocks');
    const response = await request('/api/admin/course-locks', 'GET', undefined, admin);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: 'Course locks are temporarily unavailable. Please try again later.' });
    expect(response.headers.get('cache-control')).toBe('no-store'); expect(list).not.toHaveBeenCalled();
  });

  it('US-L004 unexpected token-check failure returns a private generic500', async () => {
    const { resets, request, issueReset } = await setup();
    const token = await issueReset();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(resets, 'findActive').mockRejectedValueOnce(new Error('Synthetic non-outage internal detail'));
    const response = await request('/api/auth/password-reset/check', 'POST', { token });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: 'Password reset is temporarily unavailable. Please try again later.' });
    expect(response.headers.get('cache-control')).toBe('no-store'); expect(error).not.toHaveBeenCalled();
  });
});
