# DEF-008/011/012/013 verification

Date: 2026-10-09. Owner: Codex. Branch: `main`. Base: `797d55c`.
Implemented and checked at app/root version 0.1.49. Fix commit pending.
Contract: [RD-01-06](../../specs/DEF-008-011-012-013-remaining-defects.md).

## Reproduction and regression evidence

| Scenario | Evidence | Outcome |
| --- | --- | --- |
| RD-01 | `api/src/requestErrors.test.ts`: real HTTP malformed JSON on login/auth/API aliases | Four cases failed with 500 before the fix; safe 400 after it |
| RD-02 | Same file: 2 MiB + 1 thumbnail, 25 MiB + 1 attachment, both route aliases; oversized JSON | Five cases failed with 500 before the fix; 413 after it; no course/content/asset writes |
| RD-03 | Same file: validation, SVG upload, unexpected provider error, invalid gzip/charset/content encoding | SVG thumbnail initially returned 400; corrected to 415. Three encoding cases failed with 500, then returned safe 400/415. Application errors with parser-like fields retain 500 |
| RD-04 | `learning-progress.spec.ts`: real router Home/workspace and real learning/navigation controls | Two regressions failed before removing unfinished controls; pass after removal |
| RD-05 | `catalogData.test.ts`, `courses-page.spec.ts`, live read-only row inspection and approved correction | Valid column-S category survives repository/API/card/filter; empty legacy rows retain fallback. Seven shared categories corrected and verified |
| RD-06 | Rendered browser layout regression below, screenshots and carousel controls | Failed before correction; all seven tested widths pass after correction |

Parser responses expose only safe `message` strings; Zod keeps its compatible
`issues` response. Status classification happens only at the parser callback,
so unexpected application/storage failures cannot masquerade as input errors.
Tests use disposable repositories and disabled media/GitHub services.

## Catalog reproduction and browser walkthrough

The original reports [#42](https://github.com/Stormeal/qi-education/issues/42) and
[#44](https://github.com/Stormeal/qi-education/issues/44) contain no specific course
record or viewport. Representative fixtures included a two-line title, a longer
multi-line title, an unbroken title, Premium/Bestseller/rating/count badges and a
price. These reproduce badge clipping and title truncation without assuming the
historical report's exact record. Featured and list cards now fit their content;
badges wrap and long words remain inside their cards.

The [read-only rendered layout check](catalog-layout-check.js) checks title
scroll dimensions, badge scroll dimensions, and title/badge/price bounds inside
each card. [Before](catalog-layout-before.json): six clipping/truncation failures
at 390 px. [After](catalog-layout-after.json): no failures at 320, 390, 860, 980,
1200, 1210 and 1440 px. Manual screenshots confirm readable layout:

- [Desktop before](catalog-before-desktop.jpg) and [after](catalog-after-desktop.jpg).
- [Mobile before](catalog-before-mobile.jpg) and [after](catalog-after-mobile.jpg).
- [Home availability](home-controls-fixed.jpg) and [workspace availability](workspace-controls-fixed.jpg).

Pointer category selection reduced Browse results to the one API Testing fixture;
its card retained the correct label. Enter opened its real detail route. A six-course
fixture verified next-carousel movement and keyboard previous movement, with no
layout failures after animation. A two-line card's title and badges remained
readable. Home has no Adjust track action; workspace has no Q&A/Notes or fake
Overview button. Course description remains readable and Enter opens the quiz.

Browser used a disposable in-memory API and explicitly pinned local API config
before app startup. Browser console showed only `http://127.0.0.1:3001` API order
and no warnings/errors during the recorded walkthrough. Temporary index override
was restored before production builds. Restarting the test API invalidated its
old generated user session; signing into the new disposable fixture worked.

## Approved category repair

Read-only inspection found all seven published category cells empty or already
Uncategorized. There was no evidence of a valid stored category being lost.
The user explicitly approved the seven mappings on 2026-10-09. See the
[reviewed correction](DEF-012-category-correction.md),
[before values](category-correction-before.json) and
[fresh verification](category-correction-verified.json).

`node scripts/correct-def-012-categories.mjs --apply` returned
`applied-and-verified`. It wrote only S3/S4/S5/S6/S7/S9/S10, backed up old values,
and reread the sheet to verify every other field/header was unchanged. A fresh
dry-run found zero remaining changes. A read-only GET of the hosted catalog API
returned the seven approved categories. No other shared writes were performed.

Nine isolated correction-script checks cover dry-run, exact seven-cell writes,
idempotent replay and aborts for category/title/status/header/duplicate/concurrent
changes and backup failure. These checks use a disposable Sheets boundary with
no network access. The script remains dry-run by default; new shared repairs
require explicit selection/approval.

## Full checks and review

| Command | Fresh result at 0.1.49 |
| --- | --- |
| `npm.cmd run api:test` | 222 tests / 11 files pass |
| `npm.cmd --prefix app test -- --watch=false` | 101 tests / 11 files pass |
| `npm.cmd run api:build` | Pass |
| `npm.cmd run app:build` | Pass |
| `npm.cmd run app:build:pages` | Pass; SPA 404 fallback generated |
| `git diff --check` | Pass |

Existing course-builder (14.35 kB) and learning stylesheet (14.00 kB) budget
warnings remain; builds pass. Existing jsdom scrollTo notices remain; tests pass.
Fresh read-only independent review found no Critical, Important or Minor issues
and no behavior declined within scope. Reviewer independently ran all 26 new API
checks successfully. No further product changes followed the review.

## Delivery and release boundary

Local fix commit pending. Resolution documentation will record that hash after
delivery. The approved category data repair is already applied to the shared
sheet and observable in the hosted API. Application code has not been pushed or
deployed. Hosted frontend checks after deployment and live upload/storage provider
checks remain separate release work. INV-001-004 remain unconfirmed investigations;
no new career track, Q&A, Notes or reliability feature was selected.
