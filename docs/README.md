# Project documentation

QI-Education helps teachers author courses and learners discover, enroll in, and
complete them. This documentation establishes a spec-driven delivery process.

## Start here

| Document | Purpose |
| --- | --- |
| [Work queue](work_queue.md) | Active work, next candidate, dependencies, and handoff |
| [User stories](user_stories.md) | Prioritized product backlog with BDD acceptance criteria |
| [Defect management](defect_management.md) | Evidence, severity, reproduction, and fix verification |
| [Development workflow](development_workflow.md) | Fresh checkout through spec, implementation, and delivery |
| [Architecture](architecture.md) | Current boundaries, storage, routes, and limitations |
| [Local development](local_development.md) | Setup, isolated audit mode, checks, and deployment context |
| [Course review specification](specs/US-T002-course-review.md) | US-T002 revisions, review history, behavior contract and delivery evidence |
| [Ownership specification](specs/US-T001-course-ownership.md) | First teacher story's detailed contract |
| [Lifecycle access specification](specs/DEF-002-005-course-lifecycle.md) | Access and quiz readiness contracts |
| [Unsaved navigation specification](specs/DEF-006-unsaved-navigation.md) | Warning and discard behavior; recovery excluded |
| [Direct learning specification](specs/DEF-010-direct-learning.md) | Remembered session, loading, errors and entitlement |
| [Local learning progress specification](specs/DEF-007-009-014-learning-progress.md) | Real course progress, honest Home and quiz position |
| [Remaining defect specification](specs/DEF-008-011-012-013-remaining-defects.md) | Request errors, feature availability and catalog integrity |
| [Course operation recovery](course_operation_recovery.md) | Durable ownership and required hosted recovery checks |
| [DEF-005 handoff](handoffs/DEF-005.md) | Historical publication readiness patch and delivery record |
| [Feature spec template](templates/feature_spec.md) | Reusable format for future feature contracts |
| [Audit report](audits/2026-10-04/application_audit.md) | Code review, walkthrough, evidence, and coverage limitations |
| [Career path audit](audits/2026-10-05/career_path_audit.md) | Goal-to-learning journey, reproduced progress defects, and Proposed improvements |

## Product decisions

Recorded on 2026-10-04:

1. Delivery order: **teacher journey, learner journey, platform reliability**.
2. Teachers edit their own courses; admins can edit all courses.
3. Work and commits use `main` unless a different branch is explicitly requested.
4. Confirmed defects come before enhancements. Resolved defects stay documented
   with their resolution, regression evidence, date, and fixing commit.

DEF-002/003/004 are resolved locally in `a6767f6` on 2026-10-07; see their
[verification record](verification/2026-10-07/DEF-002-004.md).
DEF-005/006/010 are resolved locally; fixes and dedicated verification were delivered
on 2026-10-08 in `3feeea4`. See their
[verification record](verification/2026-10-08/DEF-005-006-010.md) and current queue.
The user confirmed **warnings only** for DEF-006; local draft recovery remains Proposed.
DEF-007/009/014 are resolved locally on 2026-10-09 in `6729b74`; current local
completion rules are retained. [Verification](verification/2026-10-09/DEF-007-009-014.md) records
the regressions and isolated walkthrough. Cross-device and career-path progress
remain Proposed.
DEF-008/011/012/013 are resolved on 2026-10-09; delivery commit `79c2ea5`. [Verification](verification/2026-10-09/remaining-defects.md)
includes safe request errors, hidden unfinished controls, responsive cards and
the user's approved shared category correction. Other shared records were preserved.
The ownership policy is implemented and locally checked; see DEF-001 and US-T001
for evidence and remaining release checks. Other audit-generated enhancements remain
Proposed until selected and their outstanding decisions are resolved.

The audit baseline is commit `6e19213`. An audit finding is a dated observation,
not a promise that it still reproduces after later fixes. Use the backlog and
defect statuses for the latest work state.

The career path follow-up was performed on 2026-10-05 at `9a2f30b` plus the
unfinished local lifecycle work. It adds DEF-014 and six Proposed stories;
it does not implement career path features or close DEF-002–DEF-005.
