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
| [Ownership specification](specs/US-T001-course-ownership.md) | First teacher story's detailed contract |
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

The ownership policy is implemented and locally checked; see DEF-001 and US-T001
for evidence and remaining release checks. Other audit-generated enhancements remain
Proposed until selected and their outstanding decisions are resolved.

The audit baseline is commit `6e19213`. An audit finding is a dated observation,
not a promise that it still reproduces after later fixes. Use the backlog and
defect statuses for the latest work state.

The career path follow-up was performed on 2026-10-05 at `9a2f30b` plus the
unfinished local lifecycle work. It adds DEF-014 and six Proposed stories;
it does not implement career path features or close DEF-002–DEF-005.
