# US-P017 back up and restore MongoDB — Codex handoff

Assigned 2026-10-19 by Claude Code (lead). Story, decisions and scenarios US-P017-AC01/AC02:
[user_stories.md, US-P017](../user_stories.md). Read `AGENTS.md` (shared-tree rules) first. Claude
writes the runbook in `docs/` at the same time.

## Codex scope: two commands in the API package

1. **`npm --prefix api run db:backup -- --out <folder>`.** Needs services mode `shared`
   (`USE_SHARED_SERVICES=1`) and the MongoDB settings; otherwise it stops with a clear message
   and exit code 1. Refuses an `--out` folder inside the repository and an existing non-empty
   folder. Writes, for every collection of `MONGODB_DB_NAME` (list them, do not hard-code
   names): `<collection>.ejson`, one relaxed-false (canonical) EJSON document per line, streamed
   with a cursor so large asset collections do not sit in memory. Then `manifest.json`:
   `{ createdAt, database, collections: [{ name, count, indexes }] }` with each collection's
   index definitions except `_id_`. Read-only on the database. Prints one line per collection
   (name, count) and a final "Backup complete: N collections, M documents in <folder>".
2. **`npm --prefix api run db:restore -- --from <folder> --into <database>`.** Same mode check.
   Reads the manifest; refuses when any manifest collection already exists in `<database>` with
   documents, before writing anything. Inserts in batches (for example 500), recreates the
   indexes from the manifest (unique and TTL options kept), then compares every count with the
   manifest and exits 1 on a mismatch. Prints "Restore verified: N collections, M documents into
   <database>". It never drops or overwrites.
3. Keep the logic in a module that takes a database handle and a folder, so tests use doubles; the
   CLI files only parse arguments and connect. Never print connection strings, documents or
   password hashes.

Tests (in-process, doubles and a temporary folder outside the repository): a round trip keeps
strings, numbers, `Date`, `Binary`, nested arrays and `_id` values exactly; manifest counts and
indexes (including a unique and a TTL index) are restored; restore into a database with data is
refused with nothing written; an `--out` inside the repository is refused; isolated mode is
refused; a count mismatch exits 1.

Done when `npm run api:test` and `npm run api:build` pass.

## Contract Claude's runbook relies on

- The two command lines above, their flags, their final success lines, exit code 1 on any refusal
  or mismatch.
- The backup folder layout: `manifest.json` plus one `<collection>.ejson` per collection.

## Files Claude owns (do not edit)

`app/**` (except the version line), `docs/**` except your row in `docs/work_queue.md`,
`scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`. If you need one of these, finish everything
else first, then name the exact file and line in your summary instead of stopping.
