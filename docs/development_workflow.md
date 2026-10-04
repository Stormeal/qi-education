# Spec-driven development workflow

The repository is the shared record of product intent and delivery. Stories
describe why and what; a feature spec defines the contract; tests and walkthroughs
prove behavior; the work queue records where to resume.

## 1. Refresh the checkout safely

```bash
git status --short --branch
git fetch origin
git branch --show-current
git log -1 --oneline
```

Check for local changes before switching or updating. This project currently
works on `main`. On a clean `main`, use `git pull --ff-only origin main`.
If branches diverge, investigate rather than resetting or silently merging.
If a user requests a particular feature branch, switch to that existing branch
and fast-forward from its upstream instead. Read that branch's queue and spec
after updating; documentation from another branch may describe different work.
Do not detach a worktree that is being used by another active task.

## 2. Select one item

Read `AGENTS.md`, `docs/README.md`, and `docs/work_queue.md`. The user's explicit
item takes precedence. Otherwise resume active work, then select the first Ready
item with satisfied dependencies within the authorized task.

Never infer scope from a branch name alone. Use stable story IDs (`US-T001`,
`US-L001`, `US-P001`) and defect IDs (`DEF-001`). IDs are never recycled.
Suggested ideas are Proposed, not silently committed product decisions.

## 3. Specify behavior before changing it

Every story includes actor, goal, benefit, scope, dependencies, outstanding
decisions, and numbered Given/When/Then scenarios. Include permission denial,
validation, missing data, failure/retry, and empty states when they matter.

For a contract or multi-file change, create `docs/specs/<story-id>-<topic>.md`
from the template. Define frontend behavior, API/storage impact, data migration,
compatibility, and verification. Use [architecture.md](architecture.md) for current
behavior; do not mistake a proposed spec for an implemented feature.

A Ready story has no unresolved decision affecting implementation, independently
testable acceptance criteria, and known dependencies. This does not authorize
implementation outside the user's task. Add a short implementation checklist
inside its spec when selected; avoid maintaining a second competing backlog.

## 4. Implement and verify the selected scope

Record the item as In progress with owner, branch, and base commit in the queue.
For bugs, reproduce the defect before fixing it and turn that case into a
meaningful regression test. For behavior changes, tests must exercise the user
contract rather than mirror private implementation details.

Map every acceptance scenario to a test or documented manual check. Exercise
the relevant UI/API/storage path, including forbidden access and failure cases.
Use isolated data for mutations. For shared-service coverage, record what could
not be verified and why; unit mocks do not prove a live integration works.

Run the relevant package checks from [local_development.md](local_development.md).
Before a release affecting both packages, run the full build/test checklist.
There is currently no lint script or permanent browser E2E suite.

## 5. Update the record and commit

- Update the spec and scenario-to-test map to match the delivered behavior.
- Mark a defect Fixed only with reproduction/regression evidence. Mark it Verified
  after the required environment checks; record the fixing commit and date.
- Mark the story Done only when its criteria pass and its delivery commit is recorded.
  A local commit is not a deployment; track release verification separately.
- Clear or replace the active queue record. Preserve useful handoff notes for partial work.
- Use commits such as `feat(US-T001): enforce course ownership` or
  `fix(DEF-008): preserve request validation status codes`.
- Link the same ID to any GitHub issue/PR used for coordination. The committed
  spec and backlog remain the behavior record; avoid conflicting requirements.

### Current version hook

`git config core.hooksPath` is `.githooks` in the audited checkout. Pre-commit and
pre-push require a semver change. This also applies to documentation commits.
Do not bypass the hook with `--no-verify`.

For a release bump, keep root `package.json`, `app/package.json`, their matching
entries in `package-lock.json`, and `AppStateService.appVersion` aligned. The hook
still names `app/src/app/app.ts`, but the rendered version now lives in
`app/src/app/services/app-state.service.ts`. A root/app package version change
satisfies the hook. Keep the API package version unchanged unless releasing it.

Pushing `main` triggers GitHub Pages deployment. Commit locally when authorized;
push/deploy only within the user's requested scope.

## State definitions

| Story state | Meaning |
| --- | --- |
| Proposed | Captured idea or contract with decisions still to confirm |
| Ready | Defined, testable, and unblocked; candidate for authorized implementation |
| In progress | One owner is implementing the recorded scope |
| Blocked | Specific missing decision/dependency and next action are recorded |
| Done | Acceptance evidence and delivery commit are recorded |
| Deferred | Intentionally postponed with a reason |

Defect states and severity definitions live beside the defect records.
