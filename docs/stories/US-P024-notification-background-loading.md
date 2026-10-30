# US-P024 — Notification background loading

State: In progress, Codex, 2026-10-30. Main, base `2a36250`.
Selected explicitly by Alex after slow inbox opening during the hosted review walkthrough.

As a signed-in user, I want my notifications ready when I open the bell, so that I can check
updates without waiting for a fresh list request on every opening.

## Contract

Use the existing Angular notification service and session-scoped memory cache. Start one
non-blocking preload after successful sign-in, signup or session validation. Opening displays
available cached results immediately and refreshes them in the background; an opening during
preload shares that in-flight request. No new storage, API, polling or notification events.

All existing account-generation, unauthorized, read-state, role and preference rules remain.
Preload failures must not fail login or create unhandled rejections. Explicit opening/retry can
recover; the existing error guidance remains. Logout/account change clears cached notices and
old replies cannot return them. Read actions must supersede an older background list.

No unresolved product decisions. The requested approach is background loading at sign-in;
refresh-on-open preserves the current freshness contract.

## Acceptance criteria

- **AC01:** Given successful login/signup or a restored session, when notifications are slow,
  then the session completes without awaiting the list and the list starts in the background.
- **AC02:** Given a preloaded list (including an empty one), when the bell opens, then that list
  appears without the initial loading placeholder while fresh results are requested and applied.
- **AC03:** Given a pending preload, when the bell opens, then it shares the pending request
  rather than discarding it and starting another.
- **AC04:** Given a failed preload, when the bell opens/retries, then it can recover; a continued
  failure keeps the existing error and retry flow without changing unread state.
- **AC05:** Given a logout/account switch or read action during a request, when the old reply
  arrives, then it cannot expose the previous account or overwrite the newer read state.

## Verification plan

Delayed-response service, auth integration and real bell DOM regressions; full app tests and
Pages build. Isolated browser fixture with a delayed notification endpoint. Shared writes stay
user-performed; live release/walkthrough remains separately recorded.

All AC01–AC05 pass locally: full frontend 637/637 (27 notification tests), UI foundation,
Pages build and delayed-response browser walkthrough. Review findings reproduced and fixed.
[Evidence](../history/verification/2026-10-30-us-p024/README.md). Next: delivery commit and closure.
