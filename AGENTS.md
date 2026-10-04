# Working on QI-Education

Read [docs/README.md](docs/README.md), [the work queue](docs/work_queue.md), and
[the delivery workflow](docs/development_workflow.md) before selecting work.
Engineering conventions are in [.agents/AGENTS.md](.agents/AGENTS.md).

## Source of truth

- Product changes: [docs/user_stories.md](docs/user_stories.md).
- Bugs and investigations: [docs/defect_management.md](docs/defect_management.md).
- Current implementation: [docs/architecture.md](docs/architecture.md).
- Feature contracts: `docs/specs/`; use [the spec template](docs/templates/feature_spec.md).
- Setup and checks: [docs/local_development.md](docs/local_development.md).

## Start of a task

1. Check the branch, working tree, and remote state. Preserve local changes.
2. Follow the user's requested item. Otherwise consult `work_queue.md`: resume
   an active item first, then select the first Ready item whose dependencies are met.
   A Ready entry describes implementable work; it does not authorize starting work
   outside the user's request. Never silently implement a Proposed story.
3. Read the entire story, its linked defects and spec, and the affected code.
   Resolve missing product decisions before dependent implementation.
4. Record the item ID, owner, branch, base commit, and next step in the queue when
   implementation starts. Keep unfinished work resumable.

## Delivery

- Work and commit on `main` in this project unless the user requests a branch.
  Do not create a worktree or branch merely because a generic workflow suggests it.
- Treat Given/When/Then scenarios as the behavior contract. Map scenario IDs to
  meaningful tests and browser evidence. Inspect connected frontend/API contracts.
- Record newly discovered defects with reproduction evidence; record new feature
  ideas as Proposed stories with BDD criteria. Do not silently expand the task.
- Never run mutation probes against shared Sheets, MongoDB, Mux, or GitHub data.
  Use isolated test stores; report any integration coverage limitations.
- Update story, defect, spec, and queue status together. Done requires verification
  evidence and a delivery commit; Deferred or Blocked must explain the next action.
- Prioritize confirmed defects before enhancements within the requested journey.
  Preserve resolved defect records with the fix, date, commit, regression evidence,
  and any remaining release checks.
- Do not bypass git hooks. The current hook requires a semver change even for docs.
  Follow the version instructions in `docs/development_workflow.md` when committing.
- A request to implement or commit does not automatically authorize a deployment
  or push. Pushing `main` triggers GitHub Pages deployment.
