# Teacher dress rehearsal checklist

Purpose: walk the exact path the first real teacher will take, on the **live site**,
before they do. Everything delivered in October 2026 was verified with in-memory
stores only; this is the first check against the real Google Sheet, MongoDB and Mux.

Time: about 30 minutes. One person, three accounts. Written 2026-10-09 for version
0.1.64; re-read the "Known limits" section if the version has moved on.

## Before you start

- [ ] The latest `main` is deployed: the footer shows the expected version, and
      `https://qi-education.vercel.app/api/health/config` reports `google-sheets`,
      `mongodb` (content and assets) and `mux.configured: true`.
- [ ] Back up: make a copy of the Google Sheet (File → Make a copy) and export the
      MongoDB `courseContent` and course asset collections.
- [ ] Three accounts exist and you can log in to each: a **teacher**, an **admin**, and
      a **student**. A new account is a student; to make a teacher, set the `role` cell
      of that row in the Users sheet to `teacher` (there is no screen for this yet,
      US-A001). Use the account type the real teacher will use.
- [ ] Have ready: a JPEG/PNG/WebP image under 2 MB, a PDF or PowerPoint under 4 MB, a
      second file **over** 4 MB, and a short video file.
- [ ] Open the Vercel project's function logs in another tab.

Record for every failed step: what you clicked, what you saw, the time, and a screenshot.

## 1. Teacher: create the course

- [ ] Log in as the teacher. Home loads without errors.
- [ ] Create a new course (title, description, level, teacher name). Save.
      Expected: saved notice; the course appears for the teacher, not in the public catalog.
- [ ] Upload the thumbnail. Expected: it shows after upload and after a page reload.
- [ ] Add a section and rename it.

## 2. Teacher: add lessons

- [ ] Add a **text** lesson. Type a heading, bold text and a list. Save.
- [ ] Attach the file under 4 MB to the text lesson. Expected: a card with the file name
      appears; downloading it returns the same file.
- [ ] Try the file over 4 MB. Expected: refused immediately with
      "Attachments must be 4 MB or smaller." and nothing uploads.
- [ ] Add a **video** lesson and upload the video. Expected: progress, then "processing",
      then a playable video within a few minutes without reloading. If it stays on
      waiting/processing for more than 10 minutes, note it: the Mux webhook is the
      least-tested part of the system.
- [ ] Add a **quiz** lesson with one question, four answers, exactly one marked correct,
      and a pass mark no higher than the total points. Save.
- [ ] Add a **resources** lesson with one file. Save.
- [ ] Reorder two lessons. Save.

## 3. Teacher: leave and come back

- [ ] Reload the page. Expected: everything saved above is still there.
- [ ] Make an edit and try to leave without saving. Expected: a warning; staying keeps the edit.
- [ ] Make an edit, close the tab, reopen the editor. Expected: an offer to restore or
      discard the unsaved draft.
- [ ] Log out and back in. The course is still there and editable.

## 4. Teacher: submit for review

- [ ] Click **Submit for review**. Expected: the course is frozen for editing and shows
      as awaiting review.
- [ ] Confirm the teacher has no publish or price controls.

## 5. Admin: review and publish

- [ ] Log in as the admin. Open the course in the editor. Expected: the lessons display
      correctly, including the text lesson and its attachment card.
- [ ] Return it to the teacher with a reason. As the teacher, confirm the reason is
      visible and editing works again; resubmit.
- [ ] As admin, **publish**. Set a category and language in catalog settings, and a price
      if you use one.
- [ ] Expected: the course appears in the public catalog with its thumbnail and category.

## 6. Student: enroll and learn

- [ ] Logged out, open the course. Expected: outline visible, lesson content not.
- [ ] Log in as the student, enroll, open the course in My Learning.
- [ ] Read the text lesson and download its attachment.
- [ ] Play the video.
- [ ] Take the quiz: a wrong answer does not pass; the right answer passes.
- [ ] Home and My Learning show progress that matches what you completed.

## 7. Teacher: change a published course

- [ ] As the teacher, open the published course. Expected: it cannot be edited directly.
- [ ] Click **Start revision**, change a lesson, save. As the student, confirm the
      published version is unchanged.
- [ ] Submit the revision; as admin publish it; as the student confirm the change is live.

## Known limits to tell the teacher

- Attachments: 4 MB each. Text lessons take documents, PDFs, images and PowerPoint;
  resources lessons take ZIP, PDF, Word, PowerPoint and images. Thumbnails: 2 MB, JPEG/PNG/WebP.
- A course needs at least one lesson, and every quiz must be answerable, before it can
  be submitted.
- Lesson completion is remembered per browser, not per account.
- If a save fails with "This course is being updated" and does not clear within a
  minute, a failed write may be holding the course lock. It releases by itself after
  31 minutes; learners can still read meanwhile. For a faster fix follow
  [course operation recovery](../course_operation_recovery.md).
- There is no "delete course" in the app. Archive it, or remove its row from the
  Courses sheet and its content document by hand.

## After the rehearsal

- [ ] Archive or remove the rehearsal course and its test accounts.
- [ ] Log each failure as a defect in [defect_management.md](../defect_management.md)
      with the evidence above.
- [ ] Record the date, version and outcome under `docs/verification/`.
- [ ] Do not deploy anything except fixes for these failures until the teacher's session is over.
