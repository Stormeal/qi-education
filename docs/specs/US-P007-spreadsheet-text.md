# US-P007: Literal spreadsheet text

State: In progress (spreadsheet half). Owner: Codex. Branch/base: main / f8d4c2f.
Selected 2026-10-09. Related investigation: INV-009. Claude owns HTML/editor scope.

US-P007-AC03/04: user text including `=1+1`, `+1`, `-1`, `@name`, and `007`
round-trips unchanged through auth, course and feedback repositories. All eight
user-data append/update paths use RAW. Existing row serializers/parsers and
API response shapes remain intact. Header writes already use RAW.
The current tree has nine data writes (two auth, five course, two feedback),
rather than the audit's eight; all nine are covered.

- [x] Reproduce formula evaluation and numeric coercion using an isolated Sheets
  emulator which models USER_ENTERED versus RAW.
- [x] Change input mode for nine writes, without changing shared data.
- [x] Verify create/update/enrollment/triage round trips and full API regressions.

Promoted INV-009 to DEF-P007-SHEETS. Five RED-to-GREEN cases in
`spreadsheetText.test.ts`: `=1+1`, `007`, `+01`, `-01`, `@name` preserve display
name, course title and feedback text through create and subsequent writes;
feedback issue URL also remains literal. All nine data calls assert RAW.
Combined-tree verification: 316 API / 128 frontend tests, six role-journey checks,
API and Pages builds pass on 2026-10-09. Delivery commit pending.

Existing shared formula cells are not repaired. Real provider round trips remain a
disposable spreadsheet release check. Delivery evidence/commit pending.
