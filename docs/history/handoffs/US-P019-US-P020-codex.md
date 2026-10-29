# US-P019 / US-P020 API handoff — 2026-10-29

Frontend and browser work subsequently completed by Codex on Alex's continuation; see the
[final delivery handoff](US-P019-US-P020-frontend.md). The partial-state notes below describe the API handoff at that time.

Owner: Codex, `api/src/**` plus API documentation. Branch `main`, base `a5afe5f`.
Frontend remains Claude-owned; neither story is Done. No push or deployment.

## Delivered API increments

| Scope | Commits | Behavior / evidence |
| --- | --- | --- |
| US-P020 Tasks 1–4 | `5c92bb8`, `3fffe4a`, `1390473`, `083edf6` | Turnstile verification and runtime public key; confirmation required at free-enrollment and paid-checkout entrances; organization/held-course/paid-return exceptions |
| US-P019 A1 | `d1b9667` | Profile preference defaults, round-trip, validation and compatibility for old PUT clients |
| US-P019 A2–A3 | `5c28dca`, `6aae19e` | Caller-scoped memory/Mongo storage, newest 50, read state; role/preference/active-account policy and fan-out |
| US-P019 A4–A5 | `4e40d72`, `7351d17` | Notification routes and aliases, safe 503, private caching; top-level `unreadNotifications` on `/auth/me` and `/me` with zero fallback |
| US-P019 A6 | `c3e2051` | Nine defined review/organization event types, awaited failure-safe side effects; delayed membership activation included |

## Verification

Each new feature was tested RED then GREEN. Final isolated API suite: **2,908/2,908** across
119 files; release journeys: **20/20** (memory and simulated Mongo boundaries); API build passes.
Affected notification/review/organization suites: **86/86**. A first full run hit the pre-existing
five-second sign-in-limit test timeout under load; a complete rerun passed without changing it.
US-P020's first full run also exposed obsolete health/enrollment expectations, updated to the new
contract, plus a client-limit timing failure that passed in the full rerun. No test timeouts or
product protections were relaxed.

Independent read-only review (`api_final_review`, base through A6 diff): no Critical, Important
or Minor findings. No shared-service mutation probes. Frontend checks are recorded in the queue.
Frontend regression suite: **572/572**, plus the UI-foundation checks. A first run timed out in
the existing reviewer-flow test at five seconds; the full rerun passed without changing frontend
implementation or test limits. Frontend source changes are limited to the required version bump.
Pages production build passes at 0.1.520, including the SPA fallback. Existing CommonJS
dependency warnings remain. This is a local build, not a deployment.

## Decisions and their practical limits

- Existing designed contracts and their defaults govern this implementation. Work stays on
  `main` per the repository; no temporary branch/worktree. Shared version files need coordination.
- Turnstile remains optional until both keys exist; omit the optional IP hint, cap tokens at 2,048
  characters, time out verification at ten seconds, fail closed without logging provider details.
  Slow verification requires retry; without keys signup has no bot check.
- Held enrollment remains idempotent; confirmation gates only new acquisition. No access is
  revoked and paid returns are honored.
- Old profile PUTs omitting the entire preference object preserve saved choices. A supplied
  partial preference object fills omitted groups with the documented defaults (all on).
- Organization event creation lives in `OrganizationService`, covering delayed email activation
  as well as direct acceptance. Pending memberships do not send joined notices.
- Invitation notices point to `/organization` and instruct users to check email; raw invitation
  tokens never enter the notification collection. Joining still needs the emailed link.
- Keep the nine event types in the authoritative table. Feedback notices lack a defined type or
  recipients and remain unimplemented; do not silently introduce a tenth type.
- Keep newest-50 reads with no deletion as designed. Collection growth needs later maintenance.
- Shared-local notification runs select Mongo as required by A2. Tests used memory/fake driver
  boundaries only; live Mongo/Cloudflare operation, deployment and browser UI remain unverified.
- The plan helper only parses numeric task headings; A1–A6 were read directly from the plan.
  This changes no product behavior. Frontend tasks remain assigned to Claude.

## Next work

1. Claude: US-P020 Tasks 5–7 — cached runtime config, signup widget/model/token reset, confirmation
   notice/resend and stale-403 handling. Respect organization-included enrollment exceptions.
2. Claude: US-P019 Groups B–D — header/Lucide/mobile drawer, bell service/dropdown, `/settings`
   Notifications tab. API list shape is `{ notifications }`; session count is top-level.
3. Complete frontend/browser scenario evidence, then fold remaining UI behavior into area specs
   and close/delete the story contracts per the delivery workflow.
4. Before enabling Turnstile, configure both hosted keys and verify a real signup. Check real
   Mongo persistence/indexes, cross-device preferences/read state and all workflow recipients after
   an explicitly authorized push. Keep private notices and raw invitation tokens separate.
