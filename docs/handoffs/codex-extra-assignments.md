# Extra Codex assignments

Written 2026-10-20 by Claude Code for Alex, to use Codex credits on work that is useful and safe to
run alongside Claude. **Start these only after Codex has finished its US-L024 tasks** (its row in
`docs/work_queue.md` says done). Run them **one at a time, in this order**: paste one prompt, wait
for Codex's summary, then paste the next.

None of them changes how the app behaves for users. They add tests, reports and drafts; anything
that would change behavior is written down for Claude and Alex instead of being changed.

How to tell one is finished: Codex prints a summary that lists its commits and the checks it ran,
and `git log -1` shows a commit that starts with the assignment's ID (`X1`, `X2`, …).

---

## Rules every assignment follows

Every prompt below says "follow the Rules section of docs/handoffs/codex-extra-assignments.md".
These are the rules:

- Folder `C:\Users\Alex\source\qi-education`, branch `main`. Claude works in the same folder at the
  same time.
- Read `AGENTS.md` ("Two agents in one working tree") first.
- Isolated in-memory stores only: no `USE_SHARED_SERVICES`, no real MongoDB, Stripe, Mux, Brevo or
  GitHub calls, no secrets. Do not use ports 3001 or 4200.
- Never edit `app/**`, `docs/stories/**`, `docs/specs/**`, `docs/user_stories.md`, `CLAUDE.md` or
  `AGENTS.md`. If one is needed, finish everything else, then report the need.
- Never change production behavior in `api/src/**` unless the assignment says so. A bug you find is
  written up as a new `DEF-…` row in `docs/defects.md` (next free number, with steps to reproduce)
  and left unfixed.
- Stage your own files by path; never `git add -A`, stash, reset, restore or check out Claude's
  changes. Before each commit read the version from `package.json` and bump it in `package.json`,
  `app/package.json`, `app/src/app/services/app-state.service.ts` and `package-lock.json`.
- Before finishing run `npm run api:test` and `npm run api:build`; both must pass. A failure caused
  by Claude's files is reported, not fixed.
- Commit locally with a message starting with the assignment ID; do not push.
- Finish with a summary: commits, checks with counts, what you found, anything not verified.

---

## X1: Permission sweep over every API route

Why: one table-driven test that catches any route that forgets its sign-in or admin check, now and
for every future route (organizations will add many).

```text
Assignment X1. Follow the Rules section of docs/handoffs/codex-extra-assignments.md.

Write api/src/routePermissions.test.ts. Build the app with createServer and in-memory stores, then
read every registered route from the Express router stack (method + path, both the plain and /api
variants). For each route, classify it as public, signed-in or admin, using an explicit expected
table in the test file (so a new route without an entry fails the test with a clear message saying
"add this route to the permission table").

Assert for every route: anonymous requests to signed-in and admin routes answer 401; a student's
token on admin routes answers 403; no protected route answers 2xx without a token. Use harmless
inputs (unknown ids are fine; a 404 after the auth check counts as "auth passed"). Webhook routes
are public but must refuse an unsigned body.

Also add one cross-user check per personal resource (profile, notes, progress, careers, payments):
learner A's token can never read or change learner B's data.

Files you own: api/src/routePermissions.test.ts only (plus docs/defects.md for findings).
Commit message starts with "X1".
```

## X2: Evidence for INV-003 (accounts across two API instances)

Why: Alex has an open decision (US-P003) on whether MongoDB's unique email index and atomic
enrollment already close the account part. This produces the evidence.

```text
Assignment X2. Follow the Rules section of docs/handoffs/codex-extra-assignments.md.

Read docs/defects.md (INV-003) and the US-P003 section of docs/user_stories.md. Write
api/src/multiInstanceAccounts.test.ts: two createServer instances sharing the same Mongo-backed
fake collections from api/test/ (as two API instances sharing one database). Make sure the fake
enforces the unique email index the way MongoDB does; if it does not, extend the fake in api/test/
and say so in the summary.

Cases: two signups with the same email (different letter case) at the same moment on the two
instances give exactly one account and one clear refusal; two enrollments in different courses for
the same account on the two instances both persist; the same enrollment on both instances is
stored once.

Then update only the INV-003 row in docs/defects.md: what the test shows and your recommendation
(close the account part, or what is still missing). Do not change the US-P003 story.

Files you own: api/src/multiInstanceAccounts.test.ts, api/test/** fakes, the INV-003 row.
Commit message starts with "X2".
```

## X3: Read-only API audit report

Why: a ranked list of real risks in the API (security, money, data loss, slow queries) before the
organizations work makes it bigger.

```text
Assignment X3. Follow the Rules section of docs/handoffs/codex-extra-assignments.md.

Audit api/src/** without changing code. Check: every route's auth and role checks; input validation
at every trust boundary (JSON bodies, params, query, raw uploads, webhooks); the US-L024 payment
paths (checkout, confirm, webhook, idempotency, amounts in øre, foreign sessions); error responses
leaking internals; MongoDB queries without a supporting index; unbounded reads (lists without
limits); work done after a response is sent on Vercel; secrets in logs.

Write docs/audits/2026-10-api-audit.md: findings ranked most severe first, each with file:line, a
plain-English explanation, a concrete failure scenario and a suggested fix. Say clearly what you
checked and found nothing in. Do not fix anything; real defects also get a DEF row.

Files you own: docs/audits/2026-10-api-audit.md, docs/defects.md (new rows only).
Commit message starts with "X3".
```

## X4: Tests for untested error paths

Why: error branches (storage down, bad input, races) are where untested code breaks in production.

```text
Assignment X4. Follow the Rules section of docs/handoffs/codex-extra-assignments.md.

Go through the route files in api/src/ (*Routes.ts and the handlers in server.ts). For each
handler, list its error branches (400/403/404/409/413/415/429/503 and caught exceptions) and check
whether a test exercises it. Add tests for the uncovered branches, named by the story or defect ID
they protect where one exists. Do not change production code; if a branch cannot be reached or
behaves wrongly, write it up as a DEF row instead.

At the end, add a short table to your summary: route file, branches found, branches newly covered,
branches left uncovered and why.

Files you own: new or existing api/src/*.test.ts and api/test/** fakes; docs/defects.md new rows.
Commit in batches of a few route files; each message starts with "X4".
```

## X5: Organizations API draft (proposal only)

Why: releases 2 and 3 (US-O001/US-O002) still need a design. A concrete draft from the API side
makes that design session shorter. Nothing is built.

```text
Assignment X5. Follow the Rules section of docs/handoffs/codex-extra-assignments.md.

Read docs/stories/US-O001-organizations.md (decisions agreed with Alex), docs/business_rules.md,
docs/architecture.md, api/src/courseAccess.ts and the US-L024 payment code. Write a proposal at
docs/handoffs/US-O001-api-draft.md covering: data model (collections, documents, indexes);
organization request and site-admin approval; invites by email for people with and without an
account (reuse the existing token and mail patterns); owner, member and admin permissions per
route; the billed career per member and course access requests; how canLearnCourse gains the
entitlement check in US-O002 (purchase, seat, add-on) without breaking existing enrollments; the
owner overview response (career-level progress only, no quiz scores or notes); Stripe Billing
mapping for US-O002 (subscription items per career seat price and per add-on, card or invoice,
14-day overdue rule); and a list of open questions for Alex.

Mark it clearly as a draft for Claude and Alex to review. Write no code.

Files you own: docs/handoffs/US-O001-api-draft.md only. Commit message starts with "X5".
```

## X6: INV-004 options note (feedback issue created twice)

Why: Alex has to choose how feedback triage avoids a second GitHub issue after a restart. This
lays out the choice.

```text
Assignment X6. Follow the Rules section of docs/handoffs/codex-extra-assignments.md.

Read INV-004 in docs/defects.md, docs/specs/admin/feedback.md and the triage code
(githubFeedback.ts and its route). Reproduce the double issue in a test with a stub GitHub service:
the issue is created, saving its link fails, the retry runs on a fresh server instance. Keep that
test as it.fails (it documents the current behavior).

Write docs/handoffs/INV-004-options.md: at least two fixes (for example, saving a "pending issue"
marker on the feedback row before calling GitHub, or finding the existing issue by a hidden marker
in its body), each with how it works, what can still go wrong, the code it touches and a rough
size; then your recommendation. Do not implement a fix.

Files you own: one new test file, docs/handoffs/INV-004-options.md, the INV-004 row (link to the
note). Commit message starts with "X6".
```

## X7: Dependency report and safe API updates

Why: keep the API's packages current without risking the frontend.

```text
Assignment X7. Follow the Rules section of docs/handoffs/codex-extra-assignments.md.

Run npm outdated and npm audit for the root, api and app workspaces. Write
docs/audits/2026-10-dependencies.md: each outdated or vulnerable package, current and latest
version, whether it is a patch, minor or major step, what it affects, and your recommendation.

Then, for api/ only, apply patch and minor updates that are not security-sensitive breaking changes,
one package (or one family) per commit, running npm run api:test and npm run api:build after each.
Revert any update that breaks a test and note it in the report. Do not update app/ packages or any
major version; list those for Claude and Alex.

Files you own: api/package.json, package-lock.json, docs/audits/2026-10-dependencies.md.
Commit messages start with "X7".
```

## X8: Performance and security audit (read-only)

Why: release 1 puts colleagues' personal data on the site in December. X3 (20 October) audited the
API only; organizations, milestone careers, SCORM import, course teachers and the frontend have
not been audited since. Requested by Alex, 2026-10-24.

```text
Assignment X8. Follow the Rules section of docs/handoffs/codex-extra-assignments.md.

Audit performance and security of the whole repository (api/ and app/) without changing code.
Start from docs/audits/2026-10-api-audit.md (X3, source 546a2d4): do not repeat its findings;
say which of its open risks still hold. Give extra attention to code added since 546a2d4
(git log 546a2d4..HEAD): organizations, milestone careers and requirement versions, SCORM import,
course teachers, CV scan.

Security: authorization on every route, including organization owner/member/original-owner rules
and foreign IDs; invitation token handling (fragment, sessionStorage, hashing, rate limit);
input validation at every trust boundary (JSON, params, query, uploads, SCORM/zip import, CV
files, webhooks); HTML rendering in the app (innerHTML, inertHtml, renderLessonMarkdown, uploaded
SVG or HTML attachments) and anything that could run script; where the app keeps tokens and what
a script on the page could read; CORS, security headers and cache headers on the API; secrets or
personal data in logs, URLs or error bodies.

Performance: MongoDB queries without a supporting index (list each query and the index it needs,
new organization collections included); unbounded reads and N+1 reads per request; work per
request that grows with catalog or member size; cold-start cost on Vercel; frontend bundle
(run npm run app:build:pages and report initial and largest lazy chunk sizes, and what makes them
large); repeated or duplicate API calls on page load (read the services; no browser needed);
large payloads sent to the browser (course content, careers).

Write docs/audits/2026-10-performance-security.md: findings ranked most severe first, each with
file:line, a plain-English explanation, a concrete failure scenario, evidence (reproduced with an
in-process test or read from the code) and a suggested fix. Say clearly what you checked and found
nothing in. Do not fix anything; each reproduced defect also gets a DEF row in docs/defects.md
(next free number). Throwaway probe scripts are not committed.

Files you own: docs/audits/2026-10-performance-security.md, docs/defects.md (new rows only),
your row in docs/work_queue.md. Read anything; edit nothing else, app/** included.
Commit message starts with "X8".
```

---

## Ideas that need Alex's yes first (no prompt yet)

- An admin **Payments** list (who bought what, when, amount) for a revenue overview.
- Logging Stripe refunds (`charge.refunded`) so an admin can see them; refunds still keep access.
- A browser test runner for US-P001 (needs the dependency decision already waiting on Alex).
