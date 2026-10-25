# Feedback Sheets to MongoDB cutover (US-A006)

This is an operator procedure requiring separate authorization for shared writes,
configuration changes and deployment. Implementation tests use provider doubles;
they do not establish Atlas durability, credentials or deployed-instance freezes.
Do not run this migration as a local exploratory probe.

The runtime uses memory in isolated/test mode, and MongoDB in shared/hosted mode.
Missing MongoDB configuration fails closed. The feedback collection is
`<MONGODB_COURSE_CONTENT_COLLECTION>_feedback`. No runtime feedback path selects
Google Sheets. Legacy credentials and the 17-column serializer are retained only
for compatibility and this deliberate copy.

## Preparation and rehearsal

1. Rehearse with isolated fixtures using
   `npm --prefix api test -- src/feedbackStorage.test.ts src/feedbackMigration.test.ts`.
   Rehearsal includes stable identity, legacy empty messages and lesson context,
   interrupted imports, repeat imports, source validation, conflicts and digest
   verification. Never use shared services for a mutation test.
2. Arrange an authorized maintenance window and a secure backup of the source and
   target. Retain the legacy Feedback tab unchanged. Ensure the migration account
   can read it, and the MongoDB account can create the target collection/index and
   write with majority acknowledgement.
3. Supply the existing Sheets settings (`GOOGLE_SHEETS_SPREADSHEET_ID`,
   `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, optionally
   `GOOGLE_SHEETS_FEEDBACK_RANGE`) and MongoDB settings (`MONGODB_URI`,
   `MONGODB_DB_NAME`, `MONGODB_COURSE_CONTENT_COLLECTION`) through approved secret
   management. Do not print secrets, rows or personal data in a transcript.

## Freeze, copy and verify

1. Freeze **every** feedback writer with `FEEDBACK_STORE_READ_ONLY=1` on all API
   instances and deployments that can receive requests. Include legacy Sheets
   writers, background jobs and admin tools. Drain in-flight writes and disable
   traffic to older deployments that do not implement the freeze. Merely setting
   the variable on the operator shell does not freeze a deployed writer.
2. Verify maintenance 503s for site feedback, lesson feedback and triage on the
   deployed frozen API; confirm reads still work and no GitHub creation is sent.
   Do this only under the authorized acceptance procedure, avoiding synthetic
   records in shared stores. Confirm the reported feedback read-only status.
3. In a local non-production operator shell explicitly set
   `USE_SHARED_SERVICES=1` and `FEEDBACK_STORE_READ_ONLY=1`. Do not set `VERCEL` or
   `NODE_ENV=production`; `NODE_ENV=test` cannot opt into shared services. Run:

   ```powershell
   $env:USE_SHARED_SERVICES = '1'
   $env:FEEDBACK_STORE_READ_ONLY = '1'
   npm --prefix api run feedback:migrate
   ```

   Dry run is the default. It reads source rows with a read-only Google OAuth
   scope and reads the target; it creates no target index and writes nothing.
   The source must have the 17 expected headers (A:Q). Blank rows are skipped.
   Malformed fields, duplicate identities (even identical duplicates), and
   existing target records with different content stop the command. Diagnostics
   identify row numbers without printing IDs, email addresses or messages.
4. Resolve malformed or duplicate source data through a separately reviewed
   source correction. Never allow the tool to guess lost values, silently replace
   target content or overwrite later MongoDB triage changes. Repeat dry run.
5. With all writers still frozen, make the final authorized copy:

   ```powershell
   npm --prefix api run feedback:migrate -- --apply
   ```

   Apply refuses to run without both explicit shell settings. It checks every
   source row and every target conflict before any insertion. It uses source IDs
   as MongoDB `_id`, preserves every legacy field and inserts only missing records
   with majority acknowledgement. It never updates or deletes source or target
   records. The target receives its newest-first index during apply.
6. Require `verified=true` and `pending=0`. Verification re-reads each source ID
   and compares a SHA-256 digest of every stored field, rather than trusting total
   counts. A partially completed copy can be rerun: identical records are skipped;
   conflicting records stop safely. A lost insertion acknowledgement is accepted
   only when a subsequent read matches the full source document. A verification
   failure leaves the freeze in place for investigation.
7. Repeat the dry run while frozen: all source records must be reported identical
   with no pending imports. Save the non-sensitive command summaries and operator
   acceptance evidence. MongoDB-only records are preserved; the copy does not
   delete extra target records.

## Switch and rollback

Deploy the reviewed MongoDB runtime with its settings under separate deployment
authorization. Keep `FEEDBACK_STORE_READ_ONLY=1` until the read-only inbox, legacy
lesson context, issue links, health status and provider access have been checked.
Only then remove the freeze across the chosen active deployment. Keep older
Sheets-writing deployments unreachable and retain the source as read-only backup.

Before any new MongoDB writes, rollback can restore the previously approved
runtime/configuration while keeping the freeze until source consistency is
confirmed. After new MongoDB submissions or triage changes, the Sheets source is
stale: a source-only rollback loses those changes. Refreeze all writers, back up
MongoDB, and plan a separately authorized reconciliation before reopening any old
writer. This command intentionally offers no reverse-copy or overwrite mode.

## Recover an unresolved GitHub issue operation (AC10 / INV-004)

This procedure requires separate release approval for production inspection and
any conditional repair. The examples describe the repair contract; they are not
commands to run during implementation. Freeze all feedback writers as described
above, drain in-flight requests, and preserve a backup before reconciliation.

The durable journal is
`<MONGODB_COURSE_CONTENT_COLLECTION>_feedback_issue_operations`. Each record has
`_id = JSON.stringify([normalizedRepository, feedbackId])`, where
`normalizedRepository` is the configured `owner/repo` lowercased. Its `owner` is
the creation claim's UUID; `state` is `creating` or `created`; `createdAt` and
`updatedAt` are ISO timestamps. A completed record also has
`issue: { number, url }`. There is no TTL: an old `creating` record still protects
against an external POST whose outcome is unknown.

1. Read the feedback record and journal record first. An existing saved feedback
   issue link is authoritative; do not replace it with a lookup candidate. An
   existing `created` journal result must also never be overwritten. If those
   sources disagree, stop and investigate while frozen.
2. Locate the exact GitHub issue in the configured repository. Include both open
   and closed issues and exclude pull requests. For current issues, compute the
   marker with the exported `feedbackIssueMarker(normalizedRepository, feedbackId)`
   from `api/src/githubFeedback.ts`; the body must end with the exact generated
   marker preceded by two newlines (trailing whitespace may be ignored). A marker
   pasted into arbitrary user content is insufficient evidence.
3. Verify the trusted integration creator. The runtime calls token-authenticated
   `GET https://api.github.com/user`, then requires the issue author's numeric
   `user.id` and case-insensitive login to match that identity. Check the visible
   Feedback ID, submission context and repository as well. Search pagination
   must be complete and the result unique; the runtime caps its recovery scan at
   ten pages of 100 issues and refuses an incomplete or ambiguous lookup.
   Token rotation can change the identity, and installation tokens may not
   support `/user`. If identity cannot be verified, use separately reviewed manual
   evidence of the historical integration creator; do not treat the current
   token or a similar login as proof. Without sufficient evidence, leave the
   operation unresolved.
4. For one verified existing issue and a `creating` journal record, complete only
   the observed claim with this MongoDB update contract:

   ```javascript
   const result = await operations.updateOne(
     { _id: observed._id, owner: observed.owner, state: 'creating' },
     { $set: {
       state: 'created',
       issue: { number: verifiedIssue.number, url: verifiedIssue.url },
       updatedAt: new Date().toISOString(),
     } },
     { writeConcern: { w: 'majority' } },
   );
   ```

   Require an acknowledged result and `matchedCount === 1`, then re-read with
   majority read concern and verify the exact issue result. If nothing matched,
   re-read the journal: only the same already-completed issue is an idempotent
   success. A changed owner, different result or missing record requires
   investigation; never broaden the filter or overwrite a competing result.
5. For a **legacy orphan** (GitHub creation succeeded before the durable journal
   existed and feedback link saving failed), the old issue may have no marker.
   With all writers frozen, verify its visible Feedback ID, full submission
   context and trusted historical integration creator. If the matching journal
   record is absent, insert a `created` record using the exact stable `_id`, a
   fresh operator claim UUID, both timestamps and the verified `{ number, url }`,
   with majority acknowledgement. Use insert-only semantics, never upsert or
   replacement. A duplicate-key result means re-read and reconcile the existing
   record; if it is `creating`, use the conditional completion above. Never
   replace an existing `created` result or authoritative saved feedback link.
6. After verified reconciliation, unfreeze the approved active deployment and
   retry **Work** for the feedback. It reuses the journal result and saves the
   feedback link without another creation POST. Confirm both stored links agree
   with the reviewed issue and retain the non-sensitive recovery evidence.

Never delete, release, reset or replace an unresolved claim because it is old or
because a search found no issue. Absence cannot establish that a lost POST was
rejected. Multiple matches, incomplete search, unverifiable identity or conflicting
saved results remain unresolved until an operator can establish the outcome;
they never authorize creating another issue.

Outstanding release checks: real Atlas majority acknowledgement and persistence,
Sheets permissions/header compatibility, every deployed writer frozen, authorized
final-copy digests, and read-only inbox acceptance. No shared migration or
deployment was performed by the implementation tests.
