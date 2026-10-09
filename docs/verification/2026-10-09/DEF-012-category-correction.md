# DEF-012: Catalog category data correction

Read-only inspection on 2026-10-09 found column S correctly named `category`,
but all seven published records store an empty category or `Uncategorized`.
The existing mapper and isolated repository/API/card/filter checks preserve
valid categories. Other populated fields do not establish a course category.
The current reported symptom is therefore confirmed as incomplete catalog data,
not a valid category being lost in transit.

## Approved correction - applied 2026-10-09

| Course | Current stored category | Approved category |
| --- | --- | --- |
| ISTQB Foundation 4.0 | Empty | Software Testing |
| ISTQB Test Automation Engineer | Uncategorized | Automation Testing |
| Automation with Playwright | Uncategorized | Automation Testing |
| Fundamental Postman | Empty | API Testing |
| Advanced Playwright and AI | Uncategorized | Automation Testing |
| ISTQB Advanced Test Analyst | Empty | Software Testing |
| Automation with Leapwork | Uncategorized | Automation Testing |

The correction script resolves stable IDs, checks titles/status and the category
header, aborts on duplicate/missing/changed records or an already assigned different
category, and backs up previous values before writing. It writes only column S
for these records and verifies all other sheet values and headers are unchanged.
No draft, ownership, lesson, media, enrollment or account data is changed.

```bash
npm run api:build
node scripts/correct-def-012-categories.mjs
# After explicit approval of the above shared-data corrections:
node scripts/correct-def-012-categories.mjs --apply
```

The user explicitly approved these seven shared category corrections on 2026-10-09.
The apply command completed and verified all other sheet values/header remained
unchanged. A fresh dry-run found no remaining changes; the hosted API returned
the corrected categories. See [verification](remaining-defects.md).
The default command remains read-only.
Sheets has no atomic compare-and-set; avoid concurrent catalog editing during
the approved correction. The script rechecks the sheet before writing and aborts
if it changed. It saves the correction backup in ignored local scratch storage.

After application, verify the public API DTO and published catalog's category
labels/filter; publishing updated application code is a separate action.

Delivery record/script commit: `79c2ea5fd2721594f4b1f2c603982d80ef909bce`. Resolved 2026-10-09.
