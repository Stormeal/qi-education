# US-P015 cutover: move course details from Google Sheets to MongoDB

For Alex. Written 2026-10-17 from the [US-P015 spec](../specs/US-P015-courses-in-mongodb.md)
("Operator contract") and checked against the delivered script (`ba3ff83`): its refusal,
summary and verify lines are quoted exactly. Run it only
after the US-P015 release is deployed **and the US-P014 accounts cutover is done** (one
change at a time keeps a rollback simple).

**Nothing is lost:** course-detail writes are frozen while data moves, every copy is checked field
by field in both directions before switching, and the sheet is never changed by the forward
copy. A rollback copies MongoDB back into the sheet first, so changes made after the cutover
survive it.

Time needed: about 20 minutes, of which 5 to 10 with course details read-only (people can
still browse, learn, enroll and save lesson content; creating a course, changing its details,
thumbnail, price or catalog settings says "try again in a few minutes").
Pick a quiet moment.

All commands are PowerShell, run in `C:\Users\Alex\source\qi-education`. The copy commands use
`npm.cmd`, not `npm`: in Windows PowerShell, `npm` swallows the `--` that passes the mode
(`--dry-run` and so on) to the script, which then refuses with "choose exactly one of ...".

## Before you start (any day)

1. Check that the deployed API has the release. Paste:

   ```powershell
   (Invoke-RestMethod https://qi-education.vercel.app/api/health/config).courses
   ```

   You see `storage: google-sheets`, `readOnly: False`. If nothing prints, the release is not
   deployed yet: stop here.

2. Pull the **production** settings into the API folder (this replaces `api/.env`; step 13
   puts the development settings back). Paste:

   ```powershell
   npx vercel env pull api/.env --environment=production --yes
   $env:USE_SHARED_SERVICES = '1'
   ```

3. Dry run. It reads the sheet and writes nothing. Paste:

   ```powershell
   npm.cmd --prefix api run courses:migrate -- --dry-run
   ```

   Finished when it prints `Sheet rows: N; valid: N; invalid: 0; duplicate ids: 0`.
   If it prints `Migration failed: configuration could not be loaded`, the production
   Google or MongoDB keys did not come down with the pull. Vercel never hands out variables
   marked **Sensitive**: stop and tell me, and we decide how to supply them for this one run.
   If it lists invalid rows or duplicate ids, stop and send me the list (it shows sheet row
   numbers only). We decide per row before going on; nothing is merged automatically.

## Cutover (in the quiet moment)

4. **Freeze course-detail writes.** Open https://vercel.com, project **qi-education**,
   **Settings**, **Environment Variables**. Add `COURSE_STORE_READ_ONLY` with value `1` for
   **Production** only, and save.

5. **Redeploy so the setting applies.** **Deployments**, the top deployment marked
   **Production**, the **...** menu, **Redeploy**, confirm. Wait until it says **Ready**
   (about a minute).

6. Check the freeze. Paste:

   ```powershell
   (Invoke-RestMethod https://qi-education.vercel.app/api/health/config).courses
   ```

   You see `storage: google-sheets`, `readOnly: True`. Do not go on until it does.

7. Pull the production settings again (they now include the freeze) and copy. Paste:

   ```powershell
   npx vercel env pull api/.env --environment=production --yes
   npm.cmd --prefix api run courses:migrate -- --apply
   ```

   Finished when it prints `inserted: N; updated: 0; unchanged: 0` with the same N as step 3
   (on a repeat run the numbers move to `unchanged`). If it says it refuses, the freeze is not
   in the pulled settings: repeat steps 6 and 7.

8. **Verify.** Paste:

   ```powershell
   npm.cmd --prefix api run courses:migrate -- --verify
   ```

   You must see `Verified: N courses identical`. If it lists differences, run step 7's
   `--apply` line and verify again. If differences remain, stop: course details are still
   frozen and nothing has switched, so send me the output (it shows course ids and field names
   only).

9. **Switch to MongoDB and lift the freeze.** In Vercel **Environment Variables**: add
   `COURSE_STORE` with value `mongodb` for **Production**, and change `COURSE_STORE_READ_ONLY` to
   `0`. Save, then redeploy as in step 5.

10. Check. Paste:

    ```powershell
    (Invoke-RestMethod https://qi-education.vercel.app/api/health/config).courses
    ```

    You see `storage: mongodb`, `readOnly: False`.

11. Try it in the browser at https://stormeal.github.io/qi-education/: open the catalog and a
    course page, open a course you are enrolled in, then as admin change a course's price and
    change it back. All of it works without "try again" messages, and the catalog order is the
    same as before.

12. Read the hosted log for errors (needs `npx vercel login` once). Paste:

    ```powershell
    npx vercel logs --deployment qi-education.vercel.app
    ```

    No `Quota exceeded` or `Courses!A:U` lines should appear for catalog or course pages.

13. Put the development settings back and leave shared mode. Paste:

    ```powershell
    npm run env:pull
    Remove-Item Env:USE_SHARED_SERVICES
    ```

Tell me "cutover done" and I record it in the spec and the work queue.

## Rollback (any time later, nothing lost)

Use this only if course details misbehave on MongoDB. It copies everything MongoDB has
(including courses created or changed after the cutover) back into the sheet before switching.

1. Freeze: in Vercel set `COURSE_STORE_READ_ONLY` to `1` (keep `COURSE_STORE=mongodb`), redeploy,
   and check the courses health line shows `storage: mongodb`, `readOnly: True`.
2. Paste:

   ```powershell
   npx vercel env pull api/.env --environment=production --yes
   $env:USE_SHARED_SERVICES = '1'
   npm.cmd --prefix api run courses:migrate -- --restore-sheet
   npm.cmd --prefix api run courses:migrate -- --verify
   ```

   You must see `Verified: N courses identical`. Existing rows are updated in place and new
   courses are added at the bottom; no row is deleted. (Google Sheets also keeps its own
   version history: **File**, **Version history**.)
3. In Vercel set `COURSE_STORE` to `google-sheets` and `COURSE_STORE_READ_ONLY` to `0`, redeploy,
   and check the courses health line shows `storage: google-sheets`, `readOnly: False`.
4. Put the development settings back as in step 13 and tell me "rolled back".

**After a rollback, keep the API code at this release or later.** The restore writes a few
cells in a special form (they start with `qi-course-cell:v1:`) when the sheet format cannot
hold the exact value, for example a rating like 4.75 or a list item that contains a comma.
This release and later ones read those cells; an older API version would not. Leave those
cells as they are in the sheet.

## Lessons from the accounts cutover (2026-10-18)

- **Sensitive settings.** Vercel pulls them as `[SENSITIVE]`, including `AUTH_TOKEN_SECRET` and the
  store settings themselves. Remove those lines (and empty ones) from the pulled file before
  running the script, and pass the store setting explicitly once `/health/auth` (or the courses
  health line) has confirmed the live value, for example `COURSE_STORE=google-sheets
  COURSE_STORE_READ_ONLY=1` for `--apply`.
- **VPN.** ProtonVPN blocks MongoDB's port 27017. Exclude `C:\Program Files\nodejs\node.exe` in
  ProtonVPN split tunneling (turning the VPN off triggers its kill switch). Excluded Node then has
  no DNS for the `mongodb+srv://` lookup, so use the classic connection string with the three
  servers written out (`mongodb://…@ac-1y3kasg-shard-00-00…,-01…,-02….yr9i6rm.mongodb.net:27017/?tls=true&authSource=admin&replicaSet=atlas-okwt1w-shard-0`)
  as `MONGODB_URI` for the script run only.
- **Settings changes** can be made with the Vercel CLI instead of the dashboard:
  `printf 'mongodb' | npx vercel env add COURSE_STORE production` (no trailing newline), and
  `npx vercel redeploy <current production deployment URL> --target production`.
- Atlas Network Access already contains `0.0.0.0/0`; no address needs adding.
