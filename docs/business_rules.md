# Business rules

The rules that hold across the whole app. Area details are in [specs/](specs/README.md).
The API enforces every rule here; the UI only mirrors them.

## Roles

| Role | Can |
| --- | --- |
| `student` | Sign up (default role), browse, enroll in published courses, learn, keep notes, give feedback, follow careers, record achievements, edit own profile |
| `teacher` | Everything a student can, plus create courses, author the courses they are assigned to, submit them for review, review courses they are asked to review, write a public instructor description |
| `admin` | Everything, plus author **any** course, review/return/publish/archive, set price and catalog metadata, manage users, triage feedback, curate careers, moderate instructor descriptions |

- Every signed-in role may create a course draft. A teacher who creates one becomes its first
  assigned teacher; an admin who creates one starts it with no teachers.
- Admins assign a course's teachers (0–20 teacher accounts, US-A005); every assigned, active teacher
  can author it. A course with no teachers is editable by admins only. Teachers cannot change the
  list. Courses stored before US-A005 read their owner as their only teacher.
- A role or status change applies on the account's next request. A demoted teacher keeps their
  courses but cannot author them. An admin cannot change their own role or status.
- Disabled accounts cannot sign in or use an existing session; their login fails like a wrong password.

## Course lifecycle

- Statuses: `draft → ready-for-review → published → archived`. Only review actions change status.
- Submitting freezes the revision. Returning needs a reason. Only admins publish, archive, set the
  price and set catalog metadata.
- A published course is edited through one private working revision; the live version stays
  available until the next publication replaces it in one write.
- Review or publication needs answerable quizzes: text on every question and option, at least one
  correct answer per question, pass mark 1…number of questions. Drafts may be incomplete.
- Publishing an "Uncategorized" course asks for confirmation first.
- Admins may assign reviewers (teachers or admins, never the course's own teachers, US-A007). Then
  publishing waits until every reviewer has approved the submitted revision; a new Submit resets the
  approvals. Reviewers read the course but never edit or publish it.

## Access and enrollment

| Who | Sees |
| --- | --- |
| Anyone | Published course metadata, lesson-title outline, thumbnails, published careers, public instructor descriptions |
| Enrolled learner | Full learner content and live files of a published or archived course; never correct answers before an attempt |
| Owner / admin | Everything about the course, including the working revision, review history and author view |
| Assigned reviewer | The author view (read-only) and review history of the course they review; not the reviewer list |

- New enrollment only in a published course; enrolling twice keeps one enrollment.
- Self-serve enrollment and starting paid checkout require a confirmed email; accounts without
  a stored flag count as confirmed. Organization-included access, held courses and paid returns
  are exempt (US-P020).
- Archiving stops new enrollment; existing learners keep access.
- Prices are DKK. Empty or 0 = free. A priced course is enrolled by buying it once through Stripe
  and kept unless the payment is fully refunded (US-L025); authors, admins and anyone enrolled before
  the price was set never pay.
- Careers and declarations never enroll anyone or grant content access.

## Progress and completion

- Completion is per account and course, add-only, and follows the learner across devices.
- 100% means every current lesson complete; removed lessons and duplicates do not count; an empty
  course is 0%.
- Text, resources and exercise lessons complete by the learner's action; video at 90% watched;
  quiz only after a server-graded pass and **Finish quiz**.
- A quiz question scores one point only when the selected answers equal the correct set exactly.

## Careers and achievements

- An account may follow several careers and has one focus. Following, focusing and exploring never
  change achievements or enrollments.
- A milestone is achieved by one satisfied requirement route, even before its prerequisites;
  prerequisites decide only whether it is ready or locked.
- Preparation courses never satisfy a requirement. A course action counts by declaration or real
  100% completion; an exam or activity only by declaration.
- Declarations are self-reported, add-only and counted once wherever the milestone appears. A
  manual declaration needs a followed career and an unlocked milestone.
- CV findings are saved only after the learner confirms them, with `cv` provenance, without the
  follow or lock check. The CV itself is never uploaded or stored.
- Nothing is inferred from role, job title or answers.
- Old-format careers: a step is complete when any of its courses is 100% complete; prerequisites
  only suggest an order.

## Accounts and security

- Password: 8–200 characters, at least one capital letter and one number. One account per email
  (trimmed, lower-cased).
- Session tokens last 12 hours. A password change does not end existing sessions.
- Reset links: single use, 60 minutes, at most three mails per account per rolling hour; any
  password change cancels open links.
- Sign-in: ten failures in 15 minutes lock that address for 15 minutes.
- Private data (profiles, notes, progress, careers, achievements) is readable and writable only by
  its own authenticated account, and served `private, no-store`.
- Local runs and tests never use or change live data; local writes are never sent to the hosted API.

## Feedback

- All active signed-in roles can give feedback, report defects and request changes. Identity comes
  from the session. Only admins read or triage the inbox; they explicitly choose GitHub work.
- An active teacher also sees the lesson feedback (helpful, not helpful, problems) on the courses
  they are assigned to, on Home, without the learner's name or email; triage stays with admins
  (US-T016).
- Sending confirms receipt for team review; it does not promise a reply or implementation date.
- Runtime feedback uses MongoDB in shared/hosted mode; a storage outage never reports success in
  disposable memory. A maintenance freeze also prevents issue-creation side effects.

## Notifications

- Private review and organization notices belong only to their recipient. Preference groups
  default on; review notices require a teacher/admin, admin-inbox notices require an admin.
- Notification delivery is best effort and cannot fail the original action. Opening the list
  leaves unread state unchanged; reading an item or all items affects only the caller.
- The bell refreshes on session refresh and opening; notification groups are managed in Settings → Notifications.

## Limits

| Thing | Limit |
| --- | --- |
| Typed feedback | summary 1-120; description 1-2000; optional defect steps/expected behavior each <=2000 |
| Attachment | 4 MB; quiz images JPEG/PNG/WebP |
| Thumbnail | 2 MB; JPEG/PNG/WebP |
| Quiz | 2–6 options per question; explanation ≤1000; image alt text ≤300 |
| Lesson note | 1–2000 characters, video time 0–86400 s, ≤500 notes per account and course |
| Profile | bio and goals ≤280, job title and company ≤120 |
| Instructor description | ≤280 |
| Display name | 2–120 |
| Admin user search | query ≤100, results ≤50 |
| Draft recovery in the browser | 7 days, 2 MB |
| Course lock | expires 31 minutes after an interrupted write |
