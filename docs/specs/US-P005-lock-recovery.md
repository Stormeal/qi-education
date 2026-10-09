# US-P005: Bounded course mutation ownership

State: Done (expiry increment; broader operator tooling remains Proposed).
Owner: Codex. Branch/base: main / f8d4c2f.
Delivery: `67ec9f2a8da47c31a835ff1ffc430087520ab7a2` (2026-10-09, version 0.1.62).
Selected 2026-10-09. Related investigation: INV-006.

Alex's decision: allow expiry longer than Vercel's maximum function duration.
Implement only after confirming the published maximum. Retain ambiguous owners
until expiry; normal success/validation releases immediately. Reads bypass locks
under US-P006. A duplicate acquisition may remove an expired record only with
an atomic filter matching its exact course, owner and acquisition timestamp.
Legacy records use acquiredAt. Invalid timestamps fail closed. No TTL index.
Expiry is 31 minutes: Vercel's documented extended Node 22 limit is 30 minutes,
checked 2026-10-09 ([official duration documentation](https://vercel.com/docs/functions/configuring-functions/duration)).
This decision supersedes the historical runbook's no-age-takeover policy for
the implemented expiry increment. The runbook's manual outcome reconciliation
still applies to uncertain persisted writes. US-P006 removes read coordination.

AC01: an uncertain write preserves ownership until the bounded expiry and logs
course/owner without credentials. AC02: expired killed/failed invocations permit
a successor; old cleanup cannot delete that successor. AC03: young or malformed
owners never authorize takeover. Operator reconciliation remains available.

Risks: invocation termination prevents further function work, but cannot prove
finality of a previously accepted remote Sheets write. Expiry adopts the user's
availability decision; it does not supply fencing or a cross-store transaction.
Operators must still reconcile uncertain persisted outcomes. A future host with
a longer maximum requires raising the bound before deployment. Local processes
must not run operations beyond the supported host bound.

- [x] Reproduce retained/abandoned ownership with fake collection and fake clock.
- [x] Confirm host duration, choose expiry with margin, implement owner-scoped reclaim.
- [x] Verify boundaries, legacy records, live contention, late cleanup and failures.
- [x] Record full checks and delivery commit; hosted durability remains pending.

Promoted INV-006 as DEF-P005-LOCK. `lockRecovery.test.ts` proves retained Sheets
429 ownership before expiry, recovery after expiry, exact-boundary legacy killed
owner, young/invalid-owner denial, inspection/deletion race and late old cleanup.
Existing lock tests preserve majority acknowledgements, five-second acquisition
and deletion bounds, live writer serialization and ambiguous ownership retention.
The expiry delete includes exact owner and timestamp and requires acknowledgement.
Independent review's permissive-date finding is fixed with strict UTC ISO syntax
and calendar round-trip validation. `0` and impossible February 30 dates now
retain ownership (two additional RED-to-GREEN cases).
Combined 316 API / 128 frontend tests and six journey scenarios, API and Pages
builds pass locally 2026-10-09. Operator UI/auth tooling remains Proposed; no shared
records changed. Hosted MongoDB reclaim/clock/provider behavior remains pending.
Final combined API suite after the two review fixes: 319 tests pass.
