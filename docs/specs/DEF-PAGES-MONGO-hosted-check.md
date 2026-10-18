# DEF-PAGES-MONGO: Pages hosted auth storage gate

Owner Codex; selected 2026-10-18 by Alex's failing deployment log. `main`, base `90d9fdf`.

The Pages workflow still requires Google Sheets auth after the approved US-P014 MongoDB
cutover. Fix the gate without changing hosted settings or bypassing configured persistent
authentication. The separate `/health/auth` check, retry limit/delay and deployment remain.

- DEF-PAGES-MONGO-AC01: Given configured MongoDB or Google Sheets auth, when the hosted
  config returns success, then the gate permits the Pages build.
- DEF-PAGES-MONGO-AC02: Given memory/unknown storage or unconfigured/missing auth, when
  checked, then the gate refuses deployment after the existing bounded retries.
- DEF-PAGES-MONGO-AC03: Given an HTTP failure, when checked, then healthy-looking JSON
  cannot pass the gate; a later successful response may pass within the retry budget.

Verification: `api/src/pagesWorkflow.test.ts` executes the actual workflow program in
isolated Node subprocesses with synthetic fetch responses and immediate retry timers.
Run the focused regression and API suite; inspect the workflow diff. No real hosted
requests, shared mutations, pushes or deployment runs. Hosted rerun remains a release check.

Verification 2026-10-18: the regression first failed on configured MongoDB and recovery
to MongoDB (2 failed, 8 passed), then all 10 cases passed after the two-line workflow fix.
Full API suite: 1653 tests / 67 files passed. `git diff --check` passed. No API or frontend
production code changed; builds were not rerun and `api/dist` was not rebuilt.
The fixing commit will be recorded immediately after the local commit.
