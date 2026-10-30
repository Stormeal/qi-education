# DEF-066 — Legacy milestone metadata

Verified locally by Codex, 2026-10-30, on `main`, implementation base `177d48f`.
No hosted records, settings or deployments were changed. Hosted reproduction is preserved
in the defect record and the [signup walkthrough](../2026-10-29-header-signup/hosted-checks.md).

## Cause and scope

Stored milestones can contain explicit null `requirementVersion`/`requirementHistory`.
The content schema defaults absent values, but rejects nulls. Previously, both repositories
returned those snapshots unchanged. Public list/detail parsing returned 400 and account context
parsing returned 500. Admin reads exposed raw null metadata. The original writer is unknown.

Both repository read adapters now copy documents, content and steps, defaulting only nullish
metadata to version `1` and history `[]` in draft and published snapshots. They do not save
records or change revision/updatedAt. Valid versions/history and all other fields are preserved.
Request schemas remain strict. Other malformed stored fields are outside this compatibility fix.

## Regression map

| Scenario | Evidence |
| --- | --- |
| Given stored null or missing metadata in both snapshots, when either adapter lists careers, then defaults apply and records stay unchanged | `careerPathRepository.test.ts`: four DEF-066 cases across memory and the real Mongo adapter with a memory-only collection; preserves version 3 and its genuine history on a second milestone, revision/timestamp and backing records; no database writes |
| Given a published legacy career, when public list/detail, learner context and admin list load, then all succeed | `careerPath.test.ts`: both root and `/api` aliases; before fix statuses `[400,400,500,200]`, after `[200,200,200,200]`; checks both snapshots, milestone readiness, empty learner evidence and no save calls |
| Given a new admin request containing null metadata, when saved, then reject it without a write | `careerPath.test.ts`: both aliases return 400 |

The final pre-fix run had six failing regressions and two passing strict-request cases.
After the fix, the focused career, repository, account, version-history and withdrawal suites
passed **137/137**. Review found no critical/important issues. Its minor observation about the
memory preservation assertion was corrected to inspect the actual memory backing records;
the final repository suite passed **19/19**.

Final checks:

- Full isolated API suite: **2,916/2,916**, 119 files, `--maxWorkers=4`.
- Release journeys: **20/20** (isolated Sheets and Mongo adapters).
- API TypeScript build and GitHub Pages frontend build: passed. Existing CommonJS dependency
  warnings remain non-blocking.
- No frontend behavior changed, so the full frontend test suite was not repeated for this API fix.

## Isolated browser walkthrough

Used the fresh Pages build (displayed version 0.1.537), a local static server on
`127.0.0.1:4211`, and an API on `127.0.0.1:3011` forced to `NODE_ENV=test`, isolated mode.
The HTML runtime API setting pointed only at that local API. A memory repository was seeded
with one published/draft milestone career containing the exact two null fields; all providers
were disabled by isolated configuration. Signed in with the built-in local demo student.

1. Home displayed **Career path — Not chosen** and **Choose a career path**, with no unavailable
   error.
2. **Choose a career path → Just compare paths** displayed **Legacy browser career** with one
   **Foundation milestone**.
3. **Follow this career** succeeded in isolated account storage; its milestone displayed
   **Ready to start**, with the exam action available.
4. Returning Home displayed **0 of 1**, **Legacy browser career**, and
   **Next: Foundation milestone**. Screenshot inspected in the browser session. Browser warning
   and error logs were empty.

No learner achievement, enrollment or payment was created. Following the synthetic career was
the only browser mutation and used memory-only storage. The user's hosted account was untouched.

## Remaining release check

After an explicitly authorized push/deployment, repeat read-only public career list/detail
and authenticated Home/career browsing against the existing hosted null records. Confirm no
400/500 and normal career guidance. This record proves local compatibility through the Mongo
adapter, not live MongoDB behavior or a deployed fix. DEF-067 remains a separate open defect.
