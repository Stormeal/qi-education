# Defects

Open defects and investigations. Every resolved record, with its reproduction, fix, commit and
evidence, is in [defects_resolved.md](defects_resolved.md); look an ID up there. Severity is impact;
delivery order is in [work_queue.md](work_queue.md).

## Triage rules

P1: unauthorized changes/disclosure or a serious release risk. P2: broken core behavior or
misleading results with a workaround. P3: smaller usability/layout issue.

States: Open, Investigating, In progress, Fixed, Verified, Deferred, Duplicate. Fixed requires a
delivery commit and regression evidence. Verified also requires the specified environment check.
A plausible code concern without reproduction is an investigation (INV-), not a confirmed defect.
Capture user data only in anonymized form.

When a defect is fixed, move its whole record to `defects_resolved.md` with the resolution date,
fixing commit, passing regression checks and any remaining release checks. Never delete or reuse IDs.
Next free IDs: DEF-053, INV-020.

## Open defects

X3 discoveries below were reproduced on 2026-10-20 against `546a2d4` using isolated stores and
synthetic inputs only. No production incident is asserted. Full scenarios, verified causes,
suggested fixes and evidence limits are in the linked audit sections. All remain unfixed;
fixing commit and permanent regression evidence: none.

| ID | Severity / state | Finding, expected behavior and reproduction | Next verification / related |
| --- | --- | --- | --- |
| DEF-047 | P1 / Open | **In-flight reset overwrites a later successful password change.** `passwordResetRoutes.ts:66,72`; `mongoAuthRepository.ts:62`. Pause reset confirmation at its final password write after the credential recheck; complete a signed-in password change (204); release reset. Reset also returns 204 and the reset password replaces the newer password. Expected: an older link cannot overwrite a changed credential (password/email spec, credential fingerprint rule). The final update has no expected-credential condition. [Audit reproduction](audits/2026-10-api-audit.md#def-047). | Add atomic expected-credential replacement, then a barrier test at the final write across independent repositories. Account owner can lose control to an already in-flight old-link request. Related: `specs/accounts/passwords-and-email.md:46`. |
| DEF-048 | P1 / Open | **Hosted marker can select console mail and print bearer links.** `config.ts:11`; `mailSender.ts:56,62,68`. In a synthetic `VERCEL=1`, non-production `NODE_ENV` configuration, service mode is hosted but the mail factory returns an available local sender; sending fixture mail prints its complete token. Expected: hosted mode uses configured delivery or refuses, and does not print reset links. No deployed environment/log was inspected. Hosted check 2026-10-20 (Claude, read-only `/api/health/config`): `mail.provider` is `brevo`, so the hosted API is not in this state today; the risk is latent. [Audit reproduction](audits/2026-10-api-audit.md#def-048). | Align mail selection/availability with the trusted hosted policy; test host-marker variants and direct local sender use. Conditional hosted credential disclosure and missing mail delivery. Related: storage/run-mode and password/email specs. |
| DEF-049 | P2 / Open | **Raw exceptions reach logs without redaction.** `server.ts:1597,1604` and provider-specific sinks. Inject `listCourses` throwing an error with a synthetic bearer canary under `request.headers.authorization`; GET `/courses`. HTTP 500 stays generic, but captured `console.error` receives the entire secret-bearing object. Expected: bounded diagnostics without credentials or bearer links. This proves the log boundary, not a real provider-secret incident. [Audit reproduction](audits/2026-10-api-audit.md#def-049). | Central allowlisted/redacted error logger; nested canary regressions for global/provider handlers. Check real provider exception shapes and downstream log policy separately. Related: account mail secrecy and platform reliability. |
| DEF-050 | P2 / Open | **Two-instance duplicate course purchases miss the warning.** `paymentRoutes.ts:38–49`. Two app instances share isolated stores and a fake provider; confirm distinct paid sessions for one learner/course, pausing both after insert and before enrollment. Both return 200; two payments and one enrollment persist, but no duplicate-purchase warning is emitted. Expected: the second distinct purchase is recorded and logged for refund follow-up. The warning uses a stale pre-enrollment snapshot and a process-local queue. [Audit reproduction](audits/2026-10-api-audit.md#def-050). | Atomic durable first-purchase/enrollment classification plus two-instance regression; keep both payment records and retry recovery. Same-session idempotency is unaffected. Related: US-L024, `specs/payments/payments.md`. |
| DEF-051 | P2 / Open | **Schema-valid multi-lesson course cannot be saved.** `server.ts:471`; `courseContent.ts:32,94,98`. A teacher-owned draft with six 20,000-character text lessons passes `updateCourseContentSchema`, but its 120,436-byte full PATCH with a current revision returns 413. A one-lesson control returns 200. Expected: supported full-course content can be saved within a deliberately aligned size contract. Default JSON parser limit rejects it before the handler. [Audit reproduction](audits/2026-10-api-audit.md#def-051). | Define bounded total save size consistent with hosting limits, align parser/schema/editor guidance, add realistic boundary regression. Related: authoring lessons/builder and course-editor specs. |
| DEF-052 | P3 / Open | **Multibyte malformed token causes 500.** `auth.ts:107–111`. GET `/auth/me` with `Bearer e30.e30.` plus 43 `é` characters. Character length passes; UTF-8 buffer lengths differ, so `timingSafeEqual` throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`; response is generic 500. Expected: malformed credentials return 401 without error-level noise. No authentication bypass observed. [Audit reproduction](audits/2026-10-api-audit.md#def-052). | Validate base64url signature/byte lengths and add malformed-token regressions on protected paths. Related: sign-in/session spec. |

## Open investigations

| ID | Concern | Next verification | Related |
| --- | --- | --- | --- |
| INV-003 | Account concurrency evidence added 2026-10-20: [multiInstanceAccounts.test.ts](../api/src/multiInstanceAccounts.test.ts), 8 passing tests. Two `createServer` instances with independent account repositories/queues share isolated Mongo account/catalog collections: forced overlapping normalized-email signup yields one 201, one clear 409 and one account; concurrent different-course enrollments both persist; duplicate enrollment is stored once; both instances restore the same account state. Both root and `/api` paths tested. The account fake now enforces email uniqueness only after a successful unique-index build, including duplicate-key failures on inserts/updates. | Recommend closing the account-code part of US-P003-AC04 based on unique email indexing and atomic `$addToSet`, pending Alex's acceptance. Real MongoDB/Atlas, deployed index existence or legacy duplicates, majority-write durability and failover were not tested; confirm the deployed unique email index read-only before closing the hosted investigation. Feedback restart/cross-instance idempotency remains open in INV-004; the US-P003 story is unchanged. | US-P003-AC04 |
| INV-004 | Feedback triage creates the GitHub issue before saving its link; a retry on another instance or after a restart can create a second issue (same-instance retry fixed, DEF-025) | Fail the link save after a stub issue, retry on a fresh instance, count issues | US-P003-AC04 |
| INV-019 | A hosted video lesson kept spinning on the learning page (Alex, 2026-10-17); not reproduced locally, possibly a side effect of DEF-043 | Open the same hosted lesson after the DEF-043 fix; if it still spins, copy the console and `mux-player` network requests | Learning page |

## New defect record

Include the next unused DEF ID, title, severity, state, discovery date, tested commit and
environment, expected behavior and its source, actual behavior, minimal reproduction, impact,
root cause if verified, related story or spec, regression check, fixing commit and verification
outcome. Use Investigating when the observation is not yet confirmed.
