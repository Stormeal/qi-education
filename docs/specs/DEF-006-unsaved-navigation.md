# DEF-006 — Warn before discarding course edits

Selected 2026-10-08. Owner: Codex. Branch: `main`. Base: `159f45b`.
Related story: US-T003. User decision: **warnings only**. Local draft recovery
(US-T003-AC03) remains Proposed and is outside this delivery.

Metadata and outline changes are compared with their last saved snapshots.
Guard both creation and existing-course editor routes, including changes of
course ID. Use a native confirmation for in-app navigation and voluntary logout;
use the browser's standard before-unload warning for refresh, closing, and external
navigation. Staying preserves the current editor and edits. Reverted or fully
saved changes do not warn. Expired sessions clear private state without allowing
a confirmation to prevent logout. No API, storage, or migration changes.

```gherkin
Scenario: NW-01 Stay with unsaved edits
  Given I changed course metadata or outline content
  When I use Cancel, another page link, browser Back, or another editor URL
  And I decline discarding my changes
  Then I remain in the current editor with all my changes
  And browser Back keeps its history position for a later confirmed departure

Scenario: NW-02 Discard and navigate
  Given I changed an existing course or a new course draft
  When I confirm discarding changes while leaving
  Then the requested destination opens
  And returning to the editor loads its saved values

Scenario: NW-03 Warn on browser departure
  Given I have unsaved editor changes
  When I refresh, close the tab, or leave the application
  Then the browser offers its standard departure warning
  But unchanged, reverted, and fully saved editors do not warn

Scenario: NW-04 Preserve changes after a failed save
  Given metadata or outline saving fails, including a partial save
  When I attempt to leave
  Then remaining unsaved changes still trigger the warning
  And staying retains the draft and permits retry

Scenario: NW-05 Logout respects user choice and session expiry
  Given I have unsaved editor changes
  When I voluntarily log out and choose to stay
  Then my session and changes remain
  But forced logout after session expiry clears private state without a prompt
```

Implementation checklist:

- [x] Reproduce unguarded routing with real Angular navigation regressions.
- [x] Add route and browser departure guards; avoid clearing drafts before routing.
- [x] Verify save/revert/failure, logout, course-ID changes and browser Back.
- [ ] Record delivery commit; isolated browser evidence and review are complete.

Verification maps NW-01/02 to router tests, NW-03 to before-unload tests and a
browser check, NW-04 to failed/partial-save regressions, and NW-05 to logout tests.
Browser confirmation text and availability are controlled by the browser; no
draft is persisted locally when the user chooses to leave.

Implementation and isolated regressions verified 2026-10-08. Delivery commit pending.
Evidence: [batch verification](../verification/2026-10-08/DEF-005-006-010.md).
