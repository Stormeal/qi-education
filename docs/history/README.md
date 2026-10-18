# History

Past evidence, kept for traceability. **Do not load these files for normal work**; read them only
when investigating why something was done or how it was verified.

| Folder | Holds |
| --- | --- |
| `audits/` | Dated audits (2026-10-04 application, 2026-10-05 career path, 2026-10-09 code) |
| `handoffs/` | Codex handoffs of finished increments |
| `verification/` | Screenshots and verification records of delivered work |
| `plans/` | Implementation plans that have been carried out |
| `release/` | Finished runbooks: the account (US-P014) and course details (US-P015) cutovers to MongoDB |

Links inside these files are not maintained. Many point to story specs under `docs/specs/` that were
deleted on 2026-10-18 when the specs were reorganised by application area. Read a deleted spec
from Git:

```bash
git log --oneline -- docs/specs/US-T002-course-review.md
```

```bash
git show 6c94eba:docs/specs/US-T002-course-review.md
```

Commit `6c94eba` is the last one that still contains every old spec, handoff and verification file
at its original path.
