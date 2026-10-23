# US-O001 (release 1): Organizations without the owner overview

## Record

- Story: US-O001, release 1 part ([backlog](../user_stories.md), decisions in
  [US-O001-organizations.md](US-O001-organizations.md))
- State: Ready, approved by Alex 2026-10-23 (deck "Organizations: Release 1 Pitch")
- Owner: Codex (`api/src/**`), Claude Code (`app/**`, docs)
- Related: X5 API draft [handoffs/US-O001-api-draft.md](../handoffs/US-O001-api-draft.md) (input
  only; release 1 deliberately leaves out its job queue, transactions, audit log and paging)
- Product decisions (Alex, 2026-10-23): organizations in release 1 except the owner overview;
  owners invite; billed careers, add-on requests and prices in release 1, shown but never charged;
  a billed career and approved add-ons open those courses free; a billed career opens every
  published course linked from any of its milestones, optional ones included; request form asks for
  display name, company name, CVR, billing contact email and a message; the last owner cannot leave
  until another owner exists; only the original owner promotes members.
- Defaults confirmed by Alex 2026-10-23: invitations expire after 14 days; site admins can suspend and
  reactivate an organization. Changed by Alex 2026-10-24: after leaving (or removal, or suspension)
  organization courses disappear from My Learning; the member's progress stays stored and comes
  back if they rejoin with access to the course or buy it.

## Problem and outcome

As a company that trains QA staff, I want my own organization in QI Academy, so that I can bring
my people in, give each of them a career to train for and approve extra courses.

Today every account stands alone and pays per course. After release 1 an approved organization
owner invites colleagues, assigns each a billed career and approves add-on courses; members learn
those courses without paying. Prices are shown so owners see what billing will cost, but nothing is
charged until US-O002. Success: on the live site an owner goes from request to a working team with
careers assigned, and a member enrolls free in a priced course their career includes.

## Scope

Included: request and approval, invitations (new and existing accounts), membership (list, remove,
leave, promote), billed career per member, add-on course requests, organization prices (display
only), course access from the organization, site admin organizations tab, emails.

Excluded: owner progress overview (release 2), billing and charging (US-O002), audit log, job queue
and automatic email retries, paging, organization deletion, transferring the original owner.

Prerequisite: none; the hosting work in US-P018 is independent.

## Behavior contract

```gherkin
Feature: Organizations in release 1

  Scenario: US-O001-AC01 Request an organization
    Given a signed-in user who is not in an organization and has no pending request
    When they submit display name, company name, CVR, billing contact email and an optional message
    Then the request is pending and shown to them as "Pending"
    And every site admin receives a "new organization request" email

  Scenario: US-O001-AC02 Approve a request
    Given a pending request whose requester is still not in an organization
    When a site admin approves it
    Then an active organization exists with the requester as its original owner
    And the requester receives an "approved" email

  Scenario: US-O001-AC03 Decline and resubmit
    Given a pending request
    When a site admin declines it with a reason
    Then the requester sees the reason on the request and receives it by email
    And they can correct the details and resubmit, which makes it pending again

  Scenario: US-O001-AC04 Invite someone without an account
    Given an owner of an active organization
    When they invite an email that has no account
    Then that address receives a link that opens sign-up with the email filled in and the text
      "Joining shares your career and course progress with {Organization}"
    And after sign-up the membership is "pending email" and becomes active when the email is confirmed

  Scenario: US-O001-AC05 Invite an existing account
    Given an invitation to an email that has an account
    When that person signs in with the invited email and accepts the consent text
    Then they are an active member at once and the owners receive a "member joined" email

  Scenario: US-O001-AC06 Refused invitations
    Given an invitation that is expired, cancelled or already used, or a person already in another organization
    When the link is opened or accepted
    Then joining is refused with a plain explanation
    And nothing about the organization's members is shown

  Scenario: US-O001-AC07 Manage members
    Given an owner
    When they remove a member, or the original owner promotes a member to owner
    Then the member list shows the change
    And a removed member loses access to the organization's courses but keeps their own

  Scenario: US-O001-AC08 Leave
    Given a member, or an owner while another owner exists
    When they leave
    Then they are no longer in the organization and keep their account, progress and own courses
    And the last owner is refused with "Make another member an owner first"

  Scenario: US-O001-AC09 Billed career opens courses
    Given an owner assigns a member a published career
    When the member opens a published course linked from that career's milestones, even a priced one
    Then they can enroll without paying and learn it while the membership is active

  Scenario: US-O001-AC10 Add-on course request
    Given a member requests a course outside their billed career
    When an owner approves it
    Then the member can enroll in that course without paying
    And a declined request leaves access unchanged

  Scenario: US-O001-AC11 Prices are shown, not charged
    Given a site admin sets a monthly seat price for a career and an add-on price for a course
    When an owner assigns that career or reviews that add-on request
    Then the monthly price is shown in DKK
    And no payment is requested or recorded

  Scenario: US-O001-AC12 Suspend an organization
    Given an active organization
    When a site admin suspends it
    Then its members lose access through the organization and owners cannot invite
    And reactivating restores both
```

## UI and accessibility

- Profile gets an **Organization** link to `/organization`. Without an organization that page shows
  the request form, or the pending/declined request with its reason and **Correct and resubmit**.
- Member view: organization name, "Your organization gives you: {career}", the courses it opens,
  own add-on requests, **Request a course**, **Leave** (with confirmation).
- Owner view adds **Members** (role, career picker with seat price, Remove, Promote for the
  original owner), **Invitations** (invite form, list with state, Resend, Cancel) and **Course
  requests** (course, member, add-on price, Approve/Decline).
- `/join-organization#token=…`: organization name and consent text, then **Accept** (signed in with
  the invited email), or **Sign up** / **Sign in** buttons; the token is removed from the address once
  read. Signed in with a different email: "This invitation is for {email}. Sign in with that address."
- Course page: an organization-opened course shows **Enroll (included by {Organization})** instead
  of **Buy**.
- Admin page gets an **Organizations** tab (pending requests with Approve / Decline + reason, list of
  organizations with member count and Suspend / Reactivate). Career editor gets "Organization seat
  price per month (DKK)"; catalog settings get "Organization add-on price per month (DKK)".
- Every form has labels, inline errors, disabled submit while saving and focus on the first error.
  A failed email shows "Not sent. Try again." with a resend action where one exists.

## API, storage, and compatibility

Proposed. Every route also answers under `/api`. All routes need a signed-in active account except
`check`; permissions are re-read from storage on each request, never taken from the token.
Errors use `{ message }` with 400 invalid body, 401 signed out, 403 not allowed, 404 unknown or
foreign resource, 409 conflicting state, 410 invalid invitation, 503 store or mail unavailable.
Responses are `Cache-Control: private, no-store`.

### Shapes

```ts
type OrgRequest = { id: string; state: 'pending' | 'declined' | 'approved'; displayName: string;
  companyName: string; cvr: string; billingEmail: string; message: string; declineReason: string | null;
  submittedAt: string; decidedAt: string | null; organizationId: string | null };
type Organization = { id: string; displayName: string; companyName: string; cvr: string;
  billingEmail: string; state: 'active' | 'suspended'; originalOwnerId: string; createdAt: string };
type MyOrganization = { organization: Organization; role: 'member' | 'owner';
  isOriginalOwner: boolean; careerId: string | null; seatPriceDkk: number | null;
  openCourseIds: string[];            // empty while the organization is suspended
  startedCourseIds: string[];         // organization courses this member enrolled in (amended 2026-10-23)
  courseRequests: CourseRequest[] };  // own requests
type Member = { userId: string; name: string; email: string; role: 'member' | 'owner';
  careerId: string | null; joinedAt: string };
type Invitation = { id: string; email: string; state: 'sent' | 'not-sent' | 'accepted' | 'cancelled' | 'expired';
  expiresAt: string; createdAt: string };
type CourseRequest = { id: string; userId: string; userName: string; courseId: string;
  state: 'pending' | 'approved' | 'declined'; addOnPriceDkk: number | null; createdAt: string };
type Prices = { careers: Record<string, number>; courses: Record<string, number> }; // whole DKK per month
```

CVR: 8 digits. Names 1–120 characters, message up to 1,000, decline reason 1–1,000. Prices: whole
DKK 0–999,999 or `null` (not set).

### Routes

| Route | Who | Body / result |
| --- | --- | --- |
| `GET /users/me/organization` | any | `200 MyOrganization` or `200 { organization: null, request: OrgRequest \| null, pendingInvitation: boolean }` |
| `POST /users/me/organization-request` | any not in an organization, no pending request | request fields → `201 OrgRequest`; 409 otherwise |
| `PUT /users/me/organization-request` | requester of a declined request | request fields → `200 OrgRequest` (pending again) |
| `DELETE /users/me/organization` | member; last owner refused (409) | `204` |
| `GET /admin/organization-requests?state=pending` | site admin | `200 OrgRequest[]` with requester name and email |
| `POST /admin/organization-requests/:id/decision` | site admin | `{ action: 'approve' } \| { action: 'decline', reason }` → `200 OrgRequest`; 409 if not pending or requester joined elsewhere |
| `GET /admin/organizations` | site admin | `200 (Organization & { memberCount: number })[]` |
| `POST /admin/organizations/:id/suspend`, `/reactivate` | site admin | `200 Organization` |
| `GET /organization-prices` | any | `200 Prices` |
| `PUT /admin/organization-prices/careers/:pathId`, `/courses/:courseId` | site admin | `{ priceDkk: number \| null }` → `200 Prices` |
| `GET /organizations/:id/members` | owner of `:id` | `200 Member[]` |
| `DELETE /organizations/:id/members/:userId` | owner; not the last owner | `204` |
| `POST /organizations/:id/members/:userId/promote` | original owner | `200 Member` |
| `PUT /organizations/:id/members/:userId/career` | owner | `{ careerId: string \| null }` (published career) → `200 Member` |
| `GET /organizations/:id/invitations` | owner | `200 Invitation[]` (newest first, open and last 30 days) |
| `POST /organizations/:id/invitations` | owner, organization active | `{ email }` → `201 Invitation` (`not-sent` if mail failed); 409 if an open invitation exists for that email |
| `POST /organizations/:id/invitations/:inviteId/resend` | owner | new token, new 14-day expiry → `200 Invitation` |
| `DELETE /organizations/:id/invitations/:inviteId` | owner | `204` |
| `POST /organization-invitations/check` | anyone, rate limited | `{ token }` → `200 { organizationName, email, consentText }` or 410 |
| `POST /organization-invitations/accept` | signed in with the invited email | `{ token, consent: true }` → `200 MyOrganization` (active) or `202 { state: 'pending-email' }`; 409 if in another organization; 410 invalid |
| `GET /organizations/:id/course-requests` | owner | `200 CourseRequest[]` |
| `POST /organizations/:id/course-requests` | member of `:id` | `{ courseId }` (published, not already open to them) → `201 CourseRequest` |
| `POST /organizations/:id/course-requests/:requestId/decision` | owner | `{ action: 'approve' \| 'decline' }` → `200 CourseRequest` |

Changed existing behavior:
- `POST /users/me/courses/:id` (enroll): for a course in the caller's `openCourseIds` it answers
  `200` without payment and records the course in the membership's started-course list, **not** in
  `enrolledCourseIds`. Other courses behave as today.
- `canLearnCourse` and My Learning include organization-started courses while the membership is
  active and the organization is not suspended. **The user object that `GET /auth/me`, sign-in and
  the enroll reply return lists those courses in `enrolledCourseIds`** (computed when answering,
  never stored), so the app's My Learning and course pages need no separate list. Amended
  2026-10-23 (Claude, additive; the stored `enrolledCourseIds` is unchanged).
- `GET /auth/me` adds `organization: { id, role } | null`.
- Email confirmation: confirming the email also activates a `pending-email` membership. Sign-in and
  `GET /auth/me` retry that activation, so a failure there is not lost.

### Storage

New MongoDB collections named `<collection>_organization_requests`, `_organizations`,
`_organization_memberships` (`_id` = user ID, so one organization per person), `_organization_invitations`
(token stored as SHA-256 hash; unique open invitation per organization and email),
`_organization_course_requests` (unique open request per member and course) and
`_organization_prices`. In-memory versions for isolated runs and tests. Invitation tokens are 32
random bytes, base64url, single use, never logged or put in a URL query. Mail goes through the
existing `MailSender` (Brevo hosted, console locally per DEF-048 rules).

Compatibility: no existing route changes its response shape except the added `organization` field
on `/auth/me`; older frontends ignore it. Existing enrollments and payments are untouched.

## Implementation checklist

1. Codex: stores (memory + Mongo), organization service with the rules above, routes, emails,
   access and enroll changes, confirmation hook; tests per scenario on both stores; journey pass.
2. Claude: `OrganizationService` in `app/src/app/services/`, `/organization` and
   `/join-organization` routes and pages, admin tab, course page button, price fields, profile
   link; component tests; browser check on isolated servers.
3. Claude: check Codex's work, fold delivered behavior into a new `docs/specs/organizations/` spec,
   delete this contract, update queue and backlog.

## Verification and delivery

`npm run api:test`, `npm run app:test`, `npm run verify:journeys` (with the organization pass) and
`npm run app:build:pages` pass; browser check of every scenario on the isolated servers; after push,
Alex runs AC01–AC12 on the live site with a second real email address.
