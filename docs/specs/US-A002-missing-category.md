# US-A002: Warn about a missing category before publication

## Record

- Story: US-A002-AC01/02. Owner: Claude Code (frontend only; no API change).
- State: In progress, selected 2026-10-13 by the lead as the first open story in backlog order.
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
find the course and that the category is set under "Catalog details" on the course page.
"Publish anyway" publishes; Cancel changes nothing. A course with a category publishes
as before, without a question.

## Scenario map

| Scenario | Check |
| --- | --- |
| US-A002-AC01 Missing category | to be recorded |
| US-A002-AC02 Assigned category | to be recorded |
