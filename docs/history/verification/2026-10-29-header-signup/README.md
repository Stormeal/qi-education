# US-P019 / US-P020 verification — 2026-10-29

Codex, `main`, frontend base `80aa541`, implementation through `a2e100b` (0.1.530).
Local delivery only; no push, deployment or shared-service mutation.

## Automated contract map

The original contracts are retained in Git at `a2e100b`. These identifiers name the contract
areas in the delivery plans; the original UI contracts did not number their scenarios.

| Contract area | Permanent regression evidence |
| --- | --- |
| US-P020 API-01 verifier/config/isolation | `api/src/turnstileService.test.ts` |
| US-P020 API-02 signup aliases, validation/budget ordering | `api/src/signupHardeningRoutes.test.ts` |
| US-P020 API-03 public config without secrets | Same HTTP tests; `app/src/app/services/api-client.service.spec.ts` |
| US-P020 API-04 free/paid gate and held/legacy/org/paid-return exceptions | `api/src/enrollmentConfirmation.test.ts` |
| US-P020 Task 5 runtime config/cache/token transport | `api-client.service.spec.ts`, `signup-hardening.spec.ts` |
| US-P020 Task 6 lazy render, token/expiry/error/reset/disposal and submit gate | `ui/turnstile-challenge/turnstile-challenge.spec.ts`, `services/signup-hardening.spec.ts` |
| US-P020 Task 7 confirmation notice, resend, stale 403 and exemptions | `services/enrollment-confirmation.spec.ts`, `pages/course-view-page/course-view-page.spec.ts` |
| US-P019 A1 profile defaults/compatibility | `api/src/accountProfile.test.ts`, `accountProfileRepository.test.ts` |
| US-P019 A2–A3 storage/scoping/newest-50 and mute/role/fan-out | `api/src/notificationRepository.test.ts`, `notificationService.test.ts` |
| US-P019 A4–A5 routes/aliases/private cache/count | `api/src/notificationRoutes.test.ts`, `routePermissions.test.ts` |
| US-P019 A6 nine review/org event types, failures and delayed membership | `api/src/notificationTriggers.test.ts` |
| US-P019 B header cluster, permitted drawer links, keyboard, Lucide | `ui/page-header/page-header.spec.ts`, UI foundation checks, desktop/phone screenshots below |
| US-P019 C session count, stale replies, list/retry/read-one/read-all/focus | `services/notification.service.spec.ts`, `ui/notification-bell/notification-bell.spec.ts` |
| US-P019 D settings route, role toggles, dirty/save/round-trip | `pages/profile-page/profile-notifications.spec.ts` |
| DEF-064 paid return across initial navigation and same-account hydration, stale account/course rejected | Three regressions in `services/course-purchase.spec.ts`; before/after browser screenshots |
| DEF-065 preference edits during save | Three role cases in `profile-notifications.spec.ts` assert controls disabled during save |

New behavior was observed failing before implementation. Final defect pass: four failed tests
before the fixes; 19 focused tests pass after. Full app suite: **612/612**, 78 files, including
UI foundation tests and design-token checks. Full API: **2,908/2,908**, 119 files (four workers);
release journeys: **20/20**. API and Pages builds pass at 0.1.530, including generated SPA fallback.
The first default-concurrency API run timed out in one existing client-limit case; that file
passed 20/20 alone and the complete four-worker rerun passed. Existing CommonJS build warnings
and test-environment `scrollTo`/test-setup warnings remain. Full results and decisions are in
the [handoff](../../handoffs/US-P019-US-P020-frontend.md).

## Browser and HTTP walkthrough

Frontend `localhost:4200`; ordinary API `localhost:3001` with `USE_SHARED_SERVICES=0`.
Configured-widget fixture API `127.0.0.1:3010` asserts isolated mode, uses in-memory stores,
local captured mail, a one-use synthetic verifier and `FakePaymentService`. Playwright replaces
only the Cloudflare script with an explicitly labeled test human-check button. No real
Cloudflare, Brevo, MongoDB or Stripe requests were made. Fixture routes/scripts remain ignored
development artifacts and are not application code.

- No configured key: signup 201 without widget or Cloudflare script. Unconfirmed free Enroll
  disabled with confirmation notice; Resend 202 and success message. Student Settings shows
  Organization only.
- Configured synthetic key: missing token rejected 400; submit disabled before solve and after
  expiry. A duplicate-account 409 resets the consumed token. Solve again with another address:
  signup 201 with token. Locally captured confirmation link returns 204; free enroll 200 and
  Start learning appears.
- Priced course: Buy 499 DKK disabled before confirmation; confirming unlocks checkout. Fake
  checkout/confirm succeeds and stores enrollment. This exposed DEF-064. After the fix, replay
  of the same paid session reaches Start learning and the payment-received message.
- Admin signs in with one unread organization request. Opening the panel preserves unread;
  clicking its row opens `/admin` and marks it read. Separately, while signed in with zero
  unread, a new HTTP organization request creates a notification; bell-open refreshes to one
  unread. Mark all read clears it and a full reload preserves the read state.
- Admin Settings shows all three groups. Turning Admin inbox off and saving returns 200;
  full reload keeps it off. Role tests additionally verify teacher and student visibility.
- At 375 × 812, drawer exposes permitted navigation, Feedback and Settings; Escape returns
  focus to the hamburger. Bell panel x=16, width=328 fits the viewport; no sideways page scroll.
  Desktop and phone screenshots were inspected.

## Screenshots

| Evidence | File |
| --- | --- |
| Existing login with shared Lucide controls | [login-desktop.png](login-desktop.png) |
| Desktop header and inbox | [notifications-desktop.png](notifications-desktop.png) |
| Role-appropriate account settings | [settings-desktop.png](settings-desktop.png) |
| Phone drawer | [navigation-phone.png](navigation-phone.png) |
| Phone bell panel | [notifications-phone.png](notifications-phone.png) |
| Confirmation notice and resend | [confirmation-enrollment.png](confirmation-enrollment.png) |
| Synthetic challenge, explicitly labeled | [signup-synthetic-challenge.png](signup-synthetic-challenge.png) |
| Confirmed free enrollment | [confirmed-enrollment.png](confirmed-enrollment.png) |
| DEF-064 before | [payment-return-before-fix.png](payment-return-before-fix.png) |
| DEF-064 after | [confirmed-purchase.png](confirmed-purchase.png) |

## Independent review and limits

Independent read-only frontend review of `80aa541..64439cb`: no Critical or Minor findings;
one Important, DEF-065, corrected in `a2e100b` with a RED→GREEN regression. DEF-064 predates
the frontend range and was reproduced separately during browser verification. No second review
was requested; the final fix pass was verified with focused tests, full tests and browser evidence.

Remaining release checks: real hosted Turnstile keys/widget/verifier and mail; live Mongo
indexes/persistence and two-device notification/preference behavior; real Stripe return;
NVDA/VoiceOver announcement and keyboard walkthrough. Unit driver stubs and synthetic browser
providers do not establish those integrations. Feedback notifications and retention cleanup
remain undefined follow-up scope; only the nine agreed event types and newest-50 reads ship.
