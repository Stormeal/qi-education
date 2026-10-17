# US-P014 cutover: move accounts from Google Sheets to MongoDB

For Alex. Written 2026-10-17 from the [US-P014 spec](../specs/US-P014-users-in-mongodb.md)
("Operator contract"). Run it only after the US-P014 release is pushed and deployed.

**Nothing is lost:** account writes are frozen while data moves, every copy is checked field
by field in both directions before switching, and the sheet is never changed by the forward
copy. A rollback copies MongoDB back into the sheet first, so changes made after the cutover
survive it.

Time needed: about 20 minutes, of which 5 to 10 with accounts read-only (people can still sign
in and learn; signup, enrolling and password changes say "try again in a few minutes").
Pick a quiet moment.

All commands are PowerShell, run in `C:\Users\Alex\source\qi-education`.

## Before you start (any day)

1. Check that the deployed API has the release. Paste:

   ```powershell
   Invoke-RestMethod https://qi-education.vercel.app/api/health/auth
   ```

   You see `status: ok`, `store: google-sheets`, `readOnly: False`. If `store` is missing, the
   release is not deployed yet: stop here.

2. Pull the **production** settings into the API folder (this replaces `api/.env`; step 13
   puts the development settings back). Paste:

   ```powershell
   npx vercel env pull api/.env --environment=production --yes
   $env:USE_SHARED_SERVICES = '1'
   ```

3. Dry run. It reads the sheet and writes nothing. Paste:

   ```powershell
   npm --prefix api run users:migrate -- --dry-run
   ```

   Finished when it prints `Sheet rows: N; valid: N; invalid: 0; duplicate emails: 0`.
   If it lists invalid rows or duplicate emails, stop and send me the list (it shows sheet row
   numbers and, for duplicates, the email only). Decide per row which account to keep before
   going on; nothing is merged automatically.

## Cutover (in the quiet moment)

4. **Freeze account writes.** Open https://vercel.com, project **qi-education**,
   **Settings**, **Environment Variables**. Add `USER_STORE_READ_ONLY` with value `1` for
   **Production** only, and save.

5. **Redeploy so the setting applies.** **Deployments**, the top deployment marked
   **Production**, the **...** menu, **Redeploy**, confirm. Wait until it says **Ready**
   (about a minute).

6. Check the freeze. Paste:

   ```powershell
   Invoke-RestMethod https://qi-education.vercel.app/api/health/auth
   ```

   You see `store: google-sheets`, `readOnly: True`. Do not go on until it does.

7. Pull the production settings again (they now include the freeze) and copy. Paste:

   ```powershell
   npx vercel env pull api/.env --environment=production --yes
   npm --prefix api run users:migrate -- --apply
   ```

   Finished when it prints `inserted: N; updated: 0; unchanged: 0` with the same N as step 3
   (on a repeat run the numbers move to `unchanged`). If it says it refuses, the freeze is not
   in the pulled settings: repeat steps 6 and 7.

8. **Verify.** Paste:

   ```powershell
   npm --prefix api run users:migrate -- --verify
   ```

   You must see `Verified: N accounts identical`. If it lists differences, run step 7's
   `--apply` line and verify again. If differences remain, stop: accounts are still frozen and
   nothing has switched, so send me the output (it shows account ids and field names only).

9. **Switch to MongoDB and lift the freeze.** In Vercel **Environment Variables**: add
   `USER_STORE` with value `mongodb` for **Production**, and change `USER_STORE_READ_ONLY` to
   `0`. Save, then redeploy as in step 5.

10. Check. Paste:

    ```powershell
    Invoke-RestMethod https://qi-education.vercel.app/api/health/auth
    ```

    You see `store: mongodb`, `readOnly: False`.

11. Try it in the browser at https://stormeal.github.io/qi-education/: sign in as yourself,
    open Admin and search for a user, then sign in as a learner test account and enroll in a
    course. All of it works without "try again" messages.

12. Read the hosted log for errors (needs `npx vercel login` once). Paste:

    ```powershell
    npx vercel logs --deployment qi-education.vercel.app
    ```

    No `Quota exceeded` or `Users!A:H` lines should appear for sign-in or account pages.

13. Put the development settings back and leave shared mode. Paste:

    ```powershell
    npm run env:pull
    Remove-Item Env:USE_SHARED_SERVICES
    ```

Tell me "cutover done" and I record it in the spec and the work queue.

## Rollback (any time later, nothing lost)

Use this only if accounts misbehave on MongoDB. It copies everything MongoDB has (including
accounts and enrollments created after the cutover) back into the sheet before switching.

1. Freeze: in Vercel set `USER_STORE_READ_ONLY` to `1` (keep `USER_STORE=mongodb`), redeploy,
   and check `/health/auth` shows `store: mongodb`, `readOnly: True`.
2. Paste:

   ```powershell
   npx vercel env pull api/.env --environment=production --yes
   $env:USE_SHARED_SERVICES = '1'
   npm --prefix api run users:migrate -- --restore-sheet
   npm --prefix api run users:migrate -- --verify
   ```

   You must see `Verified: N accounts identical`. Existing rows are updated in place and new
   accounts are added at the bottom; no row is deleted. (Google Sheets also keeps its own
   version history: **File**, **Version history**.)
3. In Vercel set `USER_STORE` to `google-sheets` and `USER_STORE_READ_ONLY` to `0`, redeploy,
   and check `/health/auth` shows `store: google-sheets`, `readOnly: False`.
4. Put the development settings back as in step 13 and tell me "rolled back".
