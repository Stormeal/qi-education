# US-A004: Curriculum review and changed criteria

## Record

- Story: US-A004 in the [backlog](../user_stories.md). Open scenarios: AC04 (map real offerings
  honestly) and AC06 (revise criteria without losing achievements). AC01–AC03 and AC05 are delivered;
  their behavior is in [career curation](../specs/career-paths/curation.md) and
  [milestones and achievements](../specs/career-paths/milestones-and-achievements.md).
- Owner: Alex / curriculum owner for AC04; implementation owner unassigned for AC06.
- Hosted step already possible: an admin opens each old-format career, clicks **Convert to milestone
  format**, checks actions and stages, and publishes. Two converted careers that both use a generic
  step ID such as `step-3` are refused at publish as conflicting.

## AC04: candidate mapping for review

Course names checked against the [TestHuset catalogue](https://testhuset.dk/kursus/) on
2026-10-18. A starting map, not a complete inventory or an approved admission policy.

| Route | Candidate milestone | Candidate preparation / learning options | Proposed requirement |
| --- | --- | --- | --- |
| All three | ISTQB Foundation | ISTQB Foundation; proposed Academy on-demand preparation | Passed Foundation exam |
| Technical Tester | Technical testing foundations | Grundlæggende testautomatisering; Grundlæggende udvikling for testere | Approved practical learning option |
| Technical Tester | Test Automation Engineer | ISTQB Advanced Test Automation Engineer v2.0 | Passed relevant exam |
| Technical Tester | Technical Test Analyst | ISTQB Advanced Technical Test Analyst | Passed relevant exam |
| Technical Tester | Automation in practice | Automatisering med Playwright; Automatisering med Leapwork | Approved practical learning option |
| Technical Tester | API testing | Grundlæggende Postman; Grundlæggende SoapUI | Approved practical learning option |
| Test Manager | First Test Manager milestone | Grundlæggende Test Management; Eksamineret Test Manager | Curator to confirm role milestone criteria |
| Test Manager | Advanced Test Management | ISTQB Advanced Test Management v3.0 | Passed relevant exam |
| Test Manager | Agile test leadership | ISTQB Advanced Agile Test Leadership at Scale; Test Manager i agile projekter | Split exam and practical outcomes where not equivalent |
| Test Analyst | Test design techniques | Testteknikker | Approved practical learning option |
| Test Analyst | Advanced Test Analyst | ISTQB Advanced Test Analyst | Passed relevant exam |
| Test Analyst | Exploratory testing | Udforskende test | Approved practical learning option |
| Test Analyst | Acceptance testing | ISTQB Acceptance Testing | Passed relevant exam |
| Test Analyst | Risk-based testing | Risikobaseret test; Risikobaseret test (on-demand) | Equivalent format options, subject to review |

Decisions for the review: complete inventory (AI courses, tools and other items mapped or
deferred with a reason), equivalent formats vs different qualifications, external vs Academy
courses, real prerequisite edges (the prototype's edges are illustrative), and how the hosted
AI Testing Specialist career fits. A composite Test Architect route is future curriculum.

## AC06: changed criteria (not built)

- Layout and title changes already keep achievement identities, and a changed exam or course must
  use a new action ID (the API refuses reuse).
- Still to decide and build: requirement versions, the update notice learners see, and how
  existing declarations map to new criteria.
