# US-O001 / US-O002 API proposal — DRAFT

**For Claude and Alex to review. Not approved, not an implementation plan, and not the current HTTP contract.** Written 2026-10-20 against `main` at `4ac1958`. This document proposes backend boundaries for release 2 (organizations/free trial) and the later release 3 (billing). No product code, schema migration, Stripe configuration or account data was changed.

The agreed decisions remain in [US-O001-organizations.md](../stories/US-O001-organizations.md). Other inputs: [business rules](../business_rules.md), [architecture](../architecture.md), [payments](../specs/payments/payments.md), [account email](../specs/accounts/passwords-and-email.md), and the current `courseAccess.ts`, `paymentRepository.ts`, `paymentService.ts`, `paymentRoutes.ts`, email-token and career/progress code. “Propose” and “recommend” below identify choices still requiring review. The questions at the end do not reopen the already agreed one-organization or multiple-owner decisions.

## 1. Agreed behavior and release boundaries

| Area | Agreed with Alex | Proposed technical interpretation |
| --- | --- | --- |
| Organization request | Any user can request; site admin approves. A decline needs a reason, sent by email and shown on the request; details can be corrected and resubmitted. | Signed-in active account; versioned request with an append-only decision history. Approval creates the organization and initial owner atomically. |
| Membership | At most one organization per person; owners invite by email. Acceptance consents to sharing career/course progress. | One current membership slot keyed by user ID, independent of global student/teacher/admin role. |
| No-account invite | Opens signup; joining completes once email is confirmed. | Explicit consent and a reservation bind the invite to the new user; confirmation activates membership. Signup alone grants nothing. |
| Owners | Several owners; the original requester can promote members. | Store immutable `originalOwnerUserId`; invitees start as members. Only that original owner can call promotion. |
| Learning and bill | One owner-assigned billed career per member; personal focus does not change charges. A member requests courses outside that career; owner approves their added monthly cost. | Separate billed-career assignment, personal focus and per-member add-on records. Do not write temporary access into permanent enrollments. |
| Owner overview | Billed career, own focus, milestone states, career/add-on completion percentages. No quiz scores, notes or lesson feedback. | Dedicated consent-checked, bounded projection; never return full account/progress documents. |
| Release 2 | Approved organizations run as a free trial. | Local `free_trial` entitlement state, no Stripe subscription/key requirement and no scheduled automatic charge. |
| Release 3 | Monthly career-seat and course-add-on prices set by admins; Stripe Billing, prorations, card or invoice. Invoice terms 14 days; suspension at 14 days past due. | Explicit owner-approved conversion, recurring licensed prices, separate organization customer/subscription and application-owned overdue policy. |
| Ending access | Leaving or subscription cancellation ends organization access; personal purchases and learner data stay. | Revoke the organization source only. Preserve existing `enrolledCourseIds`, personal payment records, notes, achievements and progress. |

### Architecture choice

Recommend separate organization, membership, invitation and access-request documents plus a small application service. This supports user-wide membership uniqueness, independently paged owner views and conditional writes. An alternative is one organization document containing every member/invite/request plus a user-to-organization pointer: fewer reads initially, but two sources to coordinate, growing arrays and unrelated edits contending on one record. The separate-document option fits the existing repository conventions and leaves room for billing reconciliation.

Keep files flat under `api/src/`: proposed organization schemas, repositories, service and routes; separate invitation delivery and, in release 3, an organization billing adapter/service. `createServer` wires them with injected memory/fake implementations. This proposal does not authorize creating those files or refactoring unrelated existing services.

## 2. Data model and indexes

Use the configured collection prefix `P = MONGODB_COURSE_CONTENT_COLLECTION` for new collections. IDs are server-generated opaque IDs; account IDs and course/career IDs continue to reference their current stores. All records have schema/version fields and UTC timestamps; TTL fields are BSON Dates in MongoDB, with ISO timestamps in HTTP DTOs. All money below is integer **øre**, with `currency: dkk`. No new collection holds passwords, raw CVs, quiz answers, notes or provider secrets.

### Release 2 records

| Collection | Document outline | Required indexes / invariants |
| --- | --- | --- |
| `P_organization_requests` | `_id`, requester user ID, proposed name/contact details, state `pending/declined/approved`, `isPending`, revision, submitted/updated/decided times, deciding admin, decline reason, resulting org ID | `_id`; unique requester ID **where `isPending=true`**; list index `(state, updatedAt, _id)`; requester history `(requesterUserId, updatedAt, _id)`. Updating a declined request increments revision and retains old decisions in audit. |
| `P_organizations` | `_id`, unique approved request ID, display name, original owner user ID, lifecycle `active/closed`, trial/billing mode, revision, timestamps | `_id`; unique `requestId`; admin list `(lifecycle, createdAt, _id)`. Do not store an independent owner-ID array that can drift from membership roles. |
| `P_organization_memberships` | `_id = userId`, fresh `membershipId` for this tenure, org ID, state `pending-email/active/left`, role `member/owner`, consent version/time, joined/left time, billed-career assignment, revision; optional expiry for a pending reservation | User `_id` enforces one slot globally. `(orgId, state, _id)` supports roster; `(orgId, state, billedCareer.pathId, _id)` supports seat totals; `(orgId, state, role)` supports owner checks. TTL on `expiresAt` only for pending reservations; activation must unset it. Application expiry checks remain authoritative. |
| `P_organization_invitations` | `_id`, org ID, normalized recipient email, inviter, state `delivery-pending/sent/accepted/revoked/expired`, `isOpen`, token hash, token/delivery version, expiry, send counters, accepted user/tenure, consent version/time | Unique token hash; unique `(orgId, emailKey)` **where `isOpen=true`**; roster `(orgId, state, createdAt, _id)`; expiry `(state, expiresAt)`. Retain accepted/revoked audit metadata; rotate hash on resend. Closing an invite clears `isOpen`. |
| `P_organization_course_requests` | `_id`, org ID, user ID and membership tenure ID, course ID, state `pending/approval-pending/approved/declined/revoked`, owner decision, reason if supplied, revision, quoted price/version and billing-operation ID when applicable | Unique `(membershipId, courseId)` where `isOpen=true` to prevent parallel pending/active requests; `(orgId, state, createdAt, _id)` for owner queue; `(membershipId, state, courseId)` for grants. Re-request updates or supersedes a closed request without deleting history. |
| `P_organization_audit` | `_id`, org/request ID, actor ID, operation, target ID, safe before/after version/decision references, timestamp | `(orgId, occurredAt, _id)` and `(requestId, occurredAt, _id)`; append-only. No raw token, note text, quiz result or provider request object. |
| `P_organization_outbox` | `_id` operation ID, org/request ID, kind (decision mail/invite delivery; later billing change), safe payload references, state, attempts, next attempt, lease/fencing token, result reference | Unique operation/deduplication key; `(state, availableAt, _id)` for due work; `(orgId, state, _id)` for reconciliation. Invitation jobs contain an invitation ID/version, **never a raw invite token**. |

The membership record has a current assignment, not a second career focus. Suggested assignment fields: career ID, assignment ID/version, assigned-by/time, state (`unassigned`, `trial-active`, `billing-pending`, `active`), and release-3 price-version/operation references. During a paid career switch keep current and proposed assignments distinct until the change is reconciled. A pending invite is not a billed seat.

A `left` record can be replaced by a new membership tenure using a conditional write. Never reactivate an old tenure: old invitations, approvals and asynchronous billing results must not apply to a later organization. Pending-email reservations do not appear as active members, grant access or expose progress. Expired reservations can be cleared only with an expected state/tenure/expiry predicate.

### Additional release 3 records

| Collection | Document outline | Required indexes / invariants |
| --- | --- | --- |
| `P_organization_prices` | Immutable price version: kind `career-seat/course-addon`, resource ID, unit amount øre, currency/interval, tax treatment, active flag, Stripe product/price IDs, effective time | Unique `(kind, resourceId, version)`; unique `(kind, resourceId)` where active; unique Stripe price ID when present. `null`/missing price means unavailable or not priced, not zero. Keep personal course `priceDkk` separate. |
| `P_organization_billing` | `_id = orgId`, stable Stripe customer/subscription IDs, collection method, billing contact, desired/applied revision, bounded aggregated subscription-item mapping, provider/application status, synchronization time, effective cancellation time, earliest blocking invoice/deadline | Unique non-null customer and subscription IDs; indexed next reconciliation/deadline. One active organization subscription; store old subscription references in audit/history. Never use the owner's personal customer as the organization customer. |
| `P_organization_invoices` | `_id = Stripe invoice ID`, org/subscription IDs, status, amounts/currency, issued/finalized/due/paid timestamps, grace deadline, last reconciliation, safe hosted-invoice reference | `(orgId, status, dueAt, _id)` and `(orgId, createdAt, _id)`; query all applicable outstanding invoices, not just the latest one. |
| `P_stripe_billing_events` | `_id = event ID`, org/provider-object references, event kind, processing state, attempts/lease, processed time | Unique `_id` deduplicates delivery; `(state, availableAt, _id)` for recovery. A durable billing job uses the shared outbox; do not mark the event processed before its local effects commit. |

Sparse/partial uniqueness must exclude absent provider IDs deliberately, rather than indexing many null values as unique. Indexes are provisioned and verified at deployment, before accepting traffic; they are not initialized opportunistically by the first signup or invoice. Queries use tenant predicates, projections and cursor limits. Exact Mongo index definitions belong in the reviewed implementation design and tests.

### Atomicity and recoverable side effects

Use database transactions/conditional writes with majority acknowledgement for approval (request + org + initial membership + audit + notification job), invitation activation/acceptance and membership changes. Global membership uniqueness is enforced by MongoDB, not an instance-local queue. Extend repository transaction/session support where needed; current independent token/account methods do not already provide these multi-document guarantees.

External mail/Stripe effects cannot be rolled back by a Mongo transaction. Commit an operation intent first, execute/reconcile it with a durable lease, then conditionally apply its result. Recheck org/membership tenure and desired revision before enabling a grant. A member leaving immediately invalidates authorization even if the Stripe quantity decrease is still retrying.

Durable job execution is a release prerequisite, not an existing capability assumed here. Choose a supported worker/scheduler or an explicitly operated retry mechanism during design. Await synchronous work, or return only after a durable job is committed; never start an untracked promise after an HTTP response on Vercel. Uncertain sends remain visible and retryable without claiming that mail was delivered exactly once.

## 3. Organization request and approval flow

1. Any signed-in active user submits bounded form details, including someone currently in an organization. Proposed minimum is organization name plus contact/message; legal/tax fields need agreement. Reject another pending request with 409. Warn existing members that approval needs a free membership slot; the pending request itself grants no organization access.
2. Requester can read their own request and its decline reason. A site admin lists requests and approves or declines a specific revision. Decline requires nonblank reason (proposed maximum 2,000 characters); store it and enqueue its email atomically. Requester sees the saved decision even if mail delivery is delayed.
3. Approval atomically checks that the requester still has a free membership slot, changes request state, creates an active free-trial org and original-owner membership, and records audit/notification. Capture the original owner's progress-sharing consent on the request form. If the requester joined another org meanwhile, return 409; do not partially approve. Require a confirmed email before activating that owner slot (proposed policy, question below).
4. Requester corrects a declined request and resubmits with its revision. Previous reason/decision remains in audit; the new attempt is pending, not auto-approved. Concurrent approval/decline/resubmission of the same revision yields one outcome; stale requests receive 409. Repeated approval returns the already-created org without duplicating membership or mail intent.

No organization request creates a payment customer, personal enrollment, global teacher role or career achievement.

## 4. Invitations, signup and consent

**Reuse the account-email patterns, not the password-reset purpose.** Use cryptographically random single-use base64url tokens, SHA-256 hashes at rest, reserve → mail → activate delivery state, bounded quotas, expiry checks, injected clock/token generator and `MailSender`. Store invitation tokens separately, bound to org, normalized email and delivery version; a reset/confirmation token is never an invite. Use a fragment link such as `/join-organization#token=…`; POST the token in a body, and remove it from the address once handled. No token in logs, query strings, analytics or ordinary DTOs.

Invite mail and the acceptance screen both show exactly: **“Joining shares your career and course progress with {Organization}”**. Proposed expiry is seven days; proposed resend quota is three sends per recipient/org per hour plus an inviter/client budget, all reviewed defaults. Failed/uncertain sends consume quota. Invites are created identically for known and unknown addresses, so the owner cannot discover whether an email has an account.

| Recipient state | Proposed flow |
| --- | --- |
| Existing confirmed active account | Check token without consuming it; sign in as the matching email; explicitly accept the displayed consent. Atomically claim invitation and activate membership. A forwarded invite cannot join a different email/account. |
| No account | Invite opens signup with organization/consent context. Ordinary signup creates the account and normal confirmation mail. After explicit acceptance, bind a pending membership reservation to that authenticated user and invite tenure; no membership/access/progress sharing yet. Normal email confirmation finalizes membership. |
| Existing unconfirmed account | Same pending-email flow; a new confirmation can be requested using the existing mail pattern. Confirmation alone, without a prior invite-consent intent, does not join an organization. |
| Already in another org | Acceptance fails 409 without transferring membership or disclosing the other org to the inviter. The user can leave explicitly, then accept a still-valid invite. |
| Revoked/expired/wrong-purpose/used-by-other account | Generic 410; no organization/member data disclosed. A repeat by the same accepted user may return the existing membership idempotently. |

The token-check endpoint returns only the organization display name, consent version/text and next-step hints; never the roster or “this account exists.” GET/navigation/email prefetch must not accept or consume an invitation. Acceptance requires sign-in, matching fresh email, active account, approved active org, current invitation and explicit consent. Invite bodies cannot choose user ID, org role, billed career or price.

Preserve existing email-confirmation semantics for legacy accounts without a stored flag; do not make them unconfirmed merely because the new invitation flow was introduced. The invite still proves possession of the addressed link and must match the signed-in account's current email.

For pending-email acceptance, claim/reserve the user's unique slot with a bounded expiry. Email confirmation must atomically confirm the account and activate a still-valid, consented reservation, or record a durable finalization intent that the confirmation response/retry can safely complete. Prefer the transaction path; the existing confirmation endpoint currently consumes its token, confirms email and returns 204 without such an organization step. Do not consume a confirmation token and silently lose the only join attempt on a later membership-write failure. Expired/revoked reservations leave a successfully confirmed account unaffiliated, with a clear re-invite path.

Outbox invitation delivery rechecks organization/owner authority and job version, generates the raw token in worker memory, reserves its hash/version, sends, then activates and commits delivery state. On a crash with uncertain delivery, retry through a fresh quota-counted generation; pending hashes cannot grant membership. Do not persist a plaintext token inside an outbox message merely to enable later email sending. Hosted mail must follow the trusted hosted-service policy (the existing DEF-048 discrepancy must not be copied).

## 5. Proposed HTTP and permission matrix

Every path also works with `/api`. All signed-in checks re-read active account, membership/tenure and organization state; organization IDs/roles in JWTs or bodies are not authority. “Owner” below means an active, consented owner of **that org**, regardless of global learner role. “Admin” means site admin; where there is no bypass it must also hold the ordinary org role. Unauthenticated protected requests return 401, known forbidden operations 403, invisible foreign resources 404, stale/conflicting state 409, and invalid/expired invite 410.

Organization ownership grants neither course authorship nor a global teacher/admin role. A co-owner's authority ends when their current owner membership ends; the immutable original-owner ID is not a substitute for an active owner membership.

| Proposed route / purpose | Member / requester | Org owner | Site admin | Release |
| --- | --- | --- | --- | --- |
| `POST /organization-requests` | Any active user; one pending request | Same rule | Same rule when requesting personally | 2 |
| `GET /users/me/organization-requests` | Own attempts/reasons only | Own only | Own only; admin queue separate | 2 |
| `PUT /organization-requests/:id` (correct/resubmit) | Requester of a declined attempt only | No bypass | No editing another requester's submission | 2 |
| `GET /admin/organization-requests` | Denied | Denied unless site admin | List/filter/cursor | 2 |
| `POST /admin/organization-requests/:id/decision` | Denied | Denied unless site admin | Approve/decline current revision; decline reason required | 2 |
| `GET /users/me/organization` | Own org/role/assignment/consent and billing access state | Same plus owner capabilities | Same for their own membership | 2 |
| `GET /users/me/course-access` | Own available course IDs/access sources; no financial/provider IDs | Own access only | Own access only; existing author access still applies | 2 |
| `GET /organizations/:id` | Minimal joined-org identity | Identity and management state | Admin metadata route below; no automatic roster access here | 2 |
| `GET /organizations/:id/members` and `GET …/overview` | No other-member data | Bounded consented roster/overview projection | No progress bypass; must also be an org owner | 2 |
| `POST /organizations/:id/invitations` | Denied | Invite normalized email, always as member | No ordinary invite bypass | 2 |
| `GET /organizations/:id/invitations` | Denied | Bounded invite/delivery states, no token | No ordinary bypass | 2 |
| `POST …/invitations/:inviteId/resend` / `DELETE …/invitations/:inviteId` | Denied | Resend/revoke current open invitation | No ordinary bypass | 2 |
| `POST /organization-invitations/check` | Public, token-scoped, rate limited | Same | Same; no extra disclosure | 2 |
| `POST /organization-invitations/accept` | Matching signed-in invitee plus explicit consent | Same if accepting personally | No accept-as-another-user power | 2 |
| `POST /organizations/:id/members/:userId/promote` | Denied | **Original owner only**, target current active member | No bypass of original-owner rule | 2 |
| `PUT /organizations/:id/members/:userId/billed-career` | Denied | Assign one published career; paid change needs current quote | No ordinary commercial-change bypass | 2 / 3 |
| `DELETE /organizations/:id/members/:userId` | Denied | Remove an ordinary member; owner-removal rules need decision | No implicit removal power | 2 |
| `DELETE /users/me/organization` | Leave own membership; never delete account data | Last/original-owner safeguards pending decision | Same if personally a member | 2 |
| `POST /organizations/:id/course-requests` | Request for self/current tenure | May request for self; no forged member ID | Same if member | 2 |
| `GET /organizations/:id/course-requests` | Own requests only | Org-wide bounded queue | No bypass | 2 |
| `POST …/course-requests/:requestId/decision` | Denied | Approve/decline, matching quote/revision in release 3 | No bypass | 2 / 3 |
| `DELETE …/course-requests/:requestId` | Withdraw own pending request | Revoke an approved add-on; paid change reconciles | No bypass | 2 / 3 |
| `GET /admin/organizations` / `GET …/:id` | Denied | Denied unless site admin | Approval/contact/lifecycle/billing-summary metadata, no individual progress | 2 |
| `PUT /admin/organization-prices/:kind/:resourceId` | Denied | Denied unless site admin | Versioned career-seat/course-add-on pricing | 3 |
| `POST /organizations/:id/billing/preview` | Denied | Server-priced quote for a specific change | No ordinary bypass | 3 |
| `POST …/billing/start`, `POST …/billing/checkout/confirm` | Denied | Choose collection method/confirm owned startup session | No accept-as-owner bypass | 3 |
| `GET …/billing`, `POST …/billing/portal` | Denied | Summary/invoices and org-scoped provider portal | Admin sees safe summary only on admin route | 3 |
| `POST …/billing/cancel` | Denied | Explicit current-version cancellation | Admin suspension/override is an open policy question | 3 |
| `POST /webhooks/stripe-billing` | Public, **signed raw body required** | Same | Same | 3 |

Use `X-Expected-Version` or an explicit expected revision for org mutations, and durable request idempotency for financial changes. This header would need to be allowed in CORS. Proposed create responses are 201; queued operations return 202 with operation/delivery state, not a false “sent/paid” claim; ordinary reads/decisions return 200; removal may return 204. Existing auth and personal-payment endpoints retain their current shapes. New list routes default to 50 rows, hard cap 100, with stable cursors and appropriate filter/sort indexes.

All owner/progress, invite, request and billing replies are `private, no-store`, varying on Authorization. Foreign `orgId`, invitation, request, user or provider IDs never select another tenant's data. A site admin approving organizations gains no new right to members' notes or quiz scores.

## 6. Billed career and add-on lifecycle

An accepted member can be `unassigned`; the owner chooses exactly one billed career before a seat grants access. This proposed transient state avoids guessing a career during invitation acceptance. Owners may have a membership without a billed seat until assigned one; whether an owner must buy a seat is an open commercial detail. Assigning/switching the billed career never calls the personal focus/follow endpoints or creates achievements.

Proposed seat scope is the deduplicated Academy course IDs directly referenced by the **published** billed career: `steps[].courses[].courseId`, and v2 `steps[].actions[]` with `kind=course`. Empty preview IDs, external exams/activities, draft careers and private courses grant nothing. Cross-career prerequisite links do not silently buy every course in other careers. Confirm this scope and archived/curriculum-change treatment before implementation.

An outside-course request is scoped to the requester and current membership tenure. The service rejects a nonexistent/nonpublished course, another person's request, an already-pending/approved add-on, or a course already available through that member's seat/personal enrollment. Approval adds **that member/course pair only**, not a new career or organization-wide catalog right. Decline leaves access unchanged. Repeated approval cannot add another monthly quantity.

In release 2, return `billingMode=free_trial`, `addedMonthlyAmountOre=0` and `postTrialMonthlyAmountOre=null` when future pricing is not defined; explain that the amount is zero **during the trial**. Do not present an unknown future price as zero. Release 3 requires a fresh priced preview and explicit owner acceptance before converting trial seats/add-ons to a paid subscription; an old zero-cost approval is not consent to an unspecified charge.

For release 3 previews, include quote ID/expiry, org/member/request revisions, price versions, recurring delta, resulting recurring total, proration estimate and effective timestamp. Approval sends references and a quote ID, not a caller-chosen amount. A changed career, membership, price or quote expiry requires re-quote (409). Keep an old billed-career grant until a replacement's paid/invoice-terms policy permits activation. Leaving/revocation immediately ends the old org grant even if financial reconciliation takes longer.

Recommended overlap rule: personal ownership suppresses an add-on, and a course moving into the billed career stops duplicate add-on billing after an owner-visible reconciliation. If it later leaves the career, do not silently restart a paid add-on; require a new approval. Exact effective-time/credit rules remain review decisions. Career seat price itself is not a sum of course prices, so owning one course does not automatically discount a career seat.

## 7. Course access and US-L024 compatibility

Today `canLearnCourse` is synchronous: author/admin access, or a published/archived course in `user.enrolledCourseIds`. US-L024 records one paid Checkout session and adds permanent enrollment. The current `payments` collection is session-keyed and its adapter accepts `mode=payment`, DKK and user/course metadata. That ledger and all its HTTP contracts remain personal-purchase behavior.

**Invariant:** never add org seats or add-ons to `enrolledCourseIds`. Leaving, trial ending or nonpayment must be able to revoke the temporary source without deleting a personal purchase, free enrollment or grandfathered enrollment. Preserve every existing enrollment as permanent; no destructive migration or reclassification of historical users is needed.

The story places the entitlement change in US-O002, but release-2 trial seats already have to open courses. Proposed staging, requiring review:

1. **Release 2:** introduce a course-access service that first uses the existing personal/author predicate, then checks fresh approved-org membership plus trial seat/add-on eligibility. Keep the existing pure helper intact if desired, but migrate **all** content, file, quiz, notes/feedback, progress and learner-count gates to the service. Library/course buttons consume an additive own-access response rather than pretending org courses are permanently enrolled.
2. **Release 3:** let `canLearnCourse` accept a server-created entitlement snapshot, keeping its existing two-argument behavior for callers without one. The access service supplies an allowed source: personal purchase/legacy enrollment, organization seat or approved add-on, including organization payment/overdue eligibility. The helper remains pure; do not start database/Stripe calls inside it or trust a client-supplied snapshot.
3. Personal/author authorization wins before consulting org storage. A slow/failed org store must not block a known personal entitlement. An unresolved org-only entitlement returns safe 503 rather than silently granting access or misreporting that the learner must buy again. No provider request is needed on each lesson read: use locally reconciled billing state, fresh membership and a clock-based deadline.
4. Update `canSeeCourse`/archived visibility consistently where org archived access is agreed. Preserve the current author bypass and permanent enrolled learner access to archived courses. Proposed initial org grants cover published courses; whether earlier org grants retain archived courses must be decided, not inferred from personal ownership.
5. Existing free enrollment and personal checkout remain available as independent permanent-access choices. Do not report an organization-only user as permanently enrolled or take a personal payment automatically to repair billing. New UI wording must distinguish temporary org access, independent purchase and an unavailable service.

Release 2 cannot honestly claim trial learning access while leaving the current enrollment-only guards unchanged. The staged wrapper above is a recommendation, not a claim that an implementation already exists. The implementation inventory must include attachment downloads, both quiz attempt routes, progress-list filtering and the member library, not only the main content GET.

## 8. Owner overview response and privacy boundary

Proposed `GET /organizations/:id/overview?limit=50&cursor=…` response below is illustrative. `careerCompletionPercent` is the percentage of required career milestones achieved (or required v1 steps complete), not averaged lesson percentages or quiz scores; an empty denominator is zero. Reuse the existing milestone evaluation rules, including declaration/real-course-completion semantics and prerequisite readiness. Do not infer evidence from role, job title or an owner's assignment.

```json
{
  "organization": { "id": "org_example", "name": "Example QA", "billingMode": "free_trial" },
  "asOf": "2026-10-20T12:00:00.000Z",
  "members": [{
    "membershipId": "membership_example",
    "user": { "id": "user_example", "displayName": "Learner A" },
    "role": "member",
    "billedCareer": { "id": "technical-tester", "title": "Technical Tester", "revision": 3 },
    "focusCareer": { "id": "test-manager", "title": "Test Manager", "revision": 2 },
    "careers": [{
      "id": "technical-tester",
      "revision": 3,
      "careerCompletionPercent": 25,
      "milestoneCounts": { "achieved": 1, "ready": 1, "locked": 2 },
      "milestones": [
        { "id": "foundation", "state": "achieved" },
        { "id": "automation", "state": "ready" },
        { "id": "advanced", "state": "locked" },
        { "id": "leadership", "state": "locked" }
      ]
    }, {
      "id": "test-manager",
      "revision": 2,
      "careerCompletionPercent": 0,
      "milestoneCounts": { "achieved": 0, "ready": 1, "locked": 1 },
      "milestones": [
        { "id": "management-foundation", "state": "ready" },
        { "id": "management-practice", "state": "locked" }
      ]
    }],
    "addOnCourses": [{ "id": "course_example", "title": "Example course", "completionPercent": 40 }],
    "organizationAccess": { "state": "trial", "suspendsAt": null }
  }],
  "nextCursor": null
}
```

The projection includes the distinct billed and focus careers in `careers`; when they match, include one entry; null/unassigned careers are explicit. Add-on percentage uses current published lesson IDs, excludes removed/duplicate IDs and is zero for an empty course. Only the coarse percentage leaves the service, never lesson IDs, answers, pass proofs or attempt counts.

Read only active, currently consented members of the requested organization. Show no pending invitee's progress. Owners cannot query arbitrary user IDs, all followed careers, raw achievements/CV provenance, private profiles, notes, lesson feedback, quiz scores or answers. Do not embed raw `AccountCareersService`/learning-progress responses in this DTO; use internal evaluation with an explicit allowlist and bounded batched reads. Existing public `/users/me` routes remain self-only.

On leaving/removal, the person disappears from the overview immediately under fresh membership checks. Progress/evidence stays with their account and may become visible to a later organization only under a new consent. Retained audit can say who joined/left or what was billed, not retain an exported historical progress snapshot by default. Whether consent shares pre-joining progress is an explicit question below.

## 9. US-O002 Stripe Billing mapping

### Products, quantities and money

Recommend one organization Customer and one monthly DKK Subscription. Group members by immutable career-seat price version; each distinct price is one licensed subscription item with quantity equal to active assigned seats. Do the same for course add-ons, with quantity equal to approved member/course grants. Member identity remains local; Stripe sees aggregated prices/quantities and org/operation references, not notes or learning data. Stripe supports multiple prices and quantities on one subscription/invoice. [Stripe quantities](https://docs.stripe.com/billing/subscriptions/quantities).

Illustrative prices only: two seats at 20,000 øre, one seat at 30,000 øre and two course add-ons at 5,000 øre yield **80,000 øre = 800 DKK/month**, before any agreed tax treatment. A personal one-time course price (for example 499 DKK in US-L024) is unrelated to its organization monthly add-on price. Require safe integer øre and explicit currency; never calculate a bill from localized strings or floating-point DKK.

Use immutable recurring Price versions when admins change rates; persist the Stripe price ID and local version with each assignment. Creating a new price does not silently amend existing members' agreed rates; the effective-date/migration policy needs approval. The installed `stripe@23.0.0` types (`node_modules/stripe/esm/resources/Subscriptions.d.ts`) specify **up to 20 subscription items**, so group quantities and count distinct active price versions, not people. Validate before commitment; if an org needs more, show a clear unsupported quote and design a reviewed alternative rather than silently splitting invoices/subscriptions. [Subscription creation](https://docs.stripe.com/api/subscriptions/create), [price management](https://docs.stripe.com/products-prices/manage-prices).

Zero-priced assigned seats/grants can be represented locally without manufacturing charges; null/unpriced paid offerings cannot be sold. Pending invites and unassigned members do not increase quantities. Whether owners require seats and how existing rates migrate are open decisions, not hidden billing defaults.

### Collection and changes

Card maps to `collection_method=charge_automatically`, with owner-controlled hosted setup/authentication; do not grant new paid card access from a browser success URL alone. Invoice maps to `send_invoice` with `days_until_due=14`, appropriate billing contact and enabled Stripe invoice reminders. It provides invoice-term access before settlement, subject to the agreed grace rule. Changing collection method affects subsequent invoices; outstanding invoices retain their own terms. Keep an organization-scoped portal separate from `/users/me/billing-portal`. [Collection methods](https://docs.stripe.com/billing/collection-method).

Use a dedicated organization billing adapter and fake. Do not widen personal `PaymentService.readCheckout` to treat subscription sessions as paid course purchases. Organization startup may create subscription Checkout for card or a server-created invoice subscription; confirmation verifies local operation, org/customer/subscription ownership and provider state. Invoice startup and card activation have different states, not an assumed common `paid=true`. Check pinned `2026-09-30.endive` request and webhook shapes during implementation, including item-level period timestamps.

For a seat/add-on change, preview the proposed item vector and show recurring delta separately from proration. Bind a quote to current local versions and a proration timestamp, and apply the accepted update with that same timestamp where supported. A preview is not an invoice or an authorization result. [Invoice preview](https://docs.stripe.com/api/invoices/create_preview).

Recommend prorated immediate quantity/price changes with `create_prorations`, settling generated adjustments on the next invoice; immediate invoicing is a separate business decision. Adding/removing items or changing quantity/price can generate adjustments. Unpaid-period credits need an explicit policy: Stripe can credit unused time even when the previous invoice was not paid. Suspend new commercial increases while overdue; membership departure still revokes access immediately and records the required decrease for reconciliation. [Proration rules](https://docs.stripe.com/billing/subscriptions/prorations).

Proposed billing command flow: authorize owner → validate quote/revisions → commit desired change/outbox operation → serialize/reconcile by org using a durable fenced lease → call provider with the stored operation's idempotency key → commit applied item vector and effective grants conditionally. If the provider accepts a change but local commit fails, retry/retrieve that same operation before adding another charge. An uncertain result is 202/reconciling or a safe failure, not an approved grant pretending success. Never hold a database transaction open across a network request.

A database fencing token cannot cancel an in-flight Stripe request from an expired worker. Keep uncertain operations unresolved and prevent successor commercial commands until their outcome is reconciled; compare the provider's item vector to the latest desired revision before activating a new grant. Recovery must cover this case explicitly, not assume that a process-local queue or lease expiry provides provider-side ordering.

Use stable random operation IDs, not emails, for provider idempotency. Stripe v1 retains keys for a limited period and can replay a saved error result; retain the local operation/result longer and reconcile provider state before retrying an aged or uncertain command. Unique provider IDs and local desired/applied revisions prevent a second org subscription/customer after a restart. [Idempotent requests](https://docs.stripe.com/api/idempotent_requests).

### Overdue access: 14-day terms plus 14-day grace

**Do not suspend 14 days after invoice creation for invoice customers.** Store the invoice's actual `dueAt`; suspension begins when an applicable unpaid invoice reaches `dueAt + 14 days` (UTC comparison). Example: finalized 1 October, due 15 October, suspended from 29 October if still unpaid. Stripe supplies collection/subscription states, but these do not by themselves implement this organization's agreed policy. [Subscription status behavior](https://docs.stripe.com/billing/subscriptions/overview).

Proposed local states and authorization rules:

| State | Org seat/add-on access | Owner information |
| --- | --- | --- |
| Approved release-2 trial | Allowed for assigned/approved scope | Trial; no charge now; future price may be unknown |
| Paid-mode startup incomplete / failed card setup | No new paid grant; trial conversion policy requires agreement | Setup/action required; no success inferred from redirect |
| Active/paid, or invoice issued within terms | Allowed | Current plan, due date and safe invoice links |
| Past due but before the 14-day grace deadline | Existing effective grants remain; proposed block on new paid increases | Warning, outstanding amount, deadline and payment action |
| At/after grace deadline with blocking debt | Organization sources denied | Suspended warning and payment action; management/payment routes still work |
| Debt settled, no other blocking invoices, subscription eligible | Re-enable current active member grants | Restored state; departed members stay departed |
| Effective cancellation, closed org or left/removed member | Denied from that source | Show the relevant cancellation/departure state |

Evaluate the deadline on **each authorization** from stored data/clock, not only from a scheduled task or a future webhook. Reconciliation refreshes invoices and alerts owners; it must not be the sole suspension trigger. Card invoices often have no explicit due date: proposed fallback is finalization/first payment-required time, giving a 14-day failed-renewal grace; Alex must confirm this card policy.

Configure invoice reminders/dunning consistently with this rule: recommend application-level suspension while debt remains collectible, without automatically canceling the subscription because an invoice is overdue. Otherwise paying later could not restore the canceled subscription as promised. An owner's explicit effective cancellation is a separate event; Stripe retry/cancellation defaults must be reviewed before release.

Payment of one invoice restores access only if no other applicable invoice remains beyond grace and the subscription/org/membership is still eligible. `active` alone is insufficient: current Stripe guidance notes that it need not mean every outstanding invoice is paid. A void/uncollectible marker is not proof of payment; any debt-forgiveness override needs explicit audited policy. Do not reactivate a canceled subscription or departed member because an old invoice is later paid. [Subscription webhook/status guidance](https://docs.stripe.com/billing/subscriptions/webhooks).

### Webhook ownership and reconciliation

Propose a separate signed raw-body `/webhooks/stripe-billing` destination/secret alongside the existing one-time webhook. Accept only required organization billing events, verify SDK signatures before parsing trusted fields, and match stored customer/subscription IDs plus local org scope. Handle subscription create/update/delete and invoice finalized/updated/paid/payment-failed/action-required/voided/uncollectible changes as appropriate. Subscription Checkout is never passed to the personal record-and-enroll path.

Stripe can deliver duplicates and out-of-order events. Persist a deduplicated inbox/job before returning 2xx; a worker reloads current provider state under org reconciliation and commits the local projection before marking processed. Never use event timestamp alone as an ordering guarantee or leave work solely in a promise after the response. [Webhook delivery guidance](https://docs.stripe.com/webhooks).

Initial trial-to-paid conversion, provider outages and unknown outcomes must keep desired vs applied assignments distinguishable. An owner can always reach billing status/payment management during suspension; ordinary members cannot access the organization's invoice/customer data. Canceling or replacing a subscription must not alter the existing personal-payment ledger or remove any permanent enrollment.

## 10. Validation and verification needed before implementation is accepted

Add Zod schemas for every new body/param/query, safe 400/409/410 errors, bounded pages and typed storage/provider failures. Use fixed safe 503 responses; do not copy the reset wrapper's outage-misclassification defect (DEF-053), internal-schema caller errors (DEF-054) or raw exception logging (DEF-049). Confirm account/membership consistency across **two** app instances, not just queues in one process.

Proposed acceptance evidence (new scenario IDs should be assigned in the reviewed stories, not invented as approved criteria here):

| Journey | Required isolated evidence |
| --- | --- |
| Request/decision | Any active role requests; admin-only decision; decline reason required and retained/emailed; resubmit corrects details; concurrent decisions create one org; competing membership prevents partial approval. |
| Invitation | Existing/new/unconfirmed account paths; explicit consent; token purpose/expiry/revoke/wrong-email refusal; prefetch has no effect; resend/uncertain delivery quota; confirmation-write failure recovery; two-org acceptance yields one active membership. |
| Owners/privacy | Original-owner-only promotion; no promotion through invite body; other owners manage permitted members; role removal applies next request; outsiders/admin-without-owner cannot fetch individual progress; overview has no notes/answers/scores/feedback or raw evidence. |
| Access | Trial seat and one add-on work across every learning/file/progress gate; own focus has no effect; leave/suspend/cancel removes only organization access; personal/legacy/archived enrollment persists; org-store outage does not block known personal access. |
| Quotes/billing | Per-career grouping/per-member add-on quantities; integer øre; stale quote rejected; no double charge on retry/restart; no reused personal customer; price-version/item limit; ambiguous provider success/local failure reconciles. |
| Deadline/recovery | Fixed-clock checks immediately before/at/after due+14 days, including no webhook at the boundary; multiple outstanding invoices; paid late while canceled/departed; card-policy fixture; management routes stay available during suspension. |
| Operational | Transaction/index setup failure refuses writes safely; durable outbox/inbox recovery; stale lease cannot apply a departed tenure; duplicate/out-of-order fixture events; no required post-response work or secret logs. |

Use memory stores, shared Mongo-behaving fakes, fake mail and a `FakeOrganizationBillingService`. A later separately authorized integration pass must verify Atlas transaction/index support, deployed job execution, Stripe test-mode customer/subscription/invoice/proration behavior, reminder settings and real mail/consent screens. Existing API tests/build verify only that writing this draft did not change current code; they do not prove these proposed features.

## 11. Open questions for Alex / design review

1. **Release-2 access staging:** accept the temporary access-service wrapper now, with explicit `canLearnCourse` entitlement composition in release 3? Otherwise trial seats cannot open paid courses without wrongly creating permanent enrollments.
2. **Trial conversion and cost disclosure:** is “0 during trial; future price not set” sufficient until release 3? Confirm explicit owner acceptance/start date and behavior for an org that never converts; no automatic conversion or arbitrary trial expiry is assumed.
3. **Owner lifecycle:** must owners have a billed career/seat? May another owner remove/demote an owner, and who can replace the original owner if they leave or lose their account? Recommend preventing orphan/last-owner departure until an explicit transfer/support rule exists.
4. **Request form and contacts:** required organization/legal details, confirmation requirement before initial-owner activation, which owners receive decline/billing warnings, and whether billing contact can be a nonmember address.
5. **Seat content:** confirm preparation courses plus course-action references, treatment of cross-career prerequisites, archived courses, withdrawn careers and changing published curricula. Decide whether additions/removals apply automatically or through owner acknowledgement, and what happens to an add-on that overlaps the new career.
6. **Privacy metrics:** confirm required-milestone percentage vs another career metric, whether the overview includes pre-joining historical progress, and whether coarse add-on course percentages are the full course-level disclosure. Confirm ordinary site admins have no extra individual-progress read in this feature.
7. **Commercial scope:** confirm add-ons are priced per approved member/course pair; whether personal ownership should prevent add-on purchase, and which price versions apply to existing seats when an admin changes rates. Decide tax-inclusive/exclusive display, VAT/legal invoice fields and any allowed zero prices before billing implementation.
8. **Proration and activation:** approve next-invoice settlement vs immediate proration charges, first-card-payment activation, paid-career-switch timing and credit handling when an invoice is unpaid. A failed bill must not make a member unable to leave.
9. **Overdue/cancellation:** confirm failed-card due-time fallback, any audited debt-forgiveness override, and whether an owner cancellation is immediate or effective at period end. Invoice customers already have the agreed 14-day terms **plus** 14 days past due; do not collapse these periods.
10. **Operating bounds:** agree invite expiry/rate limits, member/page limits, how an org exceeding the 20 distinct price-item ceiling should be sold, and the durable worker/reconciliation mechanism available on the deployed host.

These questions are design inputs for Claude and Alex. This draft does not amend the source story, resolve product questions by itself, authorize provider configuration or start US-O001/US-O002 implementation.

## 12. X5 verification record

Draft self-review checked the requested coverage, agreement/proposal boundaries, JSON overview example and relative document links. Current API regression checks on 2026-10-20: `npm run api:test -- -- --maxWorkers=4` **2,189 passed, 81 files**; `npm run api:build` **passed**. These exercise current code, not the proposed organization API. No shared service/provider account, reminder setting, worker or proposed data migration was exercised.

An earlier run during Claude's uncommitted exercise/video edits had **2,158 passed / 31 failed**, all accompanied by `ReferenceError: canHoldVideo is not defined` in the media paths. X5 changed none of those files. The helper import was present by the later run, which passed. For traceability, the failed tests were:

| File | Failed test names (aliases/parameter cases grouped) | Count |
| --- | --- | --- |
| `courseLockResponse.test.ts` | `POST preserves the Mux upload 201 response after release`; `DELETE preserves the idempotent video removal response after release` (both prefixes) | 4 |
| `courseMove.test.ts` | `retains saved ready playback and accepts remove/reupload using the destination chapter`; `resolves a matching pending callback carrying the old chapter ID` (both prefixes); `does not apply an old-chapter callback to a replacement upload`; `preserves live playback while a working lesson moves and a pending callback resolves in both snapshots` | 5 |
| `courseOwnership.test.ts` | `allows owner/admin to perform all authoring operations through standard routes` and `through /api routes` | 4 |
| `courseReview.test.ts` | `AC07 updates only matching media snapshots and ignores a late superseded callback`; `AC06 invalidates an initial draft decision after media edits`; `AC07 ignores delayed processing events after the live video is ready` (both prefixes) | 6 |
| `muxRoutes.test.ts` | `VO-01 preserves published playback after removal from a working revision`; `VO-01 preserves another working component referencing the same asset`; `VO-01/04 logs failed cleanup, permits repeat removal and reupload, and ignores an old callback`; `VO-02 presents signed-only playback as a recoverable error`; `VO-03 allows retry after provider upload creation fails without changing the draft`; `exercise intro video: upload, kept by a save, webhook ready, delete` | 6 |
| `server.test.ts` | `creates a Mux direct upload for a video component`; `removes a Mux video from a video component`; `updates video components from Mux asset webhooks` | 3 |
| `x4MediaPaymentErrorBranches.test.ts` | `existing video prevents a second provider upload`; `media storage errors at mux-upload keep safe error responses and original content`; `media storage errors at mux-video keep safe error responses and original content` | 3 |
