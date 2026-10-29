# Organizations

## Purpose

A company brings its QA staff into QI Academy: an approved owner invites colleagues, gives each a
billed career and approves extra courses, and members learn those courses without paying. Prices
are shown so owners see what billing will cost; nothing is charged yet (US-O002). Release 1 of
US-O001; the owner progress overview comes in release 2 ([decisions](../../stories/US-O001-organizations.md)).

## Behavior

- **Request** (`/organization`, linked from the profile): a signed-in user who is not in an
  organization and has no pending request sends display name, company name, CVR, billing contact
  email and an optional message. The request shows as Pending and every site admin gets an email.
  Owning an organization is not a role: the requester keeps theirs.
- **Decision** (Admin → **Organizations**): approve makes an active organization with the requester
  as original owner and emails them; decline needs a reason, which the requester sees and receives
  by email, and **Correct and resubmit** makes the request pending again.
- **Invite** (owner view → **Invitations**): an invitation goes to an email and expires after 14 days;
  owners resend (new link, new expiry) or cancel it. The mail links to
  `/join-organization#token=…`, which shows the organization name and "Joining shares your career and
  course progress with {Organization}"; the token is removed from the address once read.
  - An address without an account gets **Sign up** with the email filled in; the membership is
    "pending email" until the email is confirmed (sign-in and `/auth/me` retry that activation).
  - An existing account signed in with the invited email clicks **Accept and join** and is an
    active member at once; owners get a "member joined" email. Signed in with another email:
    "This invitation is for {email}. Sign in with that address."
  - A second link opened in the same tab replaces the first one.
  - An expired, cancelled or used link, or a person already in another organization, is refused
    with a plain explanation and nothing about the members.
- **Members** (owner view): name, email, role and a career picker showing the seat price. An owner
  removes a member (after a confirmation); the original owner promotes a member to owner. A member,
  or an owner while another owner exists, leaves; the last owner gets "Make another member an owner
  first". Removed or leaving people keep their account, progress and own courses.
- **Billed career**: an owner assigns a member a published career. Every published course linked
  from any of its milestones, optional ones included, opens to that member.
- **Add-on courses**: a member asks for another published course (**Request another course**); an
  owner approves (the course opens) or declines (nothing changes). Owners see the add-on price.
- **Course access**: on the course page an opened course shows **Enroll (included by
  {Organization})** instead of **Buy**; enrolling is free and records the course in the membership.
  While the membership is active and the organization is not suspended, those courses appear in
  My Learning and open on the learning page. After leaving, removal or suspension they disappear
  from My Learning; progress stays stored and returns on rejoining with access or buying the course.
- **Prices**: admins set a monthly seat price per career (career editor) and an add-on price per
  course (catalog settings), whole DKK. They are shown in DKK and never charged or recorded as
  payments.
- **Suspend** (Admin → **Organizations**): members lose access through the organization, owners
  cannot invite, and the organization page says so with the invite and course request forms
  disabled. **Reactivate** restores both.

## Rules

- One organization per person. Permissions are re-read from storage on each request, never taken
  from the token. Only the original owner promotes; the original owner cannot be transferred.
- CVR is 8 digits; names 1–120 characters; message up to 1,000; decline reason 1–1,000; prices
  0–999,999 DKK or not set.
- Invitation tokens are 32 random bytes, single use, stored as a SHA-256 hash, never logged or put in
  a URL query. `check` is rate limited.
- Every route also answers under `/api`, with `Cache-Control: private, no-store`. Errors are
  `{ message }`: 400 invalid body, 401 signed out, 403 not allowed, 404 unknown or foreign resource,
  409 conflicting state (for example "Organization is suspended"), 410 invalid invitation, 503 store
  or mail unavailable. A failed email shows "Not sent. Try again." with a resend where one exists.
- `GET /auth/me`, sign-in and the enroll reply list organization-started courses in
  `enrolledCourseIds` (computed when answering, never stored) and add `organization: { id, role }`.
- US-P019 adds private notices for requests/resubmissions (admins), decisions (requester),
  invitations (existing account only) and active joins (owners, including delayed confirmation).
  Preferences and failures are handled by the [notification service](../platform/notifications.md);
  the original operation still succeeds if notice delivery fails. The bell UI remains pending.

| Route | Who |
| --- | --- |
| `GET /users/me/organization`, `POST`/`PUT /users/me/organization-request`, `DELETE /users/me/organization` | signed-in user |
| `GET /admin/organization-requests`, `POST /admin/organization-requests/:id/decision` | site admin |
| `GET /admin/organizations`, `POST /admin/organizations/:id/suspend`, `/reactivate` | site admin |
| `GET /organization-prices`; `PUT /admin/organization-prices/careers/:pathId`, `/courses/:courseId` | anyone signed in; site admin |
| `GET /organizations/:id/members`, `DELETE …/members/:userId`, `PUT …/members/:userId/career` | owner |
| `POST /organizations/:id/members/:userId/promote` | original owner |
| `GET`/`POST /organizations/:id/invitations`, `POST …/:inviteId/resend`, `DELETE …/:inviteId` | owner (invite only while active) |
| `POST /organization-invitations/check` | anyone |
| `POST /organization-invitations/accept` | signed in with the invited email |
| `GET`/`POST /organizations/:id/course-requests`, `POST …/:requestId/decision` | owner; member requests |

## Code

- API: `api/src/organizationRoutes.ts`, `organizationService.ts`, `organizationRepository.ts`
  (memory and MongoDB: `_organization_requests`, `_organizations`, `_organization_memberships` keyed
  by user, `_organization_invitations`, `_organization_course_requests`, `_organization_prices`),
  `organization.ts`; tests `organization*.test.ts` and the organization pass in `npm run verify:journeys`.
- App: `app/src/app/services/organization.service.ts`, `pages/organization-page/`,
  `pages/join-organization-page/`, `ui/admin-organizations/`, `ui/organization-price-field/`.

## Limits

- Not yet checked on the live site (AC01–AC12 with a second real email address).
- No audit log, job queue or automatic email retries, paging, organization deletion or owner
  transfer.
