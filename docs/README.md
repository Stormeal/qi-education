# Project documentation

QI Academy: teachers author courses, admins review and publish them, learners enroll, learn and
follow career routes. This folder is split into what the app **does**, what we **plan**, and what
**happened**.

## What the app does (current behavior)

| Document | Read it for |
| --- | --- |
| [specs/](specs/README.md) | One folder per application area, high-level behavior and the code behind it |
| [business_rules.md](business_rules.md) | Roles and permissions, course lifecycle, access, progress, careers, limits |
| [architecture.md](architecture.md) | Layers, file conventions, where new code goes, invariants, known debt |
| [tech_stack.md](tech_stack.md) | Frameworks, libraries, hosting and tooling |

## What we plan and are doing

| Document | Read it for |
| --- | --- |
| [work_queue.md](work_queue.md) | Active work, what waits on Alex, next candidate, open release checks |
| [user_stories.md](user_stories.md) | Open backlog with Given/When/Then scenarios |
| [stories/](stories/) | Detailed contracts of open stories |
| [defects.md](defects.md) | Open defects and investigations, triage rules, record template |
| [development_workflow.md](development_workflow.md) | From selecting an item to delivery |

## How to run and operate it

| Document | Read it for |
| --- | --- |
| [local_development.md](local_development.md) | Setup, isolated and shared runs, checks |
| [course_operation_recovery.md](course_operation_recovery.md) | Releasing a stuck course lock on the hosted API |
| [release/teacher-rehearsal-checklist.md](release/teacher-rehearsal-checklist.md) | Live walk of the teacher, admin and learner path |
| [qi-academy-rename.md](qi-academy-rename.md) | Rename compatibility and the remaining external steps |

## What happened (do not load for normal work)

| Document | Read it for |
| --- | --- |
| [defects_resolved.md](defects_resolved.md) | Every resolved defect with reproduction, fix and commit; look IDs up here |
| [history/](history/README.md) | Audits, finished handoffs, verification screenshots, carried-out plans and runbooks |

## Product decisions

Recorded 2026-10-04 and still in force:

1. Delivery order: **teacher journey, learner journey, platform reliability**.
2. Teachers edit their own courses; admins can edit all courses.
3. Work and commits use `main` unless a different branch is explicitly requested.
4. Confirmed defects come before enhancements. Resolved defects stay documented.
