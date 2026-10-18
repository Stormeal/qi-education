# Defects

Open defects and investigations. Every resolved record, with its reproduction, fix, commit and
evidence, is in [defects_resolved.md](defects_resolved.md); look an ID up there. Severity is impact;
delivery order is in [work_queue.md](work_queue.md).

## Triage rules

P1: unauthorized changes/disclosure or a serious release risk. P2: broken core behavior or
misleading results with a workaround. P3: smaller usability/layout issue.

States: Open, Investigating, In progress, Fixed, Verified, Deferred, Duplicate. Fixed requires a
delivery commit and regression evidence. Verified also requires the specified environment check.
A plausible code concern without reproduction is an investigation (INV-), not a confirmed defect.
Capture user data only in anonymized form.

When a defect is fixed, move its whole record to `defects_resolved.md` with the resolution date,
fixing commit, passing regression checks and any remaining release checks. Never delete or reuse IDs.
Next free IDs: DEF-047, INV-020.

## Open defects

None.

## Open investigations

| ID | Concern | Next verification | Related |
| --- | --- | --- | --- |
| INV-003 | Overlapping signup or enrollment across several API instances. Single-instance races are fixed (DEF-023/024); MongoDB accounts now add a unique email index and `$addToSet` enrollment | Decide whether the MongoDB guarantees close it, then confirm with two isolated instances | US-P003-AC04 |
| INV-004 | Feedback triage creates the GitHub issue before saving its link; a retry on another instance or after a restart can create a second issue (same-instance retry fixed, DEF-025) | Fail the link save after a stub issue, retry on a fresh instance, count issues | US-P003-AC04 |
| INV-014 | Signup and per-client attempts are unlimited (per-account sign-in limit delivered, DEF-033/034) | Scripted signups against a local instance; agree limits first | US-P008-AC05 |
| INV-019 | A hosted video lesson kept spinning on the learning page (Alex, 2026-10-17); not reproduced locally, possibly a side effect of DEF-043 | Open the same hosted lesson after the DEF-043 fix; if it still spins, copy the console and `mux-player` network requests | Learning page |

## New defect record

Include the next unused DEF ID, title, severity, state, discovery date, tested commit and
environment, expected behavior and its source, actual behavior, minimal reproduction, impact,
root cause if verified, related story or spec, regression check, fixing commit and verification
outcome. Use Investigating when the observation is not yet confirmed.
