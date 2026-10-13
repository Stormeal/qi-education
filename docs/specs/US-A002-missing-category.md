# US-A002: Warn about a missing category before publication

## Record

- Story: US-A002-AC01/02. Owner: Claude Code (frontend only; no API change).
- State: Done locally 2026-10-13 (delivery commit: the `feat(US-A002)` commit in this file's history). Selected by the lead as the first open story in backlog order.
- Source: DEF-012 (seven published courses had no category, so the filters missed them).

## Decisions (confirm or change)

The story left three decisions open. The lead took the story's own proposal:

- **Warning, not blocking.** An admin who presses "Publish revision" on a course without a
  category is asked first and can still publish.
- **"Uncategorized" means no category.** It is the stored default, so it is never treated
  as a deliberate choice.
- **Courses already published are left alone.** The question appears only at publication.

## Behavior

In the course editor's Publishing step, "Publish revision" on a course whose category is
"Uncategorized" opens the app's confirm dialog. It says that category filters will not
find the course and that the category is set under "Catalog settings" on the course page.
"Publish anyway" publishes; Cancel changes nothing. A course with a category publishes
as before, without a question.

## Scenario map

| Scenario | Check |
| --- | --- |
| US-A002-AC01 Missing category | `course-review.spec.ts`, "US-A002 missing category": asks first, Cancel sends nothing, "Publish anyway" publishes. Browser, in-memory API, demo admin: the dialog opened with focus on Cancel; Cancel left the course "Ready for review" and returned focus to the button; "Publish anyway" published it |
| US-A002-AC02 Assigned category | Same spec: no question for a categorized course or for other decisions. Browser: a second waiting course was given "API Testing" in Catalog settings, published without a question, and appeared in the catalog under the "API Testing" filter with that label |

Not verified: hosted behavior, a screen reader. The dialog could not be captured as a picture
(the browser pane drew it tiled); its text and focus were read from the page instead.
