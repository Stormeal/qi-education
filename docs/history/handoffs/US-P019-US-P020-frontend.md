# US-P019 / US-P020 final delivery — 2026-10-29

Owner Codex; `main`; frontend base `80aa541`; API base `a5afe5f`. Alex's continuation
transferred the remaining frontend work from the original Claude assignment. No other agent's
uncommitted files were present. No branch/worktree, push or deployment was performed.

## Delivery

| Commit | Result |
| --- | --- |
| `20ccf39` | Runtime public config, signup token transport and submit state |
| `e53ff24` | Lazy Turnstile widget lifecycle and all route login wrappers |
| `96f0594` | Confirm-first Enroll/Buy, resend and stale-403 fallback |
| `7519833` | Account-scoped notification client, count and stale-response guards |
| `8b30aa4` | Header cluster, phone drawer and shared Lucide renderer |
| `1940b4c` | Notification bell, rows, read actions, empty/error/focus behavior |
| `987e3a1` | `/settings` reuses account page with Notifications and role-specific preferences |
| `abc338b` | Generic icon migration |
| `64439cb` | Count refresh on bell-open, clear human-check failure copy and routing/accessibility follow-ups |
| `a2e100b` | DEF-064 paid-return navigation/hydration race; DEF-065 busy preference controls |

API delivery and its review are recorded in [the earlier handoff](US-P019-US-P020-codex.md).
The [verification record](../verification/2026-10-29-header-signup/README.md) maps each contract
area to tests and browser evidence. Both stories are delivered locally; current behavior lives
in the account, catalog, payments, UI-foundation and notifications specs. Their open-story
contracts are retired, preserved in Git at `a2e100b`.

## Decisions and review rulings

- Kept the existing product design, Feedback composer, account tabs and brand artwork. Generic
  icons use the installed Lucide exports through a typed trusted-SVG wrapper. `NgIcon` exposed
  incompatible Angular signal brands in installed nested dependencies; the wrapper follows
  the existing builder pattern without a dependency change. Career connectors and animated
  countdown/progress drawings remain custom because they convey data rather than generic icons.
- `/settings` is a new route rendering the existing profile component, initially Notifications;
  it shares the existing profile save/dirty model. Preferences disable during save (DEF-065).
- The source assumed an existing `/me` poller; none exists. Count refresh runs on restore,
  fresh sign-in and bell-open. Reopening refetches the list; no poller was added.
- Missing hosted Turnstile keys retain the agreed open-signup fallback. A configured server
  remains authoritative if public-config fetching fails. Isolated runs never load live keys.
- Best-effort notification creation, role gates and account scoping remain as reviewed in the
  API handoff. No feedback event was invented; no retention deletion was added.
- Independent final frontend review found one Important issue (DEF-065), no Critical or Minor
  issues. Corrected once with failing-then-passing regressions and final verification. Browser
  verification separately found the pre-existing DEF-064; a return-specific identity/course
  guard and deferred start fix it while retaining stale-account/course protection.

## Verification

- Full app suite: 612/612, 78 files; UI foundation checks pass.
- Focused final fixes: 19/19 after four failing RED cases.
- `npm.cmd --prefix api test -- --maxWorkers=4`: 2,908/2,908, 119 files.
- `npm.cmd run verify:journeys`: 20/20 (in-memory and isolated Mongo driver boundary).
- `npm.cmd run api:build` and `npm.cmd run app:build:pages`: pass at 0.1.530;
  Pages SPA fallback generated. The closing documentation commit changes only documentation
  and aligned version metadata to 0.1.531. Existing CommonJS optimization warnings remain.
- Browser: no-key and synthetic-key signup, expiry/reset/retry, confirmation/free and paid
  acquisition, admin list/read-one/read-all/count refresh, saved preference reload, phone drawer
  and bell layout. All mutations used isolated stores, synthetic mail/payment/provider boundaries.

The first final API run hit a 5-second timeout in the existing client-limit injectable-policy
test (2,907 passed); its file passed 20/20 alone. The full suite was rerun with four workers to
reduce CPU contention. No API implementation was changed for this timeout.

## Release checks

After an explicitly authorized push, configure both hosted Turnstile keys and verify a real
signup/confirmation and free/paid acquisition. Check Mongo notification indexes/persistence,
all nine recipients and muted groups, cross-device read/preferences, real Stripe return and
one real screen reader. Add the plain release note before pushing, as required by the plans.
