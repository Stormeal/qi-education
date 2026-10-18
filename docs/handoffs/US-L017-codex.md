# US-L017 career milestone trees, API part — Codex handoff

Assigned 2026-10-18 by Claude Code (lead). Alex started US-L017 and approved the
[written spec](../specs/US-L017-L023-A004-career-milestone-trees.md) with its proposed
defaults ("Approve, build release"). This increment builds the API for US-A004 (milestone
schema and validation only), US-L019, US-L020 and US-L021. Claude builds the learner tree page
(US-L017, US-L018 and the learner side of US-L019/L021) against the contract below, at the
same time, in the same working tree.

Folder: `C:\Users\Alex\source\qi-education`, branch `main`. Your history must contain the
commit that added this handoff (`docs(US-L017): ...`). Read `AGENTS.md`, the spec and the
[work queue](../work_queue.md) first.

## Stories and scenarios

- US-A004-AC02, AC03, AC05, AC06 (API side: schema, cross-path validation, privacy, stale
  writes, legacy saves). AC01/AC04 (curating real content, catalogue review) stay with Alex.
- US-L019-AC01–AC06, US-L020-AC01–AC05, US-L021-AC01–AC06 (API side).

## Files

Yours: `api/src/**` (mainly `careerPath.ts`, `careerPathRepository.ts`, the career routes in
`server.ts`, their tests, and a new account-careers module if you prefer), `scripts/verify-journeys*`
if you add a journey, your checklist section in the spec, your row in `docs/work_queue.md`.

Not yours (Claude is editing them now): everything under `app/`, `docs/user_stories.md`, the
rest of the spec. If you need a change there, finish everything else first, then report the
need in your summary. Do not stop early because of it.

## Contract Claude's side relies on

All routes are additive. The deployed frontend keeps using `GET/PUT /users/me/career-path`
and the admin routes unchanged, so those keep their shapes.

### Milestone schema (extends `careerPathContentSchema`, defaults keep old data valid)

- Content: `schemaVersion: 1 | 2`, default `1`. The three launch seeds (`technical-tester`,
  `test-manager`, `test-analyst`) become version 2, built from the spec's candidate mapping
  table with preview courses only (seeds are admin starting drafts, not approved curriculum;
  say so in a code comment). Foundation's requirement is one `exam` action. Other seeds stay
  version 1.
- Step = milestone. New step fields, all with defaults:
  - `stage: string` (max 40, default `''`): the stage label shown above a tree column.
  - `roleMilestone: boolean` (default `false`): this milestone is the job-title milestone.
  - `actions: { id, kind: 'exam' | 'course' | 'activity', title, courseId }[]` (max 12;
    `id` matches `careerPathIdSchema`; `courseId` default `''`, only meaningful for `course`).
  - `requirementBundles: string[][]` (max 6 bundles, each 1+ action IDs of that step): the
    milestone's completion rule. Satisfying all actions of any one bundle is enough.
  - `courses` stays as is and now means **preparation / learning options** only; they never
    satisfy a requirement by themselves.
- A step ID is a **global milestone ID**: the same ID in several published paths is the same
  milestone (Foundation is `foundation` in all three). An action ID is global too.
- `prerequisiteStepIds` may name a milestone defined in another published path.
- Learner DTO (`GET /career-paths`, `/career-paths/:id`) adds `schemaVersion`, and per step
  `stage`, `roleMilestone`, `requirementBundles`, and `actions` as
  `{ id, kind, title, courseId, available }`. A course action's title/availability follows the
  same published-course rule as `courses` today (no private metadata).

### Publish validation (version 2 paths)

Add to `careerPathIssues`, checked against the whole published graph plus the draft:
every step has at least one bundle; bundle IDs exist in the step's actions; a milestone ID or
action ID used in several paths has identical `actions`, `requirementBundles` and
`prerequisiteStepIds` everywhere; prerequisites exist somewhere in the graph; no cycle across
paths; a `course` action names an existing course. Version 1 paths keep today's rules.

### Legacy saves

`PUT /admin/career-paths/:id` with a body lacking `schemaVersion: 2`, while the stored draft or
published revision is version 2, answers 409 `{ message, code: 'career-path-schema' }` before
any write. (The current editor clones and sends the whole document, so it keeps the fields.)

### Account careers (new, private, `Cache-Control: private, no-store`, bearer auth)

Every route below answers the same shape `AccountCareers`:

```ts
type AccountCareers = {
  followedPathIds: string[];          // order of following
  focusPathId: string | null;         // always one of followedPathIds, or null
  achievements: { actionId: string; provenance: 'self-reported'; declaredAt: string }[];
  satisfiedActionIds: string[];       // declared, or a course action whose course the account has 100% complete
  milestoneStates: Record<string, 'achieved' | 'ready' | 'locked'>; // every milestone in every published v2 path
};
```

- `GET /users/me/careers`. With no stored record and a legacy selection of a published path,
  answer that path as the one followed career and focus (read-time mapping; persist it on the
  first write; never erase the legacy selection). New account: empty lists, `null` focus.
- `PUT /users/me/careers/:pathId` follows (idempotent). 404 if not a published path. Sets focus
  when focus is `null`. Concurrent follows of different paths both survive.
- `DELETE /users/me/careers/:pathId` stops following (idempotent). Achievements are kept. If it
  was the focus, focus becomes `null`: never pick another one.
- `PUT /users/me/career-focus` body `{ pathId }`: 409 `career-not-followed` if not followed.
- `POST /users/me/achievements` body `{ actionId }`: server sets provenance and time.
  404 unknown action (not in a published v2 path). 409 `career-not-followed` when no followed
  career contains a milestone with that action. 409 `milestone-locked` when every such
  milestone has an unachieved prerequisite. A repeat answers 200 with the first `declaredAt`.
- Legacy `PUT /users/me/career-path` keeps its response and also follows that path and focuses
  it; it never removes other followed careers.
- Errors use `{ message, code? }`. Zod errors stay 400.

### Rules

- `achieved`: all prerequisites achieved **and** one bundle fully in `satisfiedActionIds`.
  `ready`: all prerequisites achieved, not achieved. `locked`: otherwise.
- A declaration never writes lesson completion, quiz attempts, enrollment or learning
  progress. Real course completion is read, never overwritten.
- No achievement is inferred from role, profile, CV preview or answers.
- Storage: MongoDB next to the career path collections, in-memory without Mongo config,
  following `careerPathRepository.ts`. Per-account documents keyed by user ID.

## Requirements

- Isolated in-memory stores only. No real MongoDB, Sheets, Mux or GitHub data. Do not use
  ports 3001 or 4200 (Claude's browser checks); use in-process tests or other ports.
- Tests named with the scenario IDs, covering: cross-path cycle and mismatch refusal, legacy
  save refusal, follow/unfollow/focus idempotency and concurrency, declaration eligibility
  (sibling, shared Foundation, cross-career prerequisite), repeat declaration, real course
  completion as evidence, no private data in public DTOs, per-account isolation.

## Shared-tree rules

Claude is editing `app/` in this same folder right now. Stage your own files by path; never
`git add -A`; never stash, reset, restore or check out Claude's changes. Read the version from
`package.json` right before committing and bump `package.json`, `app/package.json`,
`app/src/app/services/app-state.service.ts` and the three `package-lock.json` version lines; if
Claude committed in between, bump again. A failure caused by Claude's files is reported, not
fixed. Do not rebuild `api/dist`.

## Delivery

Commit locally, do not push. Run `npm run api:test`, `npm run verify:journeys` and
`npm run api:build`; record what could not be verified. Update your row in
`docs/work_queue.md` (commit, checks, not verified, next), add an Outcome section here, then
stop and summarize.
