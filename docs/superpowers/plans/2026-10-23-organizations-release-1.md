# Organizations (release 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organizations in release 1: request and approval, owner invitations, members, billed careers, add-on requests and display-only prices, with organization-opened courses learnable for free.

**Architecture:** One organization domain in the API (`organization.ts` schemas, `organizationRepository.ts` memory + Mongo stores, `organizationService.ts` rules, `organizationRoutes.ts` HTTP), wired in `createServer` like account careers. Access is computed from the membership on each check, never written to `enrolledCourseIds`. The Angular app adds one service and two routed pages plus small additions to admin, course, profile and editor screens.

**Tech Stack:** Express 5, Zod 4, MongoDB driver 7, Vitest 4 (API); Angular 21 signals, Tailwind 4, Vitest (app).

**Spec:** [docs/stories/US-O001-release-1.md](../../stories/US-O001-release-1.md) (approved 2026-10-23). Every task reads it; the route table and shapes there are the contract between tracks.

**Execution:** two parallel tracks with no shared files. Track A is Codex (`api/src/**`), Track B is Claude Code (`app/**`). Claude checks Track A with the check routine in `CLAUDE.md`.

## Global Constraints

- Every route also answers under `/api`; responses `Cache-Control: private, no-store`, `Vary: Authorization`.
- Errors `{ message }`: 400 invalid body, 401 signed out, 403 not allowed, 404 unknown or foreign, 409 conflict, 410 invalid invitation, 503 store or mail unavailable.
- Permissions are re-read from storage per request; never from the session token or the body.
- CVR exactly 8 digits; names 1–120 characters; message ≤ 1,000; decline reason 1–1,000; prices whole DKK 0–999,999 or `null`.
- Invitation token: 32 random bytes base64url, stored as SHA-256 hash, single use, expires 14 days after (re)send, sent only in request bodies, never logged.
- Consent text, exact: `Joining shares your career and course progress with {Organization}`.
- One organization per person; one pending request per person; one open invitation per organization and email; one open course request per member and course.
- Last owner cannot leave or be removed: `Make another member an owner first`. Only the original owner promotes.
- Organization courses never go into `enrolledCourseIds`; leaving, removal or suspension closes them; own purchases stay.
- Mail through the existing `MailSender`; a failed send never fails the stored change (invitation becomes `not-sent`).
- Isolated in-memory stores and fake mail in tests; ports 3001/4200 are Claude's.
- Copy has no em dashes; buttons say what they do.

## Review Focus

1. Invitation opened while signed in as a different account: refused with `This invitation is for {email}. Sign in with that address.` (B3 test, A3 test 403).
2. Owner invites an email that is already a member of their own organization: 409 `Already a member`, no mail (A3 test).
3. Career assigned, then that career withdrawn or a course archived: `openCourseIds` only lists published courses of a published career (A4 test).
4. Member who started an organization course and then buys it: keeps access after leaving because the purchase put it in `enrolledCourseIds` (A5 test).
5. Two owners decide the same course request at once: one 200, the other 409 with the stored decision unchanged (A4 test).

---

## Track A: API (Codex)

### Task A1: Schemas and stores

**Files:**
- Create: `api/src/organization.ts`, `api/src/organizationRepository.ts`
- Test: `api/src/organizationRepository.test.ts`

**Interfaces:**
- Produces in `organization.ts`: Zod `organizationRequestInputSchema` (`displayName`, `companyName`, `cvr`, `billingEmail`, `message`), `declineSchema`, `priceSchema` (`{ priceDkk: number | null }`), `inviteSchema` (`{ email }`), `acceptSchema` (`{ token, consent: true }`); types `OrgRequest`, `Organization`, `Member`, `Invitation`, `CourseRequest`, `Prices`, `MyOrganization` exactly as in the spec's Shapes; `class OrganizationError extends Error { status: number }`.
- Produces in `organizationRepository.ts`: `interface OrganizationRepository` with
  `createRequest`, `findPendingOrLatestRequest(userId)`, `updateRequest(id, expectedState, patch)`, `listRequests(state)`,
  `createOrganization`, `getOrganization(id)`, `listOrganizations()`, `setOrganizationState(id, state)`,
  `insertMembership(m) -> boolean` (false when the user already has one), `getMembership(userId)`, `listMembers(orgId)`, `updateMembership(userId, expectedOrgId, patch)`, `deleteMembership(userId, expectedOrgId)`,
  `createInvitation`, `findInvitationByTokenHash(hash)`, `listInvitations(orgId)`, `updateInvitation(id, expectedState, patch) -> boolean`,
  `createCourseRequest -> boolean`, `listCourseRequests(orgId)`, `decideCourseRequest(id, decision) -> boolean` (only from `pending`),
  `getPrices()`, `setCareerPrice(pathId, dkk|null)`, `setCoursePrice(courseId, dkk|null)`;
  classes `InMemoryOrganizationRepository`, `MongoOrganizationRepository`; `createOrganizationRepository()`.
  Membership record: `{ userId, orgId, role, state: 'pending-email' | 'active', careerId, startedCourseIds: string[], consentAt, joinedAt }`.

- [ ] **Step 1: Write failing tests** `describe.each(['memory','mongodb'])` with the same Mongo test setup as `journey.test.ts`: `insertMembership` twice for one user → second returns false; two open invitations same org+email → second create throws `OrganizationError` 409; `createCourseRequest` twice open → false; `decideCourseRequest` on a decided request → false; a second pending request for one user → 409.
- [ ] **Step 2: Run** `npm --prefix api test -- organizationRepository` → FAIL (module missing).
- [ ] **Step 3: Implement** both stores. Mongo collections `<MONGODB_COURSE_CONTENT_COLLECTION>_organization_requests`, `_organizations`, `_organization_memberships` (`_id` = userId), `_organization_invitations` (unique partial index on `{orgId, email}` where open, unique `tokenHash`), `_organization_course_requests` (unique partial `{userId, courseId}` where open), `_organization_prices`. Conditional updates use the expected state in the filter.
- [ ] **Step 4: Run** the same command → PASS on both stores.
- [ ] **Step 5: Commit** `A1: organization schemas and stores` (bump version per Rules).

### Task A2: Requests, approval, suspension, prices

**Files:**
- Create: `api/src/organizationService.ts`
- Test: `api/src/organizationService.test.ts`

**Interfaces:**
- Consumes: A1 repository; `AuthRepository.findById` and the same user listing `adminUsersRoutes.ts` uses, filtered to active `admin` accounts, for request-received mail; `MailSender`.
- Produces: `class OrganizationService` with `submitRequest(user, input)`, `resubmitRequest(user, input)`, `myOrganization(userId)`, `listRequests()`, `decide(adminId, requestId, decision)`, `listOrganizations()`, `suspend(id)`, `reactivate(id)`, `prices()`, `setCareerPrice`, `setCoursePrice`.

- [ ] **Step 1: Failing tests** for US-O001-AC01, AC02, AC03, AC11, AC12: submit → `pending` and one mail per admin with subject `New organization request: {displayName}`; second submit → 409; approve → organization `active`, requester membership `owner`, original owner; approve when requester joined elsewhere → 409 and request still `pending`; decline without reason → 400; decline → mail to requester containing the reason; resubmit after decline → `pending`; resubmit while pending → 409; mail failure on approve → still approved; suspend/reactivate flips `state`; `setCareerPrice(…, 1000000)` → 400.
- [ ] **Step 2: Run** `npm --prefix api test -- organizationService` → FAIL.
- [ ] **Step 3: Implement** the methods; approval writes organization then `insertMembership`, deleting the organization again if the insert returns false.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `A2: organization requests, approval and prices`.

### Task A3: Invitations and joining

**Files:**
- Modify: `api/src/organizationService.ts`
- Test: `api/src/organizationInvitations.test.ts`

**Interfaces:**
- Produces: `invite(ownerId, orgId, email)`, `resend(ownerId, orgId, inviteId)`, `cancel(ownerId, orgId, inviteId)`, `listInvitations(ownerId, orgId)`, `checkInvitation(token) -> { organizationName, email, consentText }`, `acceptInvitation(user, token) -> MyOrganization | { state: 'pending-email' }`, `activatePendingMembership(userId) -> boolean`. Options `{ now, newToken, appPublicUrl }` like `EmailConfirmationOptions`.

- [ ] **Step 1: Failing tests** for AC04, AC05, AC06 and Review Focus 1–2: invite mail contains `{appPublicUrl}/join-organization#token=` and the exact consent text; invite while suspended → 409; invite an existing member of the same organization → 409 `Already a member`; resend changes the token (old token → 410) and expiry; cancelled, expired (now + 14 days + 1 ms) and used tokens → 410; accept by a different email → 403; accept by a member of another organization → 409; confirmed account accepts → active member and `member joined` mail to owners; unconfirmed account accepts → `pending-email`, then `activatePendingMembership` → active; mail failure → invitation `not-sent`, still 201.
- [ ] **Step 2: Run** `npm --prefix api test -- organizationInvitations` → FAIL.
- [ ] **Step 3: Implement**, reusing `resetTokenHash` for hashing and `newToken` for generation.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `A3: organization invitations and joining`.

### Task A4: Members, careers, add-ons and course access

**Files:**
- Modify: `api/src/organizationService.ts`
- Test: `api/src/organizationMembers.test.ts`

**Interfaces:**
- Consumes: `CareerPathRepository` (published careers and their milestone course IDs), `CourseRepository.listCourses`.
- Produces: `listMembers`, `removeMember`, `promote`, `setCareer`, `leave`, `requestCourse`, `listCourseRequests`, `decideCourseRequest`, and `openCourseIds(userId): Promise<string[]>` (published courses linked from any milestone of the member's published billed career plus approved add-ons; `[]` when not an active member or the organization is suspended); `startCourse(userId, courseId) -> boolean`; `learnableOrgCourseIds(userId)` = `startedCourseIds ∩ openCourseIds`.

- [ ] **Step 1: Failing tests** for AC07–AC10 and Review Focus 3 and 5: remove/leave by the last owner → 409 `Make another member an owner first`; promote by a non-original owner → 403; `setCareer` to an unpublished career → 400; `openCourseIds` includes an optional-milestone course and an approved add-on, excludes an archived course and everything after removal or suspension; concurrent `decideCourseRequest` → one succeeds, other 409; course request for a course already open → 409.
- [ ] **Step 2: Run** `npm --prefix api test -- organizationMembers` → FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `A4: organization members, careers and course access`.

### Task A5: Routes and existing-flow changes

**Files:**
- Create: `api/src/organizationRoutes.ts`
- Modify: `api/src/server.ts` (dependency `organizationRepository?`, service construction, `registerOrganizationRoutes`, enroll route at the `app.post('/users/me/courses/:id'` handler, `/auth/me` adds `organization`, library/progress entitlement), `api/src/courseAccess.ts` (`canLearnCourse(course, user, orgCourseIds = [])`), `api/src/learningProgress.ts`, `api/src/lessonExtrasRoutes.ts` (pass org course IDs), `api/src/emailConfirmationRoutes.ts` (after `confirmEmail` call `activatePendingMembership`), sign-in route (retry activation)
- Test: `api/src/organizationRoutes.test.ts`

**Interfaces:**
- Produces: `registerOrganizationRoutes(app, authenticate, requireAdmin, service)` implementing every route in the spec's route table with the spec's status codes.

- [ ] **Step 1: Failing tests**: the permission matrix (owner, member, other organization's member, site admin, signed out) for every route on both `''` and `/api`; enroll in a priced course that is in `openCourseIds` → 200 and not in `enrolledCourseIds`; after leaving → 403 on its content; Review Focus 4 (bought course survives leaving); `/auth/me` returns `organization: { id, role }`; confirm-email activates a pending membership; `check` is rate limited with the existing `clientLimit`.
- [ ] **Step 2: Run** `npm --prefix api test -- organizationRoutes` → FAIL.
- [ ] **Step 3: Implement** following `accountCareersRoutes.ts` (`handle` wrapper mapping `OrganizationError`).
- [ ] **Step 4: Run** `npm run api:test` and `npm run api:build` → all pass.
- [ ] **Step 5: Commit** `A5: organization routes and course access`.

### Task A6: Journey pass

**Files:**
- Modify: `api/src/journey.test.ts`

- [ ] **Step 1:** Add steps on both stores: student requests → admin approves → owner invites a new email → sign up → confirm → owner sets a career containing a priced course → member enrolls without payment → owner removes member → content 403.
- [ ] **Step 2: Run** `npm run verify:journeys` → PASS.
- [ ] **Step 3: Commit** `A6: organization release journey`, update the Codex row in `docs/work_queue.md`.

---

## Track B: App (Claude Code)

### Task B1: Organization service

**Files:**
- Create: `app/src/app/services/organization.service.ts`, `app/src/app/services/organization.service.spec.ts`

**Interfaces:**
- Produces: `OrganizationService` (pattern of `AdminUsersService`, result `{ ok: true; body } | { ok: false; message; status }`) with one method per spec route; types re-declared from the spec's Shapes in the same file.

- [ ] **Step 1: Failing spec**: each method calls the spec path and verb (fake `ApiClientService`), `accept` sends the token in the body only, a 409 surfaces its `message`.
- [ ] **Step 2: Run** `(cd app && npx ng test --watch=false --include src/app/services/organization.service.spec.ts)` → FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(US-O001): organization service`.

### Task B2: `/organization` page

**Files:**
- Create: `app/src/app/pages/organization-page/organization-page.{ts,html,scss,spec.ts}`, `app/src/app/routes/organization-route.{ts,html}`
- Modify: `app/src/app/app.routes.ts` (route `organization`), `app/src/app/ui/profile-menu/` (link **Organization**)

- [ ] **Step 1: Failing specs** (clear storage in `beforeEach`): no organization → request form with labels and CVR error `Enter the 8-digit CVR number`; pending and declined (reason + **Correct and resubmit**) states; member view lists career and courses and **Leave** asks to confirm; owner view shows Members, Invitations (Resend, Cancel, `Not sent. Try again.`), Course requests with prices; last-owner leave shows `Make another member an owner first`.
- [ ] **Step 2: Run** the page spec → FAIL. **Step 3: Implement** with existing `ui/` components (button, tabs, chip, confirm-dialog). **Step 4: Run** → PASS. **Step 5: Commit** `feat(US-O001): organization page`.

### Task B3: `/join-organization` page

**Files:**
- Create: `app/src/app/pages/join-organization-page/…`, `app/src/app/routes/join-organization-route.ts`
- Modify: `app/src/app/app.routes.ts`, sign-up flow to pass the invited email and resume acceptance after sign-up

- [ ] **Step 1: Failing specs**: token read from the fragment then removed from the address; shows organization name and exact consent text; signed in with the invited email → **Accept**; different email → `This invitation is for {email}. Sign in with that address.`; signed out → **Sign up** prefilled / **Sign in**; 410 → `This invitation is no longer valid. Ask the owner for a new one.`; `pending-email` → `Confirm your email to finish joining.`
- [ ] **Step 2–5:** run → FAIL, implement, run → PASS, commit `feat(US-O001): join organization page`.

### Task B4: Admin tab and price fields

**Files:**
- Modify: `app/src/app/pages/admin-page/` (`AdminSection` gains `'organizations'`), `app/src/app/ui/career-path-editor/` (seat price field), `app/src/app/pages/course-view-page/` (add-on price in catalog settings)

- [ ] **Step 1: Failing specs**: Organizations tab lists pending requests with Approve and Decline (reason required) and organizations with member count and Suspend / Reactivate; seat price field saves `null` when empty and rejects `1000000`.
- [ ] **Step 2–5:** run → FAIL, implement, run → PASS, commit `feat(US-O001): admin organizations and prices`.

### Task B5: Course page and My Learning

**Files:**
- Modify: `app/src/app/pages/course-view-page/` (button), `app/src/app/services/app-state.service.ts` (organization from `/auth/me` and `/users/me/organization`), `app/src/app/pages/library-page/`

- [ ] **Step 1: Failing specs**: a priced course in `openCourseIds` shows **Enroll (included by {Organization})** and never **Buy**; after enrolling it appears in My Learning; a course not open still shows **Buy for N DKK**.
- [ ] **Step 2–5:** run → FAIL, implement, run → PASS, commit `feat(US-O001): organization courses on course page and My Learning`.

### Task B6: Integration and browser check

- [ ] **Step 1:** After Track A lands, run `npm run api:test`, `npm run app:test`, `npm run verify:journeys`, `npm run app:build:pages` → all pass.
- [ ] **Step 2:** Browser check AC01–AC12 on isolated servers (3001/4200) with demo accounts; screenshots of the owner view and join page.
- [ ] **Step 3:** Fold behavior into `docs/specs/organizations/organizations.md`, delete the contract, update backlog and queue; commit.
