# US-P011: Isolated local runs

## Record and outcome

- Story: US-P011-AC01/02/03; owner Codex, selected 2026-10-11.
- State: Done locally, implementation 2010bfa (0.1.148), 2026-10-11.
  Delivery record is this commit with the hook-required fresh aligned version.
  Main/base dba0646 confirmed;
  concurrent Claude frontend commit 373cf6f preserved.
- Spec first; [handoff](../handoffs/US-P011-isolated-local-runs-codex.md).
- Related defects: DEF-030 reproduced ambient test credentials selecting assets,
  webhooks and GitHub despite DEF-029 dotenv protection; append-only reproduction recorded before fix.

Local API startup currently exposes settings loaded from api/.env to store and
integration factories. A normal local run should use disposable memory stores and
absent video/webhook/issue integrations even when that file contains shared keys.
Shared access must be an explicit choice. Hosted configuration must keep working.

## Decisions (confirm or change)

Alex: build this increment. Lead: USE_SHARED_SERVICES, exact value 1 only. Hosted
means NODE_ENV=production OR VERCEL is defined, including an empty defined value;
its setting is ignored. NODE_ENV=test takes priority and remains isolated even with
opt-in or host markers. Other runs default isolated. Mail selection does not change:
only NODE_ENV=production selects Brevo; every other run uses the local recorder.
AUTH_TOKEN_SECRET/SESSION_SECRET, PORT and CORS_ORIGIN still load locally.

| Environment | Opt-in | Mode |
| --- | --- | --- |
| NODE_ENV=test, with any other settings | Any | isolated |
| NODE_ENV=production or VERCEL defined (outside test) | Any | hosted |
| Other run | Exact string 1 | shared |
| Other run | Missing, empty, 0, true, 01, or whitespace around 1 | isolated |

## Scope and implementation

Use config.ts as the single API policy boundary. Remove Google/Sheets, Mongo,
Mux and GitHub feedback settings before schema validation in isolated/test mode,
including aliases, ranges and playback policy. No process environment mutation.
Retain mail settings and local HTTP/auth settings. Tests additionally hide mail
provider credentials to keep the established no-real-credentials test contract.
Expose a pure config builder for injected environment testing without dotenv or
api/.env; normal startup still uses dotenv outside test and keeps shell precedence.
All real-looking fixtures, sender/provider/SDK/FS doubles stay isolated.

Existing common presence helpers enforce access mode, including the webhook and
asset paths that currently read config directly. Auth/instructor/reset hosted
fail-closed decisions use the hosted predicate, including VERCEL without production.
For complete settings, local shared mode selects all existing shared implementations,
including Mongo reset storage. Missing-setting fallbacks remain as before: memory
content/assets/career/progress/feedback; hosted unavailable users/instructor/reset;
absent video/webhooks; unconfigured GitHub service errors on use. No new local Mux
or GitHub fake behavior is introduced. Demo users/course are unchanged.

Hosted config retains shared settings unchanged. Production selection, auth secret
fail-closed behavior and signed-Mux rejection remain. VERCEL alone receives that
hosted user/instructor/reset protection rather than demo accounts. Mail still follows
NODE_ENV exactly. Any unresolved doubt about hosted detection blocks delivery.

index.ts prints one mode-only startup line plus its existing listening line. No
key, setting value or service address in the new line. GET /health/config adds only
mode: isolated/shared/hosted; other shapes, routes, status codes and headers remain.
Failed demo login in isolated mode keeps x-qi-education-auth-storage: memory.

Doctor resolves shell-over-file settings using the same precedence and mode matrix,
reports the mode, permits missing shared configuration and local auth fallback in
isolated mode, and retains shared/hosted readiness checks. --allow-demo remains a
compatibility option. Runtime mode mismatch is a doctor failure. Script tests use
mocked FS and health responses, never the real .env or listeners. run-app-dev forwards
the explicit setting unchanged to its child API command; it does not infer opt-in.
Script mode resolution mirrors the tiny predicate because doctor runs as plain Node
JavaScript without compiling/importing the TypeScript API; cross-product tests guard
both implementations. No new dependency or required prebuild for doctor.

## Behavior contract

```gherkin
Feature: Safe local development
  Scenario: US-P011-AC01 Local runs are isolated by default
    Given synthetic complete shared service settings and no exact opt-in
    When the local API starts
    Then all nine repositories use memory and video/webhook/issue calls are absent
    And shared SDK clients are not invoked and demo users/course are unchanged
  Scenario: US-P011-AC02 Shared services are an explicit choice
    Given exact USE_SHARED_SERVICES=1 on a nonhosted nontest run
    When the API starts with configured shared settings
    Then the existing shared stores and integrations are selected
    And startup, health and doctor name shared mode without printing settings
  Scenario: US-P011-AC03 Hosted and tests retain their safety contracts
    Given production or any defined VERCEL marker
    When the setting is present or absent
    Then hosted services and missing-configuration protections apply as before
    And NODE_ENV=test remains isolated regardless of every setting
  Scenario: US-P011-AC04 Keep configuration and frontend compatibility
    Given an isolated API with explicit auth, port, CORS and mail settings
    When reading health/config or attempting a wrong demo password
    Then only mode is added to health/config and the failed login says memory storage
    And local mail remains a recorder and no shared configuration value is logged
  Scenario: US-P011-AC05 Diagnose and forward the chosen mode
    Given shell and synthetic dotenv settings, including overrides
    When running doctor or the app-dev orchestrator against doubles
    Then doctor reports the effective mode and isolated missing shared settings pass
    And the app-dev child receives the explicit setting unchanged
```

## Implementation checklist

- [x] Confirm branch/ancestor, read handoff and select own queue row; spec first.
- [x] Isolated RED for mode/config/factory matrix, health/login/startup and scripts.
- [x] Implement centralized API filtering, hosted predicates, mode line/health and scripts.
- [x] Pass local/shared/hosted/test selection and no-provider regressions.
- [x] Update example/local/architecture docs, remove delivered story and read-only review.
- [x] Run all five checks; fresh version and scoped local implementation commit.
- [x] Record implementation commit/evidence in queue/spec with fresh delivery-record version; stop, no push.

## Verification and delivery

| Scenarios | Evidence | Result |
| --- | --- | --- |
| AC01/02/03 | Injected config and actual factory selection, stub SDKs, no .env reads or network | Pass |
| AC04 | Ephemeral HTTP, exact health projection, demo login header, mocked index listener | Pass |
| AC05 | Actual scripts with mocked filesystem/process/child orchestration and health | Pass |

Run npm run api:test, npm run verify:journeys, npm run api:build, npm run app:test
and npm run app:build:pages. Rebuild api/dist only through the final API build.
No real .env reads by task probes, shared data, real mail, ports 3001/4200, branch,
worktree or push. Live hosted deployment and actual shared service readiness remain
release checks, not proved by constructor selection over synthetic settings.


Verification 2026-10-11: all five required commands pass on main/373cf6f plus this
change: api:test 963 tests/43 files; verify:journeys six HTTP steps; api:build;
app:test 265 tests/34 files; app:build:pages including generated SPA fallback.
Existing stylesheet budget warnings, test-setup type-check warning and jsdom
scrollTo notices remain; no failed frontend check and no frontend repair.

RED evidence: initial config/factory/health matrix and script-mode assertions failed
before implementation. DEF-030 had its own isolated failure before the fix/log.
Doctor's inline-comment/export cases failed before switching to existing dotenv
parsing. Independent read-only review passed 46 focused cases and found one new
injected-builder bug: absent source markers inherited ambient defaults. Three
new cases reproduced it RED; all four source/ambient cases now pass because the
builder resolves the secret from its own mode. Reviewer confirmed the correction,
25 factory/config/HTTP cases pass, no hosted-detection doubt or provider leak found.
There are 50 focused config/factory/script cases in the final full suite.

No schema/data migration, dependency, auth abuse control or frontend change. No
outside-owned file change is needed. api/.env was not inspected or changed; probes
stubbed dotenv/FS. Constructor selection is not a live integration or deployment
check. Real shared service readiness, hosted startup/login and combined browser
acceptance remain unverified; Alex handles them after deployment authorization.

DEF-030 is Fixed locally in 2010bfa; its original reproduction bytes and append-only
resolution remain in the defect log. US-P011-AC01/02/03 are removed from the backlog.
Codex stopped after the scoped delivery-record commit; no push or deployment.

## Lead check and correction (2026-10-11)

Checked on the lead's machine, where `api/.env` holds the real settings, without contacting
any service (configuration and `/health/config` only):

| Start | Result |
| --- | --- |
| Built API on a spare port, no setting | Startup line `Stores: isolated`; `/health/config` reports `mode: isolated`, users, content and assets in memory, Mux not configured |
| `USE_SHARED_SERVICES=1` | mode `shared`; Sheets and MongoDB settings present |
| `NODE_ENV=production` | mode `hosted`; Sheets and MongoDB settings present |
| `VERCEL=1` in the shell | mode `hosted` |

Correction in the lead-check commit: `VERCEL` counts only when the process already has it
before `api/.env` is loaded. A pulled `api/.env` can contain `VERCEL=1`, which would have
turned a local run into a hosted one and put it back on the shared services.

963 API and 265 frontend tests, six journeys, API and Pages builds pass on the combined tree.
Not verified before the push: the hosted API after deployment (checked right after it; see
the work queue). Local mail stays printed outside production, as decided.
