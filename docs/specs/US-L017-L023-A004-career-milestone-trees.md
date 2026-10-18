# Career milestone trees: job goals, learning routes, and shared achievements

## Record

- State: Approved by Alex on 2026-10-18 ("Approve, build release") with the proposed
  defaults below; implementation started the same day (see Implementation contract).
- Current-release stories: US-A004 and US-L017–US-L022 in the
  [backlog](../user_stories.md). US-L023 records future CV recognition separately.
- Documentation owner: Codex. Implementation: Claude Code (lead, `app/`) and Codex
  (`api/src/**`), started 2026-10-18 on `main`. Codex handoff:
  [US-L017-codex.md](../handoffs/US-L017-codex.md).
- Related confirmed defects: none newly investigated. Preserve the privacy,
  progress and recovery contracts of US-P004, DEF-016 and US-L002.
- Visual reference: [prototype](../../design/career-path/milestone-tree-prototype.html)
  and [desktop image](../../design/career-path/milestone-tree-desktop.png).
  The prototype's single-career switching controls predate Alex's final
  multiple-career requirement. The follow/focus behavior below supersedes those
  controls; its example course order is not approved curriculum.

## Problem and intended outcome

As a learner, I want to see how my learning develops toward relevant jobs, so I
can choose my next step without being overwhelmed by the entire catalogue.
Success means an understandable route from Foundation to a role milestone,
further development beyond that milestone, honest progress and accessible next
actions. Learners can pursue several careers without repeating shared work.

The current career page has CV preview, questions, career comparison and a
roadmap. Its model supports one selection, ordered steps, prerequisite IDs and
course alternatives. Required-step percentages come from lesson completion;
prerequisites guide recommendations and do not block achievement. This feature
changes those semantics, rather than just redrawing the roadmap. See the
[existing career contract](US-L009-L012-T008-career-paths.md),
[account progress](US-L002-account-progress.md) and
[architecture](../architecture.md).

## Confirmed product decisions

Alex confirmed these during the 2026-10-18 discussion:

1. Initial career destinations: **Test Analyst, Technical Tester, Test Manager**.
2. ISTQB Foundation is the common starting milestone. A path branches into
   further milestones and may continue beyond the first role milestone.
3. A node is a milestone, with at least one course or action. It may offer
   multiple learning options, including classroom or on-demand preparation and
   a separate exam requirement.
4. Downstream milestone progression is locked until its prerequisites are
   achieved. Pursuing Test Automation Engineer does not exclude Technical Test
   Analyst. Sibling branches remain available.
5. Other careers' trees are hidden in the normal view. Learners explicitly
   explore alternatives; the tree stays compact and focused.
6. **Several careers may be followed at once.** The displayed route is a focus,
   not an exclusive account goal. Shared achievements count across careers.
7. Careers may combine requirements from several paths. Test Architect is the
   motivating example, not a fourth launch career selected by this discussion.
8. New learners start with no recorded qualifications. In this release they
   manually declare courses/actions completed or certifications passed.
9. Future CV processing will recognise certifications and matching courses.
   No CV parsing or automatic recognition belongs to the current release.
10. The proposed page follows QI Academy's current header, fonts, palette and
    setup flow. The existing CV step remains an honest preview.

## Scope

Included: admin-owned milestone curation and course mapping; three job routes;
focused tree and milestone detail; explicit self-reported achievements saved to
the account; prerequisite enforcement; following several careers; shared and
cross-path requirements; coherent Home guidance and recovery states.

Future work: CV upload processing, extraction and matching (US-L023), a curated
Test Architect career, and additional job titles. Excluded: XP, leaderboards,
streaks, skill ratings, payment changes, credential verification by admins,
awarding official certifications or job titles, and database cutover work.

No live course records, career paths, account achievements or external systems
are changed by this documentation package.

## Proposed behavior contract

The numbered scenarios in the [backlog](../user_stories.md) are the acceptance
contract. The following rules explain how those stories fit together. Defaults
in this section are proposals for written-spec review, not additional decisions
attributed to Alex.

### Following a career and focusing the page

- An account has a set of followed careers and one displayed focus. A learner
  may also preview an unfollowed career without changing that set or focus.
- The page opens the saved focus. Other followed careers are reachable through
  a compact career selector; exploration lists all three published careers.
- "Follow this career" adds a goal. It never replaces another goal. "View path"
  changes focus. These are separate from achievement and course enrollment.
- Stopping following a career preserves all achievements and enrollments. If
  it was focused, offer the remaining followed careers; when none remain show
  the career choice state. Do not silently follow another career.
- Previewing another career permits inspection, not achievement writes. The
  learner follows it before recording a new achievement through its tree.

### Milestones, actions, and learning options

- A milestone has a stable identity, clear outcome, stage label, explicit
  prerequisite milestones and an explicit completion requirement.
- Careers reference milestones; they do not own independent copies of shared
  achievements. Foundation is the same milestone in all three careers.
- Completion requirements support **all required actions** and **alternative
  bundles**: all actions in one bundle are required; satisfying any accepted
  bundle is enough. The editor must state these rules in plain language.
- Preparation recommendations and completion evidence are distinct. For
  Foundation, the proposed requirement is a declaration of the passed exam.
  A recommended preparation course alone cannot satisfy that exam requirement;
  classroom and on-demand formats are ways to prepare. An already-qualified
  learner can manually declare the exam without pretending to retake a course.
- Course completion declarations, passed exams and other published actions
  have stable, reusable identities and provenance (`self-reported` in v1).
  Repeated saves of the same declaration have one outcome.
- Manually claiming a course completed does not fabricate lesson completion,
  a passing quiz attempt, platform learning progress or enrollment. The
  distinction remains visible wherever those values are shown.
- A new learner has no declarations. Existing real account lesson completion
  remains stored and may satisfy a published course-completion action; it
  never implies an external exam was passed. No qualifications are inferred
  from the learner's job title, answers, role permissions or CV preview.

### Unlocks, shared work, and composite careers

- New milestone achievement requires its published actions and all prerequisite
  milestones. Enforce eligibility in the API as well as in the controls.
- A locked milestone remains inspectable; state which prerequisites are missing.
  These locks govern milestone progression. Existing course reading,
  enrollment and payment/access rules remain the course system's responsibility.
- A prerequisite may come from another career. Its title and an "Explore
  prerequisite" action must explain the dependency without displaying that
  other tree by default. Following every contributing career is not required
  to reuse an achievement already earned there.
- Validate cycles and missing dependencies across the complete published
  milestone graph, not just inside one career. A composite career can depend
  on management, technical and analyst milestones, with all required inputs needed.
- Recording shared Foundation counts once per displayed career and immediately
  satisfies that prerequisite in every career that references it. It does not
  count as several account achievements.
- Show achieved milestone counts and node states. For v1, do not display a
  whole-tree percentage or say a job has been obtained. Optional/alternative
  branches must not make completing every branch an implied requirement.
- Distinguish "role milestone achieved" from "all future development finished";
  career routes can continue beyond that milestone.

### Errors, revisions and preservation

- Loading, failed loading, no followed career, missing/withdrawn career and
  unavailable learning option are distinct states with appropriate recovery.
- Confirm a manual declaration and explain its self-reported status. A failed
  save preserves the chosen learning option and offers retry; it never shows
  a saved achievement or unlocks a downstream milestone prematurely.
- Authenticated account identity owns declarations, goals and focus. A late
  response after logout or account change cannot update another session.
- Publishing layout/title changes preserves stable achievement identities.
  Material requirement changes need a distinct requirement version, a visible
  update notice and explicit handling of historical declarations. Do not reuse
  an action identity to mean a different exam or course.
- For the first release, declarations are add-only in the learner UI. Correction
  and revocation behavior must be agreed separately before adding those actions.
- Unavailable/withdrawn options remain explained; private course metadata is not
  exposed through public milestone references. Existing declarations are kept.

## Candidate mapping for curriculum review

Course names were checked against the [TestHuset catalogue](https://testhuset.dk/kursus/)
on 2026-10-18. The table is a starting map, not a complete inventory, validated
admission policy, publication authorization or assertion that these courses exist
in QI Academy. US-A004 requires a catalogue coverage and availability review.

| Route | Candidate milestone | Candidate preparation / learning options | Proposed requirement |
| --- | --- | --- | --- |
| All three | ISTQB Foundation | ISTQB Foundation; proposed Academy on-demand preparation | Passed Foundation exam |
| Technical Tester | Technical testing foundations | Grundlæggende testautomatisering; Grundlæggende udvikling for testere | Approved practical learning option |
| Technical Tester | Test Automation Engineer | ISTQB Advanced Test Automation Engineer v2.0 | Passed relevant exam |
| Technical Tester | Technical Test Analyst | ISTQB Advanced Technical Test Analyst | Passed relevant exam |
| Technical Tester | Automation in practice | Automatisering med Playwright; Automatisering med Leapwork | Approved practical learning option |
| Technical Tester | API testing | Grundlæggende Postman; Grundlæggende SoapUI | Approved practical learning option |
| Test Manager | First Test Manager milestone | Grundlæggende Test Management; Eksamineret Test Manager | Curator to confirm appropriate role milestone criteria |
| Test Manager | Advanced Test Management | ISTQB Advanced Test Management v3.0 | Passed relevant exam |
| Test Manager | Agile test leadership | ISTQB Advanced Agile Test Leadership at Scale; Test Manager i agile projekter | Split exam and practical outcomes where they are not equivalent |
| Test Analyst | Test design techniques | Testteknikker | Approved practical learning option |
| Test Analyst | Advanced Test Analyst | ISTQB Advanced Test Analyst | Passed relevant exam |
| Test Analyst | Exploratory testing | Udforskende test | Approved practical learning option |
| Test Analyst | Acceptance testing | ISTQB Acceptance Testing | Passed relevant exam |
| Test Analyst | Risk-based testing | Risikobaseret test; Risikobaseret test (on-demand) | Equivalent format options, subject to curriculum review |

The prototype's API-testing-after-Technical-Test-Analyst edge and other course
sequences are illustrative. Do not encode these as professional admission
requirements without curriculum review. AI courses, tools and other catalogue
items must be mapped or explicitly deferred during US-A004; do not manufacture
equivalence between unrelated courses just to fit an option list.

## UI and accessibility

- Retain the existing setup entry points, CV preview explanation and questions;
  role choices are limited to the three initial careers. A saved focus opens
  directly on its tree. Existing legacy career choices need an explicit mapping.
- Use the current shared UI foundation. Read left to right by stage on desktop;
  milestone details reveal learning options and mandatory actions on selection.
- On narrow screens provide an equivalent ordered milestone view with the same
  dependency information. The prototype's horizontal map scrolling is a design
  reference, not the complete mobile accessibility implementation.
- Nodes and career controls work by keyboard with visible focus. State is given
  in words, not color alone. Announce saved achievements and unlocks; preserve
  focus after detail updates, dialog confirmation, errors and career navigation.
- Changing the displayed focus does not require confirming a destructive switch;
  removing a followed goal explicitly explains that achievements are retained.
- The prototype's reset/example-progress controls are design tools, not product
  features. CV parsing, fake percentages and fabricated recommendations are absent.

## API, storage and compatibility

All changes below are proposed; no route or storage implementation is delivered.

| Boundary | Proposed change / invariant |
| --- | --- |
| Published/admin career content | Typed milestone definitions, action/requirement identities, stages and cross-path references; extend draft/publish validation and stale-write protection |
| Account goals | Add private reads and idempotent add/remove operations for a set of career IDs; validate followed career existence and preserve unrelated goals during concurrent adds |
| Displayed focus | Persist one focused followed career separately from goal membership; exploration is temporary UI state |
| Account achievements | Private reads and idempotent declarations keyed by account and stable action identity; server assigns provenance/time and checks current published eligibility |
| Learning progress | Keep current lesson and quiz evidence unchanged; use actual completion as an input where applicable, never overwrite it from declarations |
| Storage | Use the existing MongoDB/in-memory repository boundary for isolated tests; career records already use MongoDB independently of the current Sheets cutover |
| Existing selection | Preserve the record; map its supported career to a first followed goal and focus without erasing history. Legacy selection writes must not replace the new goal set |
| Existing path edits | Version the new schema; legacy saves must preserve new fields or be explicitly refused before mutation. Do not let an old editor strip milestone requirements |
| Legacy paths/progress | Dry-run mapping and explicit approval before shared-data changes; retain old paths, selections, enrollments and learning evidence; unmapped paths get a recovery state |
| Private responses | Authentication, per-account scope, no-store caching and session guards; public definitions never include account declarations or private course metadata |

Final DTOs, endpoint names and migration commands belong to the reviewed
implementation plan. This feature contract fixes the observable behavior and
preservation requirements rather than prematurely selecting those interfaces.

## Review decisions before implementation readiness

| Decision | Owner / next action |
| --- | --- |
| Curriculum coverage, milestone criteria, course equivalence and prerequisite edges | Alex / curriculum owner reviews US-A004's candidate map and complete course inventory |
| Existing career IDs, including `technical-tester` vs the displayed Technical Tester title, and legacy paths outside the initial three | Implementation owner inventories stored definitions safely and proposes a reviewed mapping; do not rename stored IDs from labels |
| Acceptance of the proposed action-bundle rules, add-only declarations and explicit distinction from lesson completion | Alex reviews this written specification |
| Multi-career DTO compatibility, schema versioning, rollout and migration | Define in the implementation plan after written-spec approval; no silent shared-data migration |
| Material requirement revisions for existing learners | Curriculum owner approves version/evidence mapping before publishing changed criteria |
| Test Architect curriculum | Future selection; the model supports composition, but the fourth route is not part of launch scope |

## Implementation contract (2026-10-18, confirm or change)

Alex approved the spec without reviewing each default; these are the lead's choices, open to
change. The API contract is in the [Codex handoff](../handoffs/US-L017-codex.md#contract-claudes-side-relies-on).

- Milestones stay steps of a career path document (`schemaVersion: 2`); a step ID is a global
  milestone ID, so Foundation is one milestone shared by all three careers. No separate
  milestone collection.
- Completion rules are action bundles: any one bundle with all its actions satisfied.
  Preparation courses (`courses`) never satisfy a requirement.
- A course action is satisfied by a declaration or by real 100% course completion on the
  account; an exam or activity only by a declaration.
- Milestone states are computed by the API and shown as given; the page does not recompute them.
- Increment 1 (this one): API for A004/L019/L020/L021; learner tree, details, declaring and
  several careers on the Career Path page. Next increment: admin editing of milestone fields
  (the current editor preserves them), Home guidance (US-L022), legacy path mapping review.

## Story sequence and implementation handoff

This is a feature/story package, not an implementation plan or an authorization
to start every Proposed story. Suggested dependency order:

1. US-A004: agree and curate milestone content, cross-path identities and course mapping.
2. US-L019 and US-L020: account declarations and eligibility, delivered together
   before any learner-facing achievement write is enabled.
3. US-L021: multiple followed careers and focus, preserving legacy selection.
4. US-L017 and US-L018: focused tree and learning-option details.
5. US-L022: consistent Home guidance and integration verification.
6. US-L023 is future work and does not block the first release.

After Alex reviews the written spec, use the writing-plans workflow if
implementation planning is requested. Keep the MongoDB migration handoff separate.

## Verification and delivery

All product acceptance scenarios remain **Pending**. Use isolated stores and
map each scenario ID below to meaningful checks when implementation is selected.

| Scenario group | Required evidence | Current result |
| --- | --- | --- |
| US-A004-AC01–AC06 | Graph/requirement validation, admin API/editor, stale edits, privacy and catalogue coverage review | Pending |
| US-L017-AC01–AC05 | Desktop and narrow-screen tree, empty/error states, node semantics and keyboard walkthrough | Pending |
| US-L018-AC01–AC04 | Mandatory vs recommended actions, equivalent options, exam distinction and unavailable options | Pending |
| US-L019-AC01–AC06 | Isolated account persistence/auth/retry, provenance and actual-progress preservation | Pending |
| US-L020-AC01–AC05 | Eligibility API plus tree; sibling, shared and cross-career prerequisites; role milestone continuation | Pending |
| US-L021-AC01–AC06 | Multiple goals, focus, exploration, retained achievements, concurrency and legacy migration | Pending |
| US-L022-AC01–AC04 | Home-to-tree guidance, honest counts, load failures and old-session response rejection | Pending |
| US-L023-AC01–AC03 | Future extraction/matching and learner review contract; no release-one implementation | Future / Proposed |

The standalone mockup was checked on 2026-10-18 with 15 local interaction checks,
at desktop width 1366 and phone width 390, with no console errors. Its tested
single-selection switching predates the multiple-career correction and is not
evidence for US-L021. Prototype-only evidence proves no API, MongoDB durability,
course availability, certification validity or production behavior.

Documentation validation and the local documentation commit are recorded in the
queue and Git history for this file. No story is Done on the strength of this
specification or visual approval.
