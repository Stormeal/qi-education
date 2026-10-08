# DEF-002–DEF-005 — Course lifecycle and assessment boundaries

State: DEF-002, DEF-003, DEF-004 Fixed (resolved in code), 2026-10-07.
Fix commit: `a6767f69e5254e01a47ca33b58dabe34925ea586`. Shared release checks remain pending.
Owner: Codex. Branch: `main`. Resumed base: `ff3d68a`, selected 2026-10-07.
Originally selected 2026-10-04. Related stories: US-T002, US-T004, US-L001.
LC-01–04 and LC-06 were delivered in that batch. LC-05 / DEF-005 resumed
2026-10-08 at `159f45b`; handoff patch applied and reviewed. Delivery commit pending.
See [the historical handoff](../handoffs/DEF-005.md) and
[current verification](../verification/2026-10-08/DEF-005-006-010.md).

## Selected scope

Teachers edit their own courses; admins edit all courses. Admins alone control
pricing, publication, archival, and catalog metadata. Teachers can create drafts
and submit them for review. Ordinary metadata saves may echo the current price
and status; omitted restricted fields must preserve their stored values.

Public catalog metadata includes published courses. Owner/admin views may include
private courses. Learning content and attachments need an authorized entitlement;
learner quiz reads must omit answer correctness and explanation fields. Assessment
scoring moves to the API, preserving feedback after answer submission.

Working defaults stated in the session on 2026-10-04: published previews include
overview and lesson titles; previously enrolled learners retain archived access;
quizzes have exactly one correct answer. These were suggested in optional questions
and selected as assumptions while proceeding with the authorized defect work.

| Reader | Published | Draft/review | Archived |
| --- | --- | --- | --- |
| Anonymous/unenrolled | Catalog, thumbnail, title outline | No access | No access |
| Enrolled learner | Catalog and redacted full content/resources | No access | Existing enrollment retains access |
| Owner teacher/admin | Metadata, outline, full author preview | Same | Same |

`GET /courses/:id/outline` returns title/duration/type metadata only. Full
`GET /courses/:id/content` requires authentication and entitlement; default reads
are learner DTOs. `?view=author` additionally requires owner/admin authorization.
Responses use `Cache-Control: private, no-store` and `Vary: Authorization`.
Private thumbnails use authenticated browser fetches and object URLs.

`POST /courses/:id/content/components/:componentId/quiz-attempts` accepts
`sectionId` and selected `{questionId, answerId}` pairs. Partial submission preserves
the current per-question feedback; skipped questions earn zero. Duplicate/unknown
IDs fail with 400. Responses contain score, total/pass points, pass result, and
correctness/explanation for submitted answers only. No correct-option IDs or flags
for unsubmitted questions are returned. Attempts are stateless in this scope.

This fix excludes review comments, a published revision workflow, checkout/payment
entitlements, server-persisted quiz attempts/progress, and Mux signed-playback setup.

## Behavior contract

```gherkin
Scenario: LC-01 Teacher creation cannot bypass admin controls
  Given I am a teacher
  When I create a course with a non-draft status, price, or admin catalog value
  Then the API returns 403 before creating metadata or content
  And ordinary draft creation remains available

Scenario: LC-02 Restricted updates preserve ordinary authoring
  Given I own a course
  When I change its price or attempt publication or archival
  Then the API returns 403 without writing
  But saving ordinary fields with unchanged or omitted price and status succeeds
  And my status control offers only permitted transitions

Scenario: LC-03 Catalog and content reads enforce entitlement
  Given unpublished content or a published course I have not enrolled in
  When I request catalog, lessons, thumbnails, or attached resources
  Then the response follows the agreed role and lifecycle access matrix
  And no preview includes lesson bodies, resource URLs, video IDs, or answer keys
  And enrolled learner content contains no answer correctness or explanations
  And responses or transport failures from an old session/view cannot replace current private state
  And successful enrollment restarts a pending view under the updated entitlement

Scenario: LC-04 New enrollment requires publication
  Given a draft, review, or archived course
  When I attempt a new enrollment
  Then the API rejects it without changing my enrollment list
  And repeated enrollment in a published course remains idempotent

Scenario: LC-05 Assessment readiness is enforced before exposure
  Given a structurally valid but incomplete draft quiz
  When I save the draft
  Then the incomplete values remain editable
  But submission, publication, and replacement of reviewed or published content
  reject an unanswerable quiz with component and question errors
  And stored content and status remain unchanged on rejection

Scenario: LC-06 Quiz feedback comes from trusted scoring
  Given an authorized learner and an answerable quiz
  When I submit selected answer IDs
  Then the API scores the stored questions and returns feedback only for submitted answers
  And a valid selection can reach the pass mark
  And the learner UI shows pending/failure/retry states and completes only after a passing response
```

## Implementation and verification checklist

Course reads that pair lifecycle authorization with stored content, all course
mutations, enrollment, and Mux webhook writes share a per-course operation lock.
This prevents in-flight draft saves from undoing admin controls and pairs lifecycle
reads with content. Memory storage coordinates within its repository; MongoDB
uses a separate `<content collection>_locks` collection, unique course IDs and
owner-scoped deletion. Sheets-backed operations require Mongo coordination.
Collection loading and acquisition have a five-second deadline; contention or
deadline expiry returns 409. Driver operations also use `timeoutMS`. Other storage
errors return 500. No protected callback runs after an uncertain acquisition.
The lock lasts through the awaited handler, including disconnected clients.

Durable locks **do not expire or automatically transfer ownership**: Sheets has no
conditional write/fencing support, so a delayed owner must never write after a
successor. Normal success/read/validation errors release in `finally`. Actual
provider write failures retain uncertain ownership and potentially referenced
assets; prerequisite reads are outside those write boundaries. Process termination or a
failed lock deletion can leave a record; recovery requires verifying that its
request has stopped before deleting that exact course/owner record. See the
operational runbook and Proposed reliability story US-P005. Hosted release needs
a tested recovery procedure and isolated multi-instance Mongo/Sheets checks.

- [x] Restricted creation/update regressions and teacher Status UI.
- [x] Record working defaults and access matrix; broader product decisions remain Proposed.
- [x] Shared read authorization, public/learner DTOs, no-store, late response and 401 guards.
- [x] Enrollment lifecycle guards, idempotency, and pending-view restart.
- [x] LC-05 draft/readiness validation, including empty drafts, blank answers, and unattainable scores.
- [x] Authenticated quiz scoring and connected learner UI feedback/errors.
- [x] API role/lifecycle/alias matrix, frontend tests, builds, isolated browser checks.
- [x] Independent review with no remaining blocking issue.
- [x] Delivery commit and synchronized resolution status.

Scenario evidence: [2026-10-07 verification](../verification/2026-10-07/DEF-002-004.md).
LC-05 evidence: [2026-10-08 verification](../verification/2026-10-08/DEF-005-006-010.md).

Use only isolated stores for mutation verification. Keep schema/storage interfaces
compatible with Sheets and MongoDB. Existing invalid published quizzes must be
corrected by an author/admin; the scoring route must refuse misleading results.
Live shared-service and hosted release checks will be recorded separately.
