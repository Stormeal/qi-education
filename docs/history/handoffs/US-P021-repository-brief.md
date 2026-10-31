# US-P021 repository work brief

Read first: this is the adapter task's requirements. Main spec:
docs/stories/US-P021-gdpr-data-rights.md, disposition table. Project instructions
require main, isolated mutation tests, no push, no shared mutations, preserve others' files.

Implement collectForExport(userId: string) plus removeForUser(userId: string)
for accountProfileRepository, learningProgressRepository, lessonNotesRepository,
accountCareersRepository, notificationRepository. All user records, never default
pagination; caller-scoped, plain serializable, defensive copies for memory.
InstructorProfileRepository instead implements anonymizeForUser(userId: string)
by clearing description (current schema only has description), and collectForExport.
PaymentRepository implements collectForExport and anonymizeForUser; retained
payment schema has no direct name/email today, retain approved Stripe customer ID
and accounting fields, explicitly whitelist export/retained fields.
Also passwordResetRepository/emailConfirmationRepository implement removeForUser
revoking/removing all that user's tokens. Extend interfaces, all implementations,
unavailable fallbacks, matching collection boundaries and relevant test fakes.

Do not edit auth*, server.ts, privacy*, organization*, feedback*, course*,
userChange*, signIn*, app/, docs (other than your report), package/version files.
No commits; root owns consolidated commits and build integration.
No subagents. Follow TDD: write meaningful failing tests, run RED, implement,
run focused tests GREEN. Test real memory and Mongo adapter boundaries using
isolated collection doubles, 2 users, repeat erasure, >50 notifications,
secret-free exports. Avoid changing unrelated behavior.

Write report to docs/handoffs/US-P021-repository-report.md: files, methods,
RED/GREEN commands/results, limitations, decisions, integration concerns. Return
only status, test summary and report path.
