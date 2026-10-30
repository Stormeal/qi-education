# User stories

Updated: 2026-10-29. Open work only. Priority order chosen by Alex: **teachers, learners,
platform reliability**, with confirmed defects before enhancements. What the app already does is
in [specs/](specs/README.md); use [work_queue.md](work_queue.md) for the next item and active work.

A story is removed once it is delivered, and a delivered scenario is removed from a story that
stays open. Its behavior is then folded into the matching area spec; the old contract and its
evidence stay in Git history. IDs are never reused, so gaps in the numbering are delivered work.

## Releases

Roadmap agreed by Alex (product owner) on 2026-10-23; the management version is the
[QI Academy Roadmap](https://claude.ai/artifact/M5vCXNJZqTWmxhFcWQLVCJ) page; teachers and admins
see a copy at `/roadmap` in the app (`roadmap-page.ts`), so change both together. Release 1 scope may
grow after Alex's department interviews (week of 26 October: marketing, IT, sales, course
department); new requests enter here as Proposed stories.

| Release | Target | Goal | In scope |
| --- | --- | --- | --- |
| 1, internal | Mid-December 2026 | TestHuset colleagues learn and teachers build courses; no public sales | US-P018 (Must), US-O001 without the owner overview: requests, approval, owner invites, members, billed careers, add-on requests and prices shown but not charged (Must), US-A004-AC04 (Must), live-site checks in [work_queue.md](work_queue.md) (Must), US-A004-AC06 (Should), US-A006 feedback/INV-004 cutover (Should; live since 0.1.482, 2026-10-26), US-A007 course reviewers (Must, added by Alex 2026-10-26; built 2026-10-26, not live) |
| 2, public launch | Around Q2 2027 | Sell to individuals and organizations | US-O001 owner overview, Stripe live mode, external security test, accessibility review, US-P001, dependency majors (Angular 22) |
| 3, organization billing | After launch, 2027 | Paid organization seats | US-O002 |

Release 1 decisions (built as defaults, confirm or change): courses stay free during the internal
period and public prices are set at launch, so colleagues enrolled before then keep free access
(existing rule, no new feature); sign-up stays open and unannounced. Open for management: hosting
budget, curriculum owner, backup developer.

New candidates from Alex's 2026-10-27 brainstorm, filed below as Proposed and awaiting triage into
a release: US-P021 (GDPR data rights), US-P022
(terms page), US-L029 (account achievements), US-T017 (browser video editing), US-A008 (discount
campaigns), US-P023 (Azure storage spike). The suggested release in each story is confirm-or-change;
Alex (product owner) assigns the release. Organization-private courses from the same brainstorm are
already delivered under US-O001. US-P019 and US-P020 were delivered locally on 2026-10-29; hosted checks are in the work queue.

Story IDs reconciled 2026-10-29: browser video editing is US-T017 and account achievements is US-L029; US-T016 already identifies the delivered teacher overview and US-L027 identifies certificates.

## Backlog

| ID | Story | State | Priority | Dependencies | Contract |
| --- | --- | --- | --- | --- | --- |
| US-O001 | Organizations: request, approval, invites, owner overview | Release 1 delivered 2026-10-24 (not live); owner overview in release 2 | P1 | — | [stories/US-O001](stories/US-O001-organizations.md) |
| US-O002 | Organization billing: career seats, course add-ons, card or invoice | Decided, not designed | P2 | US-O001 | [stories/US-O001](stories/US-O001-organizations.md) |
| US-A004 | Curriculum review (changed criteria delivered) | In progress | P2 | Curriculum owner | [stories/US-A004](stories/US-A004-curriculum-review.md) |
| US-P001 | Verify complete role journeys before release | In progress | P2 | Browser test runner decision | Below |
| US-P003 | Safe writes across API instances | In progress | P2 | Distributed coordination decision | Below, INV-003/004 |
| US-P018 | Ready for internal company use (release 1) | Proposed | P1 | Hosting budget (management) | Below |
| US-L027 | Course completion certificate | Proposed | P2 | — | Below |
| US-L028 | Learner course ratings and reviews | Proposed | P2 | — | Below |
| US-P021 | GDPR data rights (export, erasure, cookie consent) | Designed | P2 | — | [Contract](stories/US-P021-gdpr-data-rights.md) |
| US-P022 | Terms of service and purchase-terms page | Designed | P3 | Legal content (Alex) | [Contract](stories/US-P022-terms-of-service.md) |
| US-P023 | Spike: move storage from MongoDB to Azure | Proposed | P3 | Decision + spike | Below |
| US-L029 | Earn account-level achievements | Proposed | P3 | — | Below |
| US-T017 | Record and lightly edit course video in the browser | Proposed | P3 | — | Below |
| US-A008 | Sales and discount campaigns | Proposed | P3 | Payments, careers | Below |

Priorities describe impact; the queue describes delivery order. P1 is a high-impact access or
release concern; P2 affects a core journey; P3 improves convenience.

## Teacher and admin journey

### US-A004 — Curate career milestone graphs and map TestHuset courses

**As an admin, I want to curate job routes using milestones, learning options and explicit
requirements, so learners see a credible route through our courses.**

State: In progress. Milestone curation, requirement routes, graph validation and permissions are
delivered (see [career curation](specs/career-paths/curation.md)). Changed criteria (AC06) delivered
2026-10-24 (requirement versions and the learner notice, in the same specs). Open: the curriculum
review (AC04, Alex / curriculum owner). Details and the candidate course map:
[stories/US-A004-curriculum-review.md](stories/US-A004-curriculum-review.md).

```gherkin
Feature: Credible career milestone curation
  Scenario: US-A004-AC04 Map real catalogue offerings honestly
    Given the current TestHuset course inventory and the three proposed routes
    When the curriculum mapping is reviewed for publication
    Then every inventoried course is mapped or explicitly deferred with a reason
    And equivalent formats are not confused with different qualifications
    And external courses are distinguished from available Academy courses
    And planned on-demand courses are labelled unavailable until published

  Scenario: US-A004-AC06 Revise content without losing achievements
    Given learners follow a published route and have recorded achievements
    When I publish a material change to milestone criteria
    Then changed criteria use explicit requirement versions and an update explanation
    And historical evidence, goals and enrollments remain stored
```

### US-T017 — Record and lightly edit course video in the browser

**As a teacher, I want to record and lightly edit lesson video in the browser, so that I can
produce lessons without separate software.**

State: Proposed (Alex, 2026-10-27). Suggested release 2+ (heavy; outside the fixed release-1 scope)
— confirm or change. Builds on the existing Mux upload flow ([video](specs/authoring/video.md)).
Scope: record from the webcam into a lesson, record several clips, trim a clip and append another,
then upload through Mux. Deliberately not a full editor. Open decisions: capture scope (webcam only
vs screen); client-side vs server trimming/splicing; browser support and size limits; and saving an
in-progress recording. The heaviest new item. Needs its own `stories/` contract when selected.

### US-A008 — Sales and discount campaigns

**As an admin, I want time-boxed discounts, so that I can promote individual courses and whole
careers.**

State: Proposed (Alex, 2026-10-27). Suggested release 2+ (release 1 is free/internal; public prices
begin at launch) — confirm or change. Builds on payments ([payments](specs/payments/payments.md))
and careers. Scope: a campaign targets one course or every course under a career, with a discount
(percent or fixed) and a start/end window; the catalog and course pages show the sale price while
active, and checkout records the amount actually paid. Open decisions: discount type and whether
course and career campaigns stack or conflict; rounding and currency; automatic vs code-based; and
interaction with organization add-on prices. Needs its own contract.

## Learner journey

### US-L027 — Course completion certificate

**As a learner, I want a certificate when I complete a course, so that I can show my manager or
put it on my CV.**

State: Proposed (added by Alex 2026-10-27). Today nothing happens at 100%. Open decisions: what the
certificate shows (default: learner name, course title, completion date, course length, teachers,
a certificate ID), PDF or printable page (default: printable page with Save as PDF), and whether
a public check link is needed (default: not in the first version).

```gherkin
Feature: Course completion certificate
  Scenario: US-L027-AC01 Completing the last lesson
    Given I am enrolled and complete the last lesson of a course
    When the completion is saved
    Then the learning page says the course is completed and offers my certificate

  Scenario: US-L027-AC02 Finding certificates later
    Given I completed courses earlier, on any device
    When I open My Learning or my profile
    Then each completed course offers its certificate with the date it was completed

  Scenario: US-L027-AC03 Certificates are honest
    Given a course gained a lesson after I completed it
    When I open the certificate
    Then it keeps its original completion date
    And a learner who has not completed the course cannot get one
```

### US-L028 — Learner course ratings and reviews

**As a learner, I want to rate a course and read others' ratings, so that I can choose good
courses; as a teacher, I want to know what learners think.**

State: Proposed (added by Alex 2026-10-27). Today the catalog shows "0.0, 0 ratings" from stored
course fields ([browse spec](specs/catalog/browse.md)), so the stars, "Highest rated" sort,
rating filter and "highly rated" instructors mean nothing. Open decisions: when a learner may rate
(default: after completing at least one lesson), whether comments are shown publicly with the
learner's name (default: first name only), and whether admins can hide a review (default: yes).

```gherkin
Feature: Course ratings
  Scenario: US-L028-AC01 Rate a course
    Given I am enrolled and completed at least one lesson
    When I give the course 1 to 5 stars and an optional comment
    Then my rating is saved, and sending again replaces it

  Scenario: US-L028-AC02 Real averages in the catalog
    Given a published course has learner ratings
    When anyone browses the catalog or opens the course
    Then the average and count come from those ratings
    And the rating filter, "Highest rated" sort and instructor ratings use them

  Scenario: US-L028-AC03 Who may rate
    Given I am not enrolled, or have not started the course
    When I try to rate it
    Then the rating is refused and nothing is stored
```

### US-L029 — Earn account-level achievements

**As a learner, I want achievements for what I do across the whole site, so that progress feels
rewarding beyond any one course or career.**

State: Proposed (Alex, 2026-10-27). Suggested release 2+ (engagement, not a release-1 internal
must) — confirm or change. Distinct from career-milestone achievements, which already exist
([milestones](specs/career-paths/milestones-and-achievements.md)): these are site-wide and
automatic (for example first login, total hours watched, completion streaks), shown on the account.
Open decisions: the starter set and thresholds; computing them server-side from existing
progress/activity (cross-device) as milestones do; where they display and whether they are
shareable; and whether earning one notifies the learner. Needs its own contract.

## Platform reliability

### US-P001 — Verify complete role journeys before release

**As a maintainer, I want repeatable journey verification, so that changes do not pass unit tests
while breaking teaching or learning.**

State: In progress. Delivered: the API-level release journey (`npm run verify:journeys`, also part
of `npm run api:test`). Remaining: a repeatable check of the screens themselves and the live
rehearsal in the [teacher rehearsal checklist](release/teacher-rehearsal-checklist.md). Open
decision: whether to add a browser test runner (new dependency and CI browser install).

```gherkin
Feature: Journey verification
  Scenario: US-P001-AC01 Exercise a release candidate
    Given a clean checkout with isolated test data
    When I run the journey checks
    Then teacher authoring, admin review, learner enrollment, and progress are exercised
    And cross-user and forbidden-role access are checked
    And a failed behavior prevents a successful verification result

  Scenario: US-P001-AC02 Keep verification safe and actionable
    Given a check fails
    When I inspect its result
    Then the failing scenario, tested commit, and useful evidence are recorded
    And no shared user data or real GitHub issue has been created
```

### US-P003 — Safe writes across API instances

**As a maintainer, I want concurrent or retried operations to have one intended outcome, so that
duplicate accounts, lost enrollment, or duplicate issues do not result.**

State: In progress. Single-instance protection (keyed queues) is delivered; see
[reliability](specs/platform/reliability.md). MongoDB accounts (cut over 2026-10-18) already give a
unique email index and atomic enrollment across instances. Decision for Alex: confirm that this
closes the account part. The feedback part is live with US-A006 since 0.1.482 (2026-10-26, storage copied and verified):
durable issue operations and trusted recovery; a real GitHub issue check remains in the queue.

```gherkin
Feature: Safe account writes
  Scenario: US-P003-AC04 Safe writes across API instances
    Given several API instances or an instance restart
    And a shared uniqueness, update and retry strategy has been agreed
    When account operations overlap
    Then at most one account exists for a normalized email
    And both requested enrollments persist without duplicates or lost updates
```

### US-P018 — Ready for internal company use (release 1)

**As TestHuset, I want QI Academy hosted, secured and handling employee data properly, so that
colleagues can use it from mid-December without legal or operational risk.**

State: Proposed (Alex, 2026-10-23). Mostly configuration and agreements. AC04 delivered
2026-10-24: ip-address fixed; Zod and body-parser accepted with reasons in
[audits/2026-10-dependencies.md](audits/2026-10-dependencies.md#us-p018-ac04), to revisit before release 1.
Decided by Alex 2026-10-25: refuse compressed request bodies (415) instead of the parser major, and
approve Zod 4.6 with its changed validation messages (a list over its limit answers the generic
"Invalid request body"). Live since 0.1.482 (2026-10-26; `b97c174`, `d73fbce`); the builder
stops at the list limits so teachers do not meet that message.
Dependency: management approves about 450–700 DKK a month for hosting.

```gherkin
Feature: Fit for company use
  Scenario: US-P018-AC01 Paid hosting with backups
    Given the hosting budget is approved
    When the API runs on Vercel Pro and the database on a production MongoDB Atlas plan
    Then the hosting terms allow company use
    And a database backup runs on a schedule and a restore has been rehearsed

  Scenario: US-P018-AC02 Private source code
    Given the GitHub repository is private
    When main is pushed
    Then the site and the API still deploy as before

  Scenario: US-P018-AC03 Employee data handled correctly
    Given colleagues' accounts, progress and notes are personal data
    When release 1 starts
    Then the data is stored in an EU region
    And data processing agreements exist with Vercel, MongoDB, Mux, Brevo, Google and Stripe
    And the privacy notice describes what is stored and why

  Scenario: US-P018-AC04 No known high-severity finding in the running server
    Given the October dependency report
    When release 1 starts
    Then every high or critical finding in the API's production dependencies is fixed or accepted with a reason
```

### US-P021 — GDPR data rights: export, erasure and cookie consent

**As a user in the EU, I want to see, export and delete my personal data and control non-essential
cookies, so that the platform meets GDPR.**

State: Designed (Alex, 2026-10-30) — contract: [stories/US-P021-gdpr-data-rights.md](stories/US-P021-gdpr-data-rights.md).
Release 2, full self-service, confirmed in brainstorming. A central injected `PrivacyService` composes
per-repo `collectForExport` / `anonymizeForUser` / `removeForUser` methods, guarded by a coverage test.
Export: one JSON object plus a readable/printable summary (`GET /users/me/privacy/export`). Erasure
(`POST /users/me/privacy/erase`): anonymize-and-retain — strip identifiers to a tombstone account, keep
payments and the audit log pseudonymized, transfer a teacher's courses to a seeded system account, block
an org owner until ownership is transferred (409); gated by re-auth + a typed phrase, immediate and
irreversible. Cookie consent: a minimal, extensible client-only mechanism (essential-only today, analytics
opt-in by construction). Remaining open decisions in the contract: reconfirm R2 at planning, Stripe-side
customer deletion, and the confirmation-phrase wording. Implementation plan:
[superpowers/plans/2026-10-30-us-p021-gdpr-data-rights.md](superpowers/plans/2026-10-30-us-p021-gdpr-data-rights.md).

### US-P022 — Terms of service and purchase-terms page

**As a user, I want to read the platform's terms and purchase terms, so that I know the rules
before I sign up or buy.**

State: Designed (Alex, 2026-10-30) — contract: [stories/US-P022-terms-of-service.md](stories/US-P022-terms-of-service.md).
Release 2 (a basic ToS page already ships; the recorded-acceptance + purchase-terms work is the R2
part). Two in-code versioned documents — Terms of Service (accepted at signup) and Purchase & Refund
Terms (accepted at checkout) — stored as typed constants (the `release-notes.ts` pattern). A per-account
`termsAcceptances` record stores `{ userId, documentId, version, acceptedAt }`; the server stamps the
current version when the user ticks a checkbox at signup and at checkout. A ToS version bump sets
`termsPending` on `/auth/me`, which drives a blocking re-accept gate at next load; purchase terms are
required at each checkout. Adds a `POST /users/me/terms/accept` route, a new `/purchase-terms` page, and
a shared site footer. Legal wording is Alex/legal's (placeholders until supplied). Implementation plan:
[superpowers/plans/2026-10-30-us-p022-terms-of-service.md](superpowers/plans/2026-10-30-us-p022-terms-of-service.md).

### US-P023 — Spike: move storage from MongoDB to Azure

**As a maintainer, I want to know whether to move our data store to Azure, so that an
infrastructure decision is made on evidence, not assumption.**

State: Proposed — spike first (Alex, 2026-10-27). Note: accounts and courses moved to MongoDB only
on 2026-10-18, and release 1 targets MongoDB Atlas in an EU region (US-P018-AC03), so this would
reverse a recent decision; clarify the goal before any work. The original ask said "AzureDevs" — the
target is unconfirmed (Azure Cosmos DB with the Mongo API vs Azure SQL). Spike scope: confirm the
target and the reason (cost, data residency, company IT policy), estimate the rewrite against the
repository-pattern seam (`*Repository.ts`, `mongo*.ts`), and sketch the migration, cutover and
EU-region implications. No implementation until the spike reports and Alex decides the target and
release. Needs a spike note, then a contract.

## Adding a story

Allocate the next unused ID in the journey (T teacher, A admin, L learner, P platform). Add a table
row and a section with actor/goal/benefit, state, scope, dependencies, source, decisions and
uniquely numbered Given/When/Then scenarios. When the work needs a detailed contract, write it in
`stories/<story-id>-<topic>.md` from the [template](templates/feature_spec.md). New ideas start as
Proposed. Do not mark behavior Done because it has only been documented.

## Existing issue reconciliation

[GitHub #30](https://github.com/Stormeal/qi-education/issues/30) requests a catalog carousel. A
carousel exists; the issue is still open. Verify its original intent before changing its status.
