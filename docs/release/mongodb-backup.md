# MongoDB backup and restore

Since 2026-10-18 MongoDB is the only live copy of accounts, enrollments, courses, course content,
thumbnails, attachments, progress, careers, notes and profiles (US-P016). Feedback stays in Google
Sheets, which keeps its own version history. This runbook is US-P017.

## When

- Before every release that changes how data is stored.
- Once a month otherwise.
- Keep the three newest backups and delete older ones: each holds password hashes and personal
  data.

## Before the first run

1. Open PowerShell in `C:\Users\Alex\source\qi-education`.
2. If `api\.env` is missing or older than the last change in Vercel, paste:

   ```powershell
   npm.cmd run env:pull
   ```

   It is finished when the prompt returns without an error.

3. Create the folder that holds backups, outside the repository (once):

   ```powershell
   New-Item -ItemType Directory -Force C:\Users\Alex\qi-backups
   ```

## Take a backup

Paste as one block. It reads the database and writes files; it changes nothing in MongoDB.

```powershell
$folder = "C:\Users\Alex\qi-backups\$(Get-Date -Format yyyy-MM-dd-HHmm)"
$env:USE_SHARED_SERVICES = '1'
npm.cmd --prefix api run db:backup -- --out $folder
Remove-Item Env:USE_SHARED_SERVICES
```

You see one line per collection with its document count, then
`Backup complete: N collections, M documents in C:\Users\Alex\qi-backups\…`. Any other last line
means the backup did not finish: copy the output to Claude.

Use `npm.cmd`, not `npm`: in Windows PowerShell plain `npm` drops the `--` and the command sees no
folder.

## Rehearse a restore

Do this after the first backup and then every few months, so a real recovery is not the first
attempt. It restores into a separate scratch database on the same cluster; the live database is
not touched.

1. In MongoDB Atlas, open the cluster's **Metrics** or **Collections** view and note the data
   size. The free tier holds 512 MB in total; the scratch copy needs the same space again. If the
   two together would pass the limit, stop and tell Claude.
2. Paste, changing the folder name to the backup you just took:

   ```powershell
   $env:USE_SHARED_SERVICES = '1'
   npm.cmd --prefix api run db:restore -- --from "C:\Users\Alex\qi-backups\<backup folder>" --into qi-restore-rehearsal
   Remove-Item Env:USE_SHARED_SERVICES
   ```

   It is finished when the last line reads `Restore verified: N collections, M documents into
   qi-restore-rehearsal`, with the same numbers as the backup's last line.
3. In Atlas, **Browse Collections**, select the `qi-restore-rehearsal` database and choose
   **Drop database**. Check the name twice: only the rehearsal database goes.
4. Tell Claude the two final lines, so the rehearsal date is recorded.

If the restore says the target database already holds data, an earlier rehearsal was not dropped:
do step 3 first, then run step 2 again.

## Real recovery

Use this only when live data is lost or damaged. It never overwrites the damaged database, so
nothing more is lost while you recover.

1. Pick the newest backup taken before the damage.
2. Restore it into a new database, for example `qi-recovered-2026-11-02`, with the command from
   the rehearsal and that name after `--into`.
3. In Vercel, project **qi-education** → **Settings** → **Environment Variables**, change
   `MONGODB_DB_NAME` to the new name for Production, then **Deployments** → latest → **Redeploy**.
4. Sign in on the live site and open a course. Changes made after the backup was taken are not in
   the recovered database.
5. Keep the damaged database until the cause is understood, then drop it in Atlas.

## What the commands do

- `db:backup` lists every collection of `MONGODB_DB_NAME` and writes `<collection>.ejson` (one
  document per line in MongoDB's extended JSON, so dates and binary files survive) plus
  `manifest.json` with counts and index definitions. It refuses a folder inside the repository or
  a folder that is not empty.
- `db:restore` refuses a target that already holds any of the backed-up collections, inserts the
  documents, recreates the indexes (unique and expiry indexes included) and compares every count
  with the manifest. Any refusal or mismatch ends with exit code 1.
- Both need `USE_SHARED_SERVICES=1` and the MongoDB settings in `api\.env`. They never print
  connection strings, documents or password hashes.

## Rehearsal log

| Date | Backup (collections, documents) | Restore verified | By |
| --- | --- | --- | --- |
| Not yet run | | | |
