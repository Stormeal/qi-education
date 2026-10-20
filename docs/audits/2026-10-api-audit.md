# API audit — 20 October 2026 (X3)

Audited source: `546a2d4` on `main`. This is a report, not a fix. Production code and existing tests were not changed. Six defects were reproduced with isolated fixtures; three additional risks need integration or scale evidence. Existing investigations remain open.

## Scope and evidence

Read the route registrations, middleware, authentication, schemas, repositories, service adapters, configuration, logging, locks/queues and backup utilities under `api/src/`. Compared behavior with the account, authoring, learning, storage/reliability and payment specifications. Reviewed every registered method/path against `routePermissions.test.ts`: **78 canonical pairs, 156 plain/`/api` variants** (20 public, 42 signed-in, 16 admin canonical pairs). Its 168 tests include implicit HEAD checks and cross-user profile, notes, progress, careers and payments checks on both prefixes.

Ran ephemeral `createServer` instances on loopback-assigned ports with in-memory stores, synthetic mail and `FakePaymentService`. For the Stripe adapter only, replaced SDK transport methods with in-process stubs and exercised webhook HMAC verification locally. No shared services, real credentials, provider requests, shared database writes or ports 3001/4200 were used. Probes were temporary audit scripts, not committed regression tests; reproduction steps are recorded below.

Verification on the audited source: `npm run api:test` — **77 files, 1,901 tests passed**; `npm run api:build` — **passed**. A green suite does not cover the newly reproduced interleavings. No hosted Vercel freeze, real MongoDB query plans/index inventory, provider sandbox purchase or browser rendering was verified in this audit.

## Findings ranked by severity

Severity follows `docs/defects.md`. “Reproduced” means a controlled local observation, not an incident observed on the hosted app. Risks below have concrete failure scenarios but no demonstrated production failure and are not assigned DEF IDs.

| Rank | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| 1 | P1 | [DEF-047: an in-flight reset overwrites a later successful password change](#def-047) | Reproduced |
| 2 | P1 | [DEF-048: a supported hosted configuration selects console mail and exposes reset links](#def-048) | Configuration/console probe; deployed environment not inspected |
| 3 | P2 | [DEF-049: arbitrary provider errors reach logs without redaction](#def-049) | Synthetic secret reached captured logger; HTTP response remained generic |
| 4 | P2 | [DEF-050: cross-instance double purchases miss the required duplicate warning](#def-050) | Two apps, two distinct paid sessions; two records, zero warnings |
| 5 | P2 | [DEF-051: valid full-course content is rejected at the JSON boundary](#def-051) | Schema-valid 120,436-byte save returned 413 |
| 6 | P2 risk | [R1: query predicates/sorts lack declared supporting indexes](#r1) | Source inspection; deployed indexes unknown |
| 7 | P2 risk | [R2: lists load complete collections before filtering or limiting](#r2) | Source inspection; no large-data load test |
| 8 | P2 risk | [R3: accepted course prices exceed the adapter's validated charging range](#r3) | Schema/adapter inspection; provider rejection not exercised |
| 9 | P3 | [DEF-052: a malformed multibyte token produces 500 instead of 401](#def-052) | Reproduced; no authentication bypass |

## DEF-047

**P1 — A stale reset can win after a successful password change.** Locations: `api/src/passwordResetRoutes.ts:66` (final credential read), `:72` (unconditional password write), `api/src/changePasswordRoutes.ts:30` (invalidate reset links), `:31` (password write), `api/src/mongoAuthRepository.ts:62` (update implementation).

The reset route checks the credential again after consuming its token, but that check and the final write are separate operations. The repository update matches only account ID and active status. An already claimed reset can pause after the check, let a signed-in password change finish, then overwrite that new password. Invalidating open links cannot cancel this already claimed request.

**Reproduce:** issue a reset link for an isolated active account. Start reset confirmation with password R and pause its `updatePasswordHash` immediately before the write, after the post-claim read. Change the same account's password from its original password to C through `/users/me/password`; await its 204 and verify C. Release the paused reset. Observed: reset also returns 204, C no longer matches, R matches. This models an attacker with a still-valid old reset link racing the account owner's password change. The spec says a link issued before a password change must be refused afterwards (`docs/specs/accounts/passwords-and-email.md:46`).

**Suggested fix:** make credential replacement conditional on the expected current credential in the final atomic database update; apply equivalent compare-and-set semantics to signed-in changes. A mismatch should refuse the reset (410), leave its claim consumed and preserve the newer credential. Add a barrier-controlled regression at the final write, including independent repository instances. An in-process queue alone is insufficient across hosts.

## DEF-048

**P1 — Hosted-mode selection and mail selection disagree.** Locations: `api/src/config.ts:10`–`12`, `api/src/mailSender.ts:56`, `:62`, `:66`–`69`.

Storage/service mode treats a host-provided `VERCEL` marker as hosted even when `NODE_ENV` is not `production`. Mail selection and `LocalMailSender.available` check only `NODE_ENV`. That supported configuration therefore reports mail available, performs no real delivery and prints complete mail text, including reset/confirmation bearer links, to the log sink.

**Reproduce:** without importing environment files, evaluate `getServicesMode({ NODE_ENV: 'development', VERCEL: '1' })` — `hosted`. With the same non-production node mode, call `createMailSender({})` and send a synthetic message containing `#token=X3_FAKE_TOKEN`, capturing console output. Observed: provider `local`, available `true`, complete token printed. This is a configuration-matrix probe, not evidence that the current deployment has this environment. A hosted log reader could use a reset link; users also never receive the promised mail.

**Suggested fix:** select and guard mail through the same trusted hosted-mode policy as storage. Hosted mode must use configured real mail or report unavailable, including direct `LocalMailSender` use. Add tests for a host marker with non-production/absent `NODE_ENV`; keep intentional console mail limited to isolated development/tests.

## DEF-049

**P2 — Raw exceptions bypass the mail/checkout log-redaction discipline.** Locations: `api/src/server.ts:1597`, `:1604` (global handlers); related raw-error sinks at `:229`, `:565`, `:866`, `:1048`, `:1163`, and `api/src/githubFeedback.ts:53`.

The global handler passes entire unknown errors to `console.error`. Several service/cleanup handlers do the same. A provider exception containing request headers, a response body, nested causes or a credential-bearing message can therefore be retained in hosted logs. This is distinct from leaking it to the HTTP caller: the error response was safe in the probe.

**Reproduce:** inject a course repository whose `listCourses` throws an `Error` carrying `request.headers.authorization = 'Bearer X3_FAKE_PROVIDER_SECRET_CANARY'`. Capture `console.error` and GET `/courses`. Observed: 500 with `{ message: 'Unexpected server error' }`, no canary in the response, but the original object and canary reach the logger. No real secret or deployed log was inspected. The confirmed defect is the missing redaction boundary; actual provider exception shapes and the deployment's downstream log filtering remain unverified.

**Suggested fix:** centralize logging with an allowlist of operation, safe error class/code and correlation ID. Do not serialize arbitrary headers, request/response objects, causes or provider messages. Add nested synthetic-canary regression tests for global and provider-specific error paths. Preserve useful diagnostics without credentials or bearer links.

## DEF-050

**P2 — A double charge can be recorded without the required duplicate-purchase warning.** Location: `api/src/paymentRoutes.ts:38`–`49`, particularly the read-before-insert snapshot and warning condition at `:45`.

The duplicate warning depends on the account already being enrolled when a request first reads it. `enrollmentWrites` serializes only within one app instance. Two different successful Checkout sessions handled on different instances can both read an unenrolled account, insert their distinct session records and enroll idempotently; neither logs the second purchase. Session deduplication and the final single enrollment still work. The missing warning affects finding/refunding a real second charge, not whether the learner receives access.

**Reproduce:** use two `createServer` instances sharing isolated auth/payment/course stores, independent queues and `FakePaymentService`. Create two paid sessions for the same learner/course. Barrier both requests after their payment insert, before enrollment, then confirm one session on each instance. Observed: `[200, 200]`, two payment records, one course enrollment and **zero** `Duplicate course purchase` log entries. This concerns different paid sessions, not repeat delivery of one session.

**Suggested fix:** classify the first purchase atomically using a durable unique user/course marker or an atomic enrollment result indicating whether this operation added the entitlement. Retain both session payment records and emit a safe, durable duplicate alert for the second distinct purchase. Add this two-instance interleaving to the payment tests and retain recovery when payment insertion succeeds but enrollment fails.

## DEF-051

**P2 — The transport limit rejects ordinary content permitted by the course schema.** Locations: `api/src/server.ts:471` (`express.json()` default limit), `:919` (full content update), `api/src/courseContent.ts:32` (20,000 characters), `:94`, `:98` (up to 200 components/sections).

Content saves send the full course. The schema allows several substantial text lessons, but the global JSON parser's default 100 KiB limit rejects the request before content validation or revision handling. A teacher can have entirely valid content that cannot be saved.

**Reproduce:** create an isolated teacher-owned draft; fetch its author view/revision. A one-lesson save with 20,000 text characters returns 200. Build six text lessons with 20,000 characters each; `updateCourseContentSchema.safeParse` succeeds. PATCH `/courses/:id/content` with the current `X-Course-Revision`. Measured request: 120,436 bytes. Observed: 413, `{ message: 'Request body exceeds the size limit.' }`. The revision was supplied and was current; this is not a stale-save failure.

**Suggested fix:** define an explicit, bounded total course/document size consistent with full-save semantics and the hosting platform's request ceiling. Align the parser, schema and editor's actionable size guidance, or split saves into bounded operations. Add a realistic multi-lesson boundary regression; do not remove request limits entirely.

## R1

**P2 growth risk — Index declarations do not cover several existing query shapes.** The following is a source inventory, not an assertion about indexes already installed manually in MongoDB.

| Query location | Query | Missing declaration / suggested support |
| --- | --- | --- |
| `api/src/learningProgressRepository.ts:26` | `find({ userId }).toArray()` | `{ userId: 1 }`; the composite string `_id` does not support this field predicate |
| `api/src/passwordResetRepository.ts:53`, `:58` | `findOne({ 'tokens.hash': hash })` | Multikey `{ 'tokens.hash': 1 }`; also applies to the inherited email-confirmation token store (`emailConfirmationRepository.ts:13`) |
| `api/src/userChangeRepository.ts:43` | `find().sort({ at: -1, _id: -1 }).limit(50)` | Matching `{ at: -1, _id: -1 }` for the bounded recent-changes list |
| `api/src/careerPathRepository.ts:94` | `countDocuments({ pathId })` on career selections | `{ pathId: 1 }` |

**Failure scenario:** as accounts, reset/confirmation documents and progress accumulate, a single token lookup or a learner's progress request can scan unrelated users' documents; repeated public token checks amplify database work. A limit of 50 does not itself make an unsupported sort efficient.

**Suggested fix:** provision indexes through a repeatable bootstrap/migration and check `listIndexes`/`explain` read-only against the deployed database. Ensure read-only traffic is not dependent on a later create call to initialize indexes. Auth email/enrollment indexes (`mongoAuthRepository.ts:18`–`20`) and catalog ordering (`mongoCourseRepository.ts:30`) are declared but initialized lazily during creates. Payment customer lookup has `{ userId: 1, paidAt: -1 }` (`paymentRepository.ts:33`); session uniqueness uses built-in `_id`. Sign-in/client rate stores declare TTL indexes. Profile, note, content, asset, lock and specific-record lookups using `_id` already have MongoDB's built-in support. No live query plan or missing deployed index was confirmed.

## R2

**P2 growth risk — Several lists materialize all records despite small or filtered responses.** Locations: `api/src/mongoAuthRepository.ts:36`–`37`, `api/src/adminUsersRoutes.ts:42`–`44`, `api/src/mongoCourseRepository.ts:26`, `api/src/courseReview.ts:136`, `api/src/careerPathRepository.ts:41`, `api/src/instructorProfileRepository.ts:47`, `api/src/instructorProfileRoutes.ts:43`, `:55`–`59`, `api/src/feedbackRepository.ts:45`–`65`, `:80`.

Admin user search loads every account (including password hashes internally), then filters/sorts and returns at most 50 safe DTOs. This is excessive internal data processing, not a password-hash disclosure in the response. Catalog/review, career and instructor lists also read all records. The admin instructor list additionally fans out an account lookup per populated profile. The Sheets feedback repository reads the sheet to list or locate an item; it has no indexed direct lookup and its full-row behavior must be considered separately from MongoDB indexes.

**Failure scenario:** a large account/catalog/feedback population causes an otherwise small search or list request to consume memory and time proportional to the whole dataset; concurrent requests and per-profile lookups can exceed function/database budgets. No such timeout or memory failure was measured here.

**Suggested fix:** move filters, projections, ordering and page boundaries into repository queries; use stable cursors, explicit maximum page sizes and suitable indexes. Avoid fetching credential fields for admin search; batch instructor account lookups. Bound feedback triage/list work or move it to indexed storage. Preserve public visibility rules while paging. Backup exports intentionally stream all records and are not the same HTTP-list risk.

## R3

**P2 integration risk — Price validation and supported charge amounts are not aligned.** Locations: `api/src/course.ts:53`, `:73` (nonnegative integer DKK), `api/src/paymentService.ts:58` (multiply by 100 without a minor-unit range guard).

The adapter correctly converts ordinary prices to øre, but the accepted price range is much wider than a merchant can charge. For example, 1 or 2 DKK is accepted; Stripe documents a 2.50 DKK minimum for DKK settlement, with settlement/payment-method qualifications. Very large safe whole-DKK integers can also become unsafe JavaScript integers after multiplication by 100. See [Stripe's currency and minimum/maximum amount rules](https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts) and [Checkout price data](https://docs.stripe.com/api/checkout/sessions/create).

**Failure scenario:** an admin publishes a positive price the provider refuses, and each checkout becomes the generic 503. At extreme values, conversion loses integer precision before the provider is called. `FakePaymentService` accepts these inputs, so it does not establish provider compatibility. No provider request was made to confirm rejection; actual merchant settlement settings were not inspected.

**Suggested fix:** validate a documented merchant-specific charge range and `Number.isSafeInteger(amountDkk * 100)` when setting a price and before checkout. Keep zero as the free-course case and return a clear validation error for unsupported positive values. Test the adapter's exact minor-unit parameters and configured minimum/maximum boundaries offline.

## DEF-052

**P3 — Malformed signature byte lengths escape token verification as server errors.** Location: `api/src/auth.ts:107`–`111`.

The verifier compares JavaScript string lengths before passing UTF-8 buffers to `timingSafeEqual`. A multibyte signature can have the expected character count but a different byte count. The crypto call throws outside the payload parse catch.

**Reproduce:** GET `/auth/me` with `Authorization: Bearer e30.e30.` followed by 43 `é` characters. Observed: 500 with the generic error body and a logged `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`. Expected: 401 for an invalid token. No token was accepted and no private data was returned; repeated malformed requests produce avoidable server-error logs.

**Suggested fix:** validate canonical base64url signature syntax and compare byte lengths before the constant-time comparison; treat malformed input as verification failure. Add multibyte, invalid-alphabet and truncated-signature cases expecting 401 without error-level logging.

## Checks with no additional finding

These statements describe source inspection and the stated isolated tests, not proof against every possible input or live-provider behavior.

| Boundary | Checked / result |
| --- | --- |
| Route entry permissions | Inspected registrations in `server.ts`, `adminUsersRoutes`, `courseLocksRoutes`, `accountProfileRoutes`, `instructorProfileRoutes`, `accountCareersRoutes`, `lessonExtrasRoutes`, `learningProgress`, password/email routes and `paymentRoutes`. X1 enumerates the actual Express stack and refuses unclassified additions. Anonymous protected requests return 401; student requests to admin routes return 403. No missing entry guard was found. |
| Fresh account/role state | Authentication rereads the account and rejects disabled accounts; client token role claims do not override current stored roles. Review submission is allowed to creators, while publication/return/archive actions check admin authority inside `CourseReviewService.act`. No role escalation was found. |
| Ownership and personal resources | Course content, assets, quiz and author-view paths check access/ownership. Personal profile, notes, progress, careers and payment identities come from the authenticated user. X1 cross-user probes on both prefixes passed. Instructor edits require creator permission; admin mutations require admin permission. |
| JSON bodies, params and query | Reviewed Zod validation for account/password, roles/status, course metadata/content/quiz, profile, notes/feedback, careers and payment bodies. IDs are converted to scalar strings or used as application map/ID values, not passed as caller-supplied Mongo selector objects. Author query mode applies an explicit permission check. Admin search is string-bounded and response-limited, though database work remains unbounded (R2). No Mongo operator injection was found. Transport/course-size inconsistency is DEF-051; malformed tokens are DEF-052. |
| Raw uploads/downloads | Raw parsers precede JSON parsing; author/auth guards precede upload processing. Thumbnail limit 2 MiB with allowed image MIME types; attachments 4 MiB with component/MIME checks. Course/component/asset membership is checked, names are sanitized and downloads use attachment disposition. Quiz-image references verify stored course/component/type. This is MIME/metadata validation, not a file-magic/malware scan or a browser rich-text/XSS assessment. No new upload ownership bypass was found. |
| Webhooks | Both public endpoints refuse unsigned bodies. Stripe's real SDK accepted a locally signed fixture and refused an invalid signature with `PaymentSignatureError`; no transport was used. Mux uses SDK signature verification on the raw body, checks event identity and ignores late events for replaced/deleted videos. No unsigned webhook path granting access was found. |
| Payment checkout / foreign sessions | Price comes from the published server-side course; client body cannot set it. Return URLs must match a configured origin and have no embedded credentials. Adapter sessions use payment mode, DKK, user/course metadata and client reference. Confirmation matches both authenticated user and route course; unpaid sessions do not grant access. Existing payment tests cover foreign user/course sessions, origin refusal and absent provider configuration. |
| Payment amounts / retry durability | Offline adapter probe: 499 DKK produced **49,900 øre**, reading 49,900 produced 499 DKK, metadata matched, zero provider requests. Mongo payment `_id` deduplicates sessions; payment insertion and account enrollment request majority acknowledgment. Replayed paid confirmation/webhook retries enrollment after a prior insertion; repeated delivery of one session does not add another payment/enrollment. Two distinct sessions have the warning gap in DEF-050. R3 concerns unsupported ranges, not the ordinary conversion. |
| HTTP error disclosure | Parser errors use controlled 400/413/415 responses; global failures return generic messages. The synthetic provider secret stayed out of the response. Validation responses and account/profile DTOs did not reveal stored password hashes, bearer links or environment secrets in inspected paths. Health output exposes operational database/collection names, not connection credentials; review its public detail level separately if the threat model requires hiding topology. |
| Logs | Brevo uses bounded status/code diagnostics and checkout creation logs the error name, not raw responses. Lock messages carry operation IDs rather than credentials. Intended local mail displays full links; DEF-048 covers its hosted-mode mismatch, and DEF-049 covers raw exception sinks. No real production log or secret was accessed. |
| Response completion on Vercel | Required payment insertion/enrollment, webhook processing, mail/token activation, feedback issue creation/link persistence, content/assets and review writes are awaited before the response. `server.ts:209`–`231` defers the actual `response.send` until course-lock coordination completes; existing lock-response tests cover ordering. Read-only downloads end responses without queued durable writes. No required durable side effect scheduled after a successful response was found. Hosted suspension and provider delays were not simulated. |
| Backup / maintenance helpers | Source review of backup/restore found streamed exports, path/manifest checks, fresh-target checks, batched acknowledged restore and count/index verification. No shared backup/restore command was run. Other store write concerns require checking the deployed write-concern policy rather than assuming data loss from omitted per-call options. |

## Existing limitations and follow-up boundaries

- **INV-003:** X2's two-instance Mongo-fake tests support normalized-email uniqueness and add-only enrollment. Real deployed index existence, historical duplicate cleanup, replica failover and durability remain unverified. Do not close the hosted investigation from this audit alone.
- **INV-004:** feedback issue creation precedes durable link storage (`api/src/server.ts:1525`); the pending map is process-local. Cross-instance/restart retry risk is already tracked there. No GitHub issue was created and no duplicate DEF was added.
- Parallel first purchases creating multiple Stripe customers are already documented in `docs/specs/payments/payments.md:69`. Receipts by Stripe email and a saved-card portal without invoice history are intentional current behavior, not new defects.
- Real provider account settings, receipt email, Stripe charge constraints for the merchant, MongoDB `explain`/indexes/write concern, Mux media playback, large-data latency and frontend rendering remain outside the exercised evidence. Fixes and permanent regressions for DEF-047 through DEF-052 require a subsequent authorized implementation task.
