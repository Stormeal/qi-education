# X8 — Performance and security audit, 24 October 2026

Read-only audit by Codex. **Nine ranked findings: 2 P1, 5 P2, 2 P3. Five are reproduced
defects (DEF-059–DEF-063); four are measured/source-supported growth or resource-budget risks.**
No application fix, dependency update, shared-service operation, push or deployment is included.
Severity follows `docs/defects.md`; a risk is not a demonstrated hosted incident.

## Scope and evidence

Required commit `6de6283` is present and an ancestor of `main`; the starting tree was clean.
Source references below are against that commit unless stated otherwise. Read `AGENTS.md`,
the assignment rules/X8 brief, architecture/business rules, relevant area specifications,
X3 (`docs/audits/2026-10-api-audit.md`, source `546a2d4`) and changes since that source.
Extra attention covered organizations, invitation recovery, milestone requirement versions,
Rise/SCORM import, assigned teachers, CV parsing and frontend rendering/storage/request flows.

Claude concurrently delivered `ee9811e` / `42406c0` (all-careers map). Their API source is
unchanged; the new map/helper/template were also inspected for rendering and request effects.
The Pages measurements below include `42406c0`. Application source was never edited by this audit.

Probes used Node 22.13.0/npm 10.9.2 on Windows, `NODE_ENV=test`, in-memory repositories,
in-memory Mongo collection doubles, synthetic accounts/files and stub transports. The shared
service opt-in was removed from probe processes; `.env` and real secrets were not read.
HTTP fixtures used ephemeral loopback ports, never 3001/4200. No real MongoDB, Stripe, Mux,
Brevo, Google or GitHub calls were made. Local Git remote-tracking state was inspected without
fetching. Temporary probes/logs live outside the repository and are not committed.

Evidence labels distinguish HTTP reproductions, original-component/method probes, counting
doubles, source inspection and local timings. None establishes a production incident or
deployed query plan. The route inventory contains **107 canonical method/path pairs / 214
plain and `/api` variants**, up from X3's 78/156.

## X3 disposition — not counted again as X8 findings

| X3 item | Current disposition |
| --- | --- |
| DEF-047 stale reset/password change | Fixed by atomic expected-credential replacement (`ff6f4a8`); current reset/change tests remain in the suite. |
| DEF-048 hosted console mail | Fixed by common hosted-mode policy (`c764add`); hosted mail fails closed instead of printing bearer links. Hosted configuration was not inspected. |
| DEF-049 provider exception logs | Fixed by allowlisted diagnostics (`05ef437`); `errorLogger.ts` excludes messages, arbitrary causes/headers and provider objects. |
| DEF-050 cross-instance duplicate purchase alert | Fixed by atomic enrollment classification (`57ba355`, subsequent replay correction); existing multi-instance payment tests cover it. |
| DEF-051 full course JSON limit | Fixed (`6f4f53a`): content PATCH accepts 4 MiB; other JSON remains 100 KiB. |
| DEF-052 malformed token signature | Fixed (`e0b94ff`): canonical signature syntax and byte length checked before constant-time comparison. |
| R1 missing supporting indexes | **Still holds:** progress `userId`, reset/confirmation `tokens.hash`, change-log ordering and career-selection `pathId` declarations remain absent. Auth/catalog index initialization is still lazy. Detailed inventory below; installed indexes unknown. |
| R2 unbounded lists / N+1 | **Still holds:** admin users, catalog, careers, instructor lists and Sheets feedback remain unpaged/full reads; instructor account fan-out remains. Catalog metadata-only `$in` overlay and request/recent read reuse are present and must not be mistaken for full-content-per-course queries. Organization hot paths are a new extension, F6 below. |
| R3 charge range mismatch | Addressed by `f368530`: price setting is 0 or 3–999,999 DKK; checkout independently validates stored prices (`course.ts:74`, `paymentRoutes.ts:112`). Merchant/provider limits remain an integration check, not a new defect. |
| INV-003 / INV-004 | Account uniqueness/atomic enrollment has fake-backed evidence; real indexes/failover remain unverified. Feedback issue creation versus link persistence still has the documented restart/cross-instance gap, with two expected-failure tests. No duplicate DEF added. |

The two accepted API production dependency entries (Zod/body-parser) remain a separate release
decision in `docs/audits/2026-10-dependencies.md`, US-P018-AC04. X8 neither fixes nor re-accepts
them. Other dependency findings are not duplicated here.

## Findings ranked by severity

| Rank | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| F1 / DEF-059 | P1 | Rise import reads/uploads files outside the export folder | Actual filesystem read, stub upload |
| F2 / DEF-060 | P1 | Interrupted invitation recovery can undo a later member removal | HTTP, both prefixes, restored paid content access |
| F3 / DEF-061 | P2 | Invitation consent can display organization A while submitting token B | Original component methods, controlled response ordering |
| F4 / DEF-062 | P2 | Retired action ID can acquire a different qualification meaning | HTTP, three publications, both prefixes |
| F5 / DEF-063 | P2 | One unrelated thumbnail can hold initial editor content behind the catalog | Original methods, controlled pending response |
| F6 | P2 growth risk | Organization reads and DTO fan-out multiply global collection transfers | Real adapters/services with counting collection doubles |
| F7 | P2 availability risk | Synchronous password work blocks the Node event loop | Real hashing functions/local timing; no hosted load test |
| F8 | P3 resource-budget risk | CV compressed byte limit does not bound parser expansion/work | Small controlled DOCX expansion; no freeze/OOM |
| F9 | P3 startup/download cost | Broad API SDK imports and large lazy media/parser chunks | Fresh-process local timings, production build and source graph |

### Follow-up, 24 October 2026 (Claude)

Every ranked item has been acted on; each commit has a regression test.

| Item | Result |
| --- | --- |
| DEF-059 | Fixed `07e8424`: media paths must resolve (links followed) inside the real assets folder. |
| DEF-060 | Fixed `a1af77e`: removal or leaving closes a half-finished join first. |
| DEF-061 | Fixed `a65bfa0`: a stale invitation check is ignored. |
| DEF-062 | Fixed `2fc9580`: careers keep `publishedActions`, every action identity ever published. |
| DEF-063 | Fixed `a65bfa0` (content no longer waits for thumbnails) and `3f2c608` (at most four thumbnail downloads at once, 20 s limit each). Visible-only loading not done. |
| F6 | `e88d785`: organization reads query by `_id`, token hash or `orgId` (new `orgId` indexes on memberships and course requests); prices read once per answer. Not done: one account read per listed member; real Atlas query plans not checked. |
| F7 | `e345cfd`: login, signup, password change and reset use async scrypt; other requests keep running. No admission queue beyond the thread pool (4 by default); no load test. |
| F8 | `8548e70`: PDFs over 20 pages and text over 200,000 characters are refused with a message. A DOCX is bounded only after parsing. |
| F9 | `672b3da`: `googleapis` loads on first Sheets use. Fresh-process import of the built server went from about 1.8 s / +121 MiB to about 0.55 s / +52 MiB (local Windows, 3 runs each); Vercel cold start not measured. Stripe and Mux stay eager (small in memory). Frontend chunks unchanged (already lazy). |

### F1 / DEF-059 — Import paths escape the supplied Rise folder

Locations: `api/src/riseImport.ts:75`, `:127–137`, `:153–155`; actual reads/uploads
`api/src/riseImportRun.ts:48`, `:83`, `:110`.

Media keys from `runtime-data.js` are decoded and joined to `scormcontent/assets` without a
containment check. `stat` follows the escaped path; the importer later reads and uploads it.
An operator importing an attacker-influenced export can unknowingly transfer a readable local
file into authenticated course storage or the media-upload boundary. This is not a remote API
file-read endpoint; operator import is required, and attacker access to the resulting private
draft was not established.

**Reproduce:** create `<temp>/private-marker.txt` with `X8_OUTSIDE_EXPORT_CANARY`, alongside
`<temp>/export/scormcontent/assets`. In the normal base64 `__jsonp("runtime-data.js", …)` JSON
wrapper, create an attachment whose `media.attachment` is:

```json
{"key":"..%2F..%2F..%2Fprivate-marker.txt","originalUrl":"notes.pdf","mimeType":"application/pdf"}
```

Call `planRiseImport(exportFolder)`, then `runRiseImport(plan, options)` with actual file reads
and a fetch stub supplying synthetic login/create/content/upload replies. Observed:
`problems: []`, planned file `..\private-marker.txt` relative to export, `attachmentsUploaded: 1`,
and upload bytes exactly `X8_OUTSIDE_EXPORT_CANARY`; **zero provider requests**. Video and
cover paths have the same unchecked join pattern, although only the attachment was exercised.

**Suggested fix:** validate canonical paths against canonical export/assets roots before
stat/open; reject traversal, drive/UNC and symlink escapes. Couple validation to opening the
file so a check/read substitution cannot cross the boundary. Add attachment/video/cover
containment regressions. No fix implemented.

### F2 / DEF-060 — Recovery can restore a membership explicitly removed by its owner

Locations: `api/src/organizationService.ts:208–209`, `:223–237`, `:279–291`.

Acceptance first persists an accepted invitation with `joining: true`, then inserts membership,
then clears `joining`. Recovery permits that accepted token for the same `acceptedBy` account.
Removal deletes membership without retiring this outstanding claim. Acceptance and removal
use different lock keys (`join:<userId>` versus organization ID), so durable recovery cannot
distinguish an insertion that never happened from membership deliberately revoked later.

**Reproduce, root and `/api`:** create an isolated organization/owner/invitee and published
499-DKK course. Throw once just before the final `updateInvitation(..., {joining:false})`.
Acceptance returns **503**, but active membership and accepted/joining invitation remain.
Owner approves a paid-course add-on, then removes the member: **204**, stored membership
`null`. Replay the same token as the removed account: **200**, active membership is recreated.
The old approved add-on applies again; enrollment and reading its private paid lesson both
return **200**, without another invitation or purchase.

Expected: removal revokes organization access, and an old single-use invitation cannot undo
that explicit action (organization specification, Rules/Course access). This is a concrete
revocation failure after a recoverable storage error, not a guessed multi-instance race.

**Suggested fix:** persist an acceptance identity/revocation generation and coordinate removal
with recovery. A retry must respect explicit revocation while still recovering an insertion
that genuinely never completed. Add the interrupted-accept → approve → remove → replay case
before changing recovery. No fix implemented.

### F3 / DEF-061 — Displayed invitation and submitted token can diverge

Locations: `app/src/app/pages/join-organization-page/join-organization-page.ts:49`, `:53`,
`:67–69`, `:82`.

`openNewLink()` changes `this.token`, but an older `check()` can still replace `invitation` and
set the page ready. `accept()` independently submits the current token. An invitee can therefore
confirm the organization/consent for A while joining B. The organization specification requires
the displayed organization to identify with whom progress will be shared.

**Reproduce:** invoke the original imported component methods with Angular signals and a
service stub. Start check A; open link B; resolve B success, then older A success; invoke accept.
Both invitations use the same synthetic email, so the wrong-account guard does not help.
Observed: `organizationName: "Organization A"`, `consentText: "Sharing with A"`, ready state,
current token B; service receives `accepted: ["B"]`. This is a component-method race, not a
browser end-to-end test; actual membership/disclosure was stubbed.

**Suggested fix:** bind each result and acceptance to a captured token/generation; ignore stale
successes, failures and storage cleanup. Submit the token associated with the displayed valid
invitation. No fix implemented.

### F4 / DEF-062 — An action ID can change meaning after one publication gap

Locations: `api/src/careerPath.ts:70–75`, `api/src/server.ts:1492–1495`,
`api/src/accountCareers.ts:86–92`.

The identity guard remembers actions in only the immediately previous publication and currently
published other careers. Requirement history stores bundles, not lifetime action definitions.
An action removed for one revision can therefore return under a different title/kind/course,
reinterpreting retained learner evidence. This violates the documented rule that a published
action ID keeps its meaning and changed evidence needs a fresh ID.

**Reproduce, root and `/api`:** publish exam `audit-old`, “Original Foundation Exam”; learner
follows and declares it. Publish an intermediate revision using only `audit-gap`, with a change
note. Publish a third revision reusing `audit-old` as “Entirely Different Advanced Exam”, with
a change note. All saves/publications return **200**. The learner's unchanged old declaration
now yields `milestoneStates: {"audit-step":"achieved"}` for the different qualification.

**Suggested fix:** atomically validate against a durable immutable registry of every published
action identity, including retired/withdrawn actions. Preserve evidence; require a new action
ID for changed qualifications. No fix implemented.

### F5 / DEF-063 — Editor hydration waits for unrelated catalog thumbnails

Locations at audit base: `app/src/app/services/app-state.service.ts:2470–2474`, `:297–301`,
`:2502`; `app/src/app/services/course.service.ts:156–183`;
`app/src/app/services/api-client.service.ts:33–69`.

Catalog hydration awaits `Promise.all` for every course thumbnail before selected content is
loaded. An early direct-editor content attempt has already exited while its course was absent
from the catalog. One unrelated slow image can keep editor content unavailable and catalog
loading true; the API client supplies no default deadline. The number of simultaneous image
downloads also grows with the complete catalog.

**Reproduce:** extract and transpile the unchanged `preloadCourseThumbnails` and
`loadCoursesWhenNeeded` methods; supply fake signals/API, current path `/courses/selected/edit`,
100 courses and valid session. Hold only thumbnail `unrelated-99` pending. Observed:

```json
{"phase":"one_unrelated_thumbnail_pending","thumbnailRequests":100,"contentLoads":0,"coursesLoading":true}
{"phase":"thumbnail_released","thumbnailRequests":100,"contentLoads":1,"coursesLoading":false}
```

This controlled method probe demonstrates the dependency barrier, not browser network timing.
At the 2 MiB image limit, 100 thumbnails could total about 200 MiB; that upper-bound download
was not performed. Existing object-URL/in-flight image deduplication avoids repeat image bodies
within the session, but does not remove this first-load barrier.

**Suggested fix:** load selected content independently first, fetch visible images, cap image
concurrency and add cancellation/deadlines. Regression should hold an unrelated image pending
and prove selected editor content still loads. No fix implemented.

### F6 — New organization paths multiply full-collection reads

Locations: `api/src/organizationRepository.ts:93–107`, `:137–158`;
`api/src/organizationService.ts:125–127`, `:269–276`, `:317–347`, `:359–361`.

The generic Mongo store always issues `find({}).toArray()`. ID, token hash, user, organization
and state selection happens afterwards in JavaScript. Built-in `_id` and the declared unique
token-hash index do not help these reads. A public valid-shaped invitation check can scan every
invitation. Protected content requests recompute organization entitlement through global
membership scans; DTO assembly repeats scans per organization/member/request.

Counting doubles ran the real Mongo adapter/service with 100 organizations, 10,000 memberships,
10,000 invitations, 100 approved requests for the subject user and 50 prices. All recorded find
predicates were `{}`:

| Operation | Observed database-document transfers / extra lookups |
| --- | --- |
| `getMembership('u0')` | 10,000 memberships to return one |
| `findInvitationByTokenHash('h0')` | 10,000 invitations to return one |
| `learnableOrgCourseIds('u0')` | 20,000 memberships, 100 organizations, 100 requests; one account and one catalog read |
| `listOrganizations()` | 100 organizations plus **1,000,000 memberships** across 100 membership scans |
| `listMembers('u0','o0')` | 20,000 memberships, 100 organizations and **101 account ID reads** for 100 members |
| `listCourseRequests('u0','o0')` | 10,000 memberships, 100 organizations, 100 requests and **100 price reads / 5,000 price documents** |
| `myOrganization('u0')` | 20,000 memberships, 200 organizations, 200 requests and **101 price reads / 5,050 price documents** |

These are deterministic adapter counts, not measured Atlas latency or a confirmed production
timeout. This new organization hot path extends X3 R2; old catalog/admin full reads are not
counted again. Suggested fix: direct indexed lookups, scoped/cursor-bounded queries, grouped
counts, batched projected accounts and one price snapshot per response. Preserve fresh
authorization across mutations; do not hide revocation behind a long-lived entitlement cache.

### F7 — Password work blocks all requests on the same Node event loop

Locations: `api/src/auth.ts:61–64`, `:72–82`; login `api/src/server.ts:642`, signup `:688`;
password-change/reset paths reuse the same helpers.

Password derivation and verification call `scryptSync`. The per-address sign-in limit is useful
but is not a global or per-client CPU/concurrency limit; public login requests against different
known accounts still occupy the function's event loop. A burst delays unrelated health/content
requests sharing that process. This concern was not a ranked X3 finding.

Local probe: **20 real password checks took 1,246.5 ms; a zero-delay timer fired after 1,247.1 ms**.
Six wrong-password logins for a known demo account returned 401 in 64.6–88.4 ms; six absent
accounts returned the same 401 in 1.8–4.8 ms because verification is skipped. This is a local
timing observation, not a load capacity estimate or new account-disclosure claim (signup already
intentionally reports duplicates). No denial of service was attempted against any hosted server.

Suggested fix: asynchronous scrypt/worker work with a bounded admission queue and per-client
abuse protection, retaining the existing per-address policy and generic error responses.
Measure concurrency/latency with a disposable load fixture before choosing limits. No DEF is
assigned without a specified/observed application availability failure.

### F8 — CV compressed-size guard does not bound expanded work

Locations: `app/src/app/services/cv-text.service.ts:19`, `:34–42`, `:50`.

The app checks the file's 10 MiB compressed byte size, then PDF extraction walks every page and
collects text; DOCX extraction has no application expanded-text/XML, deadline or cancellation
budget. A controlled **5,031-byte synthetic DOCX extracted 4,194,306 characters in 41 ms** using
the installed Mammoth parser. This proves amplification, **not** browser freeze, OOM, script
execution or disclosure; the probe used Mammoth's Node buffer entry point. No DEF assigned.
Suggested hardening: bound expanded bytes/text/pages, expose cancellation and refuse excessive
documents with an actionable message. Rise video upload also buffers the whole largest video
(`riseImportRun.ts:48,110`); no large-video memory failure was attempted.

### F9 — Startup and optional feature downloads have material cost

Locations: `api/[...path].ts:1–3` → `server.ts` → `feedbackRepository.ts:12` →
`googleSheets.ts:2` (aggregate `googleapis`), plus `paymentService.ts:2`, `muxService.ts:1`,
`mongo.ts:1`. All enter the server module graph even for a non-provider route. Provider
connections are still configured/lazy; Mongo and Sheets client reuse are present.

Three fresh isolated Node processes importing built `server.js` took **1,731 / 1,697 / 1,713 ms**,
with RSS **168 / 168 / 167 MiB**, increases **122 / 122 / 121 MiB** over their pre-import state.
This measures local module loading, not Vercel cold starts, provider connection establishment or
request latency. Suggested fix: profile narrower/lazy provider imports and compare the same
fresh-process benchmark; retain connection reuse.

Pages build at `42406c0`, version 0.1.449:

| Output | Raw size | Estimated transfer | Attribution |
| --- | ---: | ---: | --- |
| Initial total | **463.62 kB** | **115.84 kB** | Angular/runtime + eager app/state/service graph; largest initial chunks 255.59 and 142.60 kB; CSS 32.75 kB. |
| `chunk-NGL2OYP4.js` | **1.06 MB** (1,059,781 bytes) | **241.70 kB** | Built strings identify Mux player/video and HLS implementation; media feature chunk. |
| `chunk-KD7MLPTA.js` (`pdf`) | **432.87 kB** | **108.70 kB** | PDF.js; loaded dynamically by CV PDF extraction. Worker is a separate copied asset, not included in initial total. |
| `chunk-AKHOVVVQ.js` (`index`) | **324.27 kB** | **85.25 kB** | Mammoth/DOCX parsing; dynamic CV import; CommonJS dependencies explain build warnings. |
| Course editor route | 188.48 kB | 33.79 kB | Builder/editor UI and feature code; shared media imports are additional. |
| Admin route | 143.65 kB | 28.86 kB | Admin feature UI. |
| Course view route | 134.64 kB | 25.64 kB | Learning/course UI; shared media imports are additional. |
| Career route | 106.04 kB | 22.68 kB | Career page/editor/map feature UI. |

These are Angular build estimates, not observed network compression or a sum of every chunk
needed by a route. Optional parser/media chunks are **lazy**, not a 1 MB initial-JavaScript
regression. Keep them lazy, measure actual feature navigation, and investigate media/tree
shaking or narrower parser packaging before changing the bundle. No DEF or hosted latency
claim is assigned merely for a chunk size.

## Mongo query and index inventory

This inventory groups repeated single-document operations with the same access pattern; each
source query family is accounted for. `_id` means MongoDB's built-in index. Existing index
declarations are not proof that a deployed index exists. An unfiltered full read needs bounded
query design; adding an index alone does not bound it.

| Query location | Filter/order | Declared support / missing support |
| --- | --- | --- |
| `mongoAuthRepository.ts:30,67,72,86,91,96,105` | `_id` account reads/mutations plus status, enrollment or credential guards | `_id` sufficient. |
| `mongoAuthRepository.ts:34` | normalized email | Unique `{email:1}` at `:20`, initialized lazily on create `:45–47`. |
| `mongoAuthRepository.ts:38` | full account list | X3 R2: projected server-side search/page needed; no index fixes unfiltered materialization. |
| `mongoAuthRepository.ts:41` | `enrolledCourseIds:courseId` count | Multikey `{enrolledCourseIds:1}` at `:21`, lazy create initialization. |
| `mongoCourseRepository.ts:26,30` | all courses, `{createdAt:1,_id:1}` sort | Matching index declared, lazy create; still unpaged (X3). |
| `mongoCourseRepository.ts:51` | `_id` update | `_id` sufficient. |
| `courseContentRepository.ts:55,59,89,104,123,130,139` | content read/write/delete by `_id` | `_id` sufficient; full read includes live/working snapshots. |
| `courseContentRepository.ts:64` | `_id:{$in:courseIds}`, metadata projection | `_id` sufficient; batched projected catalog overlay already present. |
| `courseAssetRepository.ts:73,98,129,137,143,151` | asset `_id`, optional course/component guards | `_id` sufficient; ownership metadata projections omit binary. |
| `learningProgressRepository.ts:26` | `find({userId})` | **Missing `{userId:1}`**, X3 R1. |
| `learningProgressRepository.ts:29,42,46` | encoded account/course `_id`, add-only guards | `_id` sufficient. |
| `lessonNotesRepository.ts:56,65,71,78,84` | account/course `_id`, note-ID/array-cap guards | `_id` sufficient; 500-note document bound. |
| `accountProfileRepository.ts:44,53,58` | account `_id` | `_id` sufficient. |
| `instructorProfileRepository.ts:27,36,41,51` | account `_id` | `_id` sufficient. |
| `instructorProfileRepository.ts:47` | full profile list | X3 R2; page/batch corresponding account reads. |
| `accountCareersRepository.ts:20,26,31,40` | account `_id`, version CAS | `_id` sufficient. |
| `careerPathRepository.ts:41` | full paths, drafts and published content | X3 R2; project/select/page according to endpoint. |
| `careerPathRepository.ts:47,50,62,73,77,86,90` | career or account-selection `_id`, CAS guards | `_id` sufficient. |
| `careerPathRepository.ts:94` | selection `countDocuments({pathId})` | **Missing `{pathId:1}`**, X3 R1. Admin fans out one count per path (`server.ts:1410,1463`). |
| `passwordResetRepository.ts:47,79,85` | account `_id`, version CAS | `_id` sufficient. |
| `passwordResetRepository.ts:53,58`; `emailConfirmationRepository.ts:13–16` | `findOne({'tokens.hash':hash})` in two collections | **Missing multikey `{'tokens.hash':1}`** in each, X3 R1. |
| `userChangeRepository.ts:43` | all, sort `{at:-1,_id:-1}`, limit 50 | **Missing `{at:-1,_id:-1}`**, X3 R1. |
| `paymentRepository.ts:68,72` | session `_id`, refund guard | `_id` sufficient. |
| `paymentRepository.ts:78` | user/course/unrefunded, excluded session, sort `{paidAt:1,_id:1}` | Existing `{userId:1,paidAt:-1}` narrows user but does not fully cover new refund query. Consider `{userId:1,courseId:1,paidAt:1,_id:1}`; validate plan before optional partial-index design. |
| `paymentRepository.ts:81,85` | user, sort paidAt descending | `{userId:1,paidAt:-1}` matches; new purchase list `:85` is unpaged. |
| `signInAttemptRepository.ts:97,105`; `clientLimitRepository.ts:29` | `_id` atomic/CAS limits | `_id` sufficient; expiry TTL indexes declared at `:84` / `:50` for cleanup. |
| `courseMutationLock.ts:68` | all outstanding locks, bounded 5 s operation | Full list intentional; page/bound if count grows. |
| `courseMutationLock.ts:88,92,117` | lock `_id`, owner/acquiredAt guards | `_id` sufficient; reused by career/org lock adapters. |
| `databaseBackup.ts:81,161,189` | streamed full export / target counts | Intentional maintenance scans, not HTTP lists; restore recreates captured indexes at `:193`. |

Organization reads currently use `{}` and JavaScript filtering. The suggested indexes below
only become useful after moving those predicates into database operations:

| Organization collection / location | Current logical predicate | Existing support / needed query support |
| --- | --- | --- |
| requests `organizationRepository.ts:137` | user, pending first/latest submittedAt | Partial unique `{userId:1}` for pending only (`:93`); add non-partial `{userId:1,submittedAt:-1}` for all-state latest/history. |
| requests `:139` | optional state | Bounded state/order list; e.g. `{state:1,submittedAt:-1,_id:1}` once cursor order is defined. |
| organizations `:143,144` | one ID / all organizations | Direct `_id` lookup needs **no new index**; page lists and group counts. |
| memberships `:147,148` | one user / organization members | User already is `_id`; direct lookup needs **no new index**. Scoped member/count query needs `{orgId:1,state:1}` plus chosen stable page order. |
| invitations `:152` | tokenHash | Unique `{tokenHash:1}` exists (`:96`) but current full scan ignores it; use direct lookup. |
| invitations `:153` | optional org; open/recent/expiry/email lookup | Partial unique `{orgId:1,email:1}` with `open:true` exists (`:95`), not history support. Consider `{orgId:1,createdAt:-1,_id:1}`, and `{email:1,state:1,expiresAt:1}` for pending email lookup after predicate pushdown. |
| course requests `:156` | organization, then subject user/state | Partial unique `{userId:1,courseId:1}` pending-only (`:98`) does not cover approved org entitlements. Scoped `{orgId:1,userId:1,state:1}`; define separate owner-list cursor order. |
| prices `:158` | all prices to maps | Full-map endpoint intentional; one snapshot per response. Single resource already has `_id:kind:resourceId`; no speculative extra index needed. |
| all six `:118,127`; org locks `:173–175` | `_id` conditional writes/deletes/locks | `_id` plus existing unique invariants support these operations. |

## Frontend requests and browser payloads

This is a source-derived request map, not a browser waterfall or asserted exact request count.

| Journey | Requests/work and existing mitigation |
| --- | --- |
| Restored Home | Profile, `/auth/me`, `/users/me/organization`, `/career-paths`, legacy `/users/me/career-path`, `/users/me/careers`, `/courses`, progress, enrolled outlines and eager thumbnails (`app-state.service.ts:380,444–456,690,846,2331,2450–2474` at base). |
| Outlines | Progress service requests one per enrolled course (`learning-progress.service.ts:68–86`); career service independently requests one per available selected-path course (`career-path.service.ts:213–223`). Overlap is not shared; `ApiClientService.fetchJson:79–111` caches completed cacheable responses only, and course responses are no-store. |
| Organization entry | App-state effect and `OrganizationPage.load` both call `mine()` (`organization-page.ts:102`, `organization.service.ts:37`); owner page then loads prices/careers/members/invitations/requests `:107–123`. No common in-flight map shares the expensive duplicate response assembly. |
| Organization mutation | Refresh organization then `/auth/me` (`app-state.service.ts:2340–2345`); server recomputes entitlement again. Cross-endpoint repeated work, not two identical requests. |
| Navigation back to catalog/Home/admin/library | Loader guards concurrent work but not an already loaded catalog; refresh resets/enumerates outlines again. Thumbnail object URLs and pending image reads are deduplicated per session. |
| Admin career editor | `career-path.service.ts:168–171` loads admin paths and courses even if app-state catalog loading overlaps. |
| Selected course content | Pending/loaded-view keys guard duplicate selected content (`app-state.service.ts:2512–2514` at base). Public instructors also have an in-flight flag. F5 concerns catalog image ordering, not absence of every request guard. |

Selected course responses send the entire learner course (`server.ts:906–913`), up to the
accepted 4 MiB save size; lesson navigation does not fetch just one component. Quiz answer keys
and explanations are removed (`courseAccess.ts:29–39`). Outlines are small public projections
(`:21–26`), but are reduced after a full Mongo content read (`server.ts:882–883`); a database
component-ID/outline projection would reduce transfer. `AccountCareersService.completedActions`
(`accountCareers.ts:73–80`) also reads relevant full content documents **serially**. At 50
relevant 3 MiB courses this could transfer about 150 MiB internally; this illustrative scale
was not loaded or timed and predates the new requirement-version feature.

Published careers omit drafts from the browser but return all published content/CV keywords,
routes and up to ten requirement-history versions (`careerPath.ts:175,189–191`). Repository
reads still retrieve drafts internally. The new user purchase list is unpaged but uses safe
DTOs (`paymentRoutes.ts:150–156`). These are payload/projection follow-ups, not new disclosures
or duplicated X3 full-list findings. No large-production-payload trace was taken.

## Security coverage with no additional confirmed defect

| Boundary | Checked result and limits |
| --- | --- |
| Every route / fresh authority | Explicit X1 permission inventory plus current source registration/modules: 107 canonical pairs/214 aliases. Anonymous protected calls, students on admin paths and foreign personal IDs are covered by the existing suite. Authentication rereads current role/status. No newly missing entry guard found. |
| Organization roles/foreign IDs | Current organization membership scopes owner/member reads and invitation/request IDs. Original-owner promotion, active membership, suspension and last-owner guards are present. Exception: recovery/revocation F2. |
| Assigned teachers | Admin-only teacher list/update, max 20 deduplicated teachers, active teacher author access; author assignment is rechecked after acquiring course lock (`server.ts:234–241`). No new foreign-author bypass found. |
| Invitation bearer handling | 32 random bytes, stored SHA-256 hashes, fragment mail links; response DTOs omit hash/recovery internals. Public check uses a network limit before lookup. Fragment is removed via replaceState, temporarily held in `qiPendingOrganizationInvitation` sessionStorage, sent in POST JSON rather than query URLs. Exception: F2 recovery and F3 stale UI result. |
| JSON, params, query | Zod boundaries, explicit scalar identifiers and admin string-search bounds; no caller-supplied Mongo selector object observed. Global parser errors keep safe 400/413/415. IDs used as keys are not automatically an injection vulnerability. |
| SCORM/zip | Import extracts base64/JSON instead of executing runtime-data.js. It operates on an already extracted folder; no SCORM ZIP extractor exists here. F1 is path validation in that folder, not a claimed ZIP-extraction exploit. |
| Lesson/editor HTML | Actual Angular 21 sanitizer + renderLessonMarkdown in JSDOM stripped script/SVG/iframe/event handlers and neutralized javascript href. Output: `<p>hello</p><img src="x"><a href="unsafe:javascript:alert(5)">link</a>`. `inertHtml` alone is a parser, not a sanitizer; final Angular bindings matter. Static icon bypasses found, not untrusted bypasses. |
| Career SVG / concurrent new map | Tree/map direct SVG innerHTML uses numeric geometry and finite milestone states, not unescaped titles. New map selectors use `CSS.escape`; title/detail text uses interpolation. No script injection reproduced. No browser map performance/accessibility pass performed. |
| Attachments/SVG/HTML | API MIME allowlist rejects image/svg+xml and text/html; raw size caps and author/asset/course checks are present. Downloads force attachment disposition; frontend blob anchor sets download. This is not a malware/file-magic scan. No executable uploaded HTML/SVG path established. |
| Sessions | Documented bearer token/account in `qiEducationSession`: localStorage with remember-me, otherwise sessionStorage; logout clears both. Any successful same-origin script could read either. No new same-origin script execution or outbound token leak was found. |
| CV privacy | PDF/DOCX extracts text, snippets render by interpolation, and only confirmed action IDs are posted. No CV file/name/snippet upload found. Resource bounds are F8. |
| Webhooks/payments | Raw signed webhook verification retained; unsigned cases refused in existing tests. Price/session/user/course bindings, foreign receipts, duplicate/replayed sessions and refunds checked against source/current tests. No real provider transport used. |
| CORS | Local Origin `https://audit.invalid` got no Access-Control-Allow-Origin. Course/career responses remain private,no-store with Vary Authorization; auth/me 401 also no-store. CORS is not treated as server-side authentication or a request-blocking firewall. |
| Headers | Local API responses lack CSP, X-Frame-Options, nosniff and Referrer-Policy, and reveal X-Powered-By: Express (`server.ts:166,260`, `vercel.json`). Health has no explicit cache policy; inspected private resource paths do. These are hardening gaps, not an independently reproduced exploit. Hosted gateway/Pages headers were not inspected, so no deployed header claim is made. Consider explicit CSP/frame policy on frontend hosting, nosniff/referrer policy, and removing framework disclosure. |
| Logs/errors/URLs | Current global/provider errors use allowlisted diagnostics; payment alerts log synthetic-safe session/user/course IDs, not card details. Intended local mail output is guarded from hosted mode. Token fragments are not ordinary HTTP query URLs. No real logs inspected; public health reveals configuration names as X3 already noted. |
| Response completion / locks | Required durable writes/provider operations remain awaited before success. Course send is held until lock coordination completes; downloads have no required deferred write. No newly unawaited durable side effect found. Real Vercel suspension/failover was not exercised. |

## Verification and reproducibility

Required checks run sequentially; this report records current results, not a claim that green
tests cover the five newly found cases. No new regression test/probe was committed.

| Check | Result |
| --- | --- |
| `git status -sb`, branch/log/show/ancestor check for `6de6283`, `git log 546a2d4..HEAD` | Required history verified; concurrent Claude commits preserved. |
| `npm run api:build` | Pass. |
| `npm run app:build:pages` | Pass; initial 463.62 kB, largest lazy 1.06 MB; SPA fallback generated. Warnings: learning-page SCSS 14.44 kB over 12 kB budget; Mammoth/CommonJS optimization warnings. |
| `npm run api:test` | Pass: **101 files, 2,568 passed + 2 expected failures (INV-004), 2,570 total**, 59.67 s; shared tree at `42406c0` / version 0.1.449. |
| Global in-memory HTTP/timing probe | 107/214 route inventory; CORS/cache/header observations and scrypt timing above. |
| F1/F2 | Parent independently reran the temporary Rise upload and revoked-member recovery fixtures; observed marker transfer and paid-content access respectively. |
| F3/F4/F5 | Original component/method or root+alias HTTP probes described above; no deployed/browser request. |
| F6/F8/F9 | Counting doubles; bounded DOCX expansion; three fresh Node imports and local production build. |

Probe commands were PowerShell with `NODE_ENV=test` and no shared-service opt-in:

```powershell
node --import ./api/node_modules/tsx/dist/loader.mjs <temp>/x8-org-revocation.mts
node --import ./api/node_modules/tsx/dist/loader.mjs <temp>/x8-action-identity.mts
node --import ./api/node_modules/tsx/dist/loader.mjs <temp>/x8-rise-<id>/probe.mts
node --import ./api/node_modules/tsx/dist/loader.mjs <temp>/x8-invitation-<id>/probe.mts
node --import ./api/node_modules/tsx/dist/loader.mjs <temp>/x8-html-<id>/probe.mts
node --import ./api/node_modules/tsx/dist/loader.mjs <temp>/x8-cv-<id>/probe.mts
node <temp>/qi-x8-<id>/global-probe.mjs
```

Organization counts used a here-string piped to `node --import tsx --input-type=module` in
`api/`, importing the real adapters/services with injected in-memory collections. F5 used
`node --input-type=module` to extract/transpile the two named original methods and control one
pending image promise. Fresh imports used `node --input-type=module`, performance.now and
process.memoryUsage around `import('./api/dist/server.js')`. These temp paths are local audit
artifacts, not permanent test infrastructure; the reproductions above contain their essential
fixtures/barriers. New permanent regressions belong with authorized fixes.

Not verified: real database index installation/explain plans, majority durability/failover,
Vercel cold starts/freezing, production load/latency/memory, hosted proxy/header configuration,
real payment/mail/Mux/Sheets/GitHub operations, browser network/rendering, screen readers or
Linux execution. App unit tests were not requested/run for X8. No secret scanning of ignored
environment files was performed. Suggested changes in api/src, app, indexes or hosting are
follow-up needs only; this audit leaves every finding unfixed.
