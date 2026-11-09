# Windows Calendar authorization verification — 2026-11-02

Result: **FAIL to complete verification (environment blocked). NO-GO for release.**
Neither proposed migration nor an authorization assertion was executed against PostgreSQL. This is not evidence that either migration fails.

## Repository preparation

- Starting branch `main`, HEAD `f9bbaa02019fe6a0bd2853e85423aa75b8934646`, completely clean working tree including untracked files.
- Prepared changes were absent. `git apply --check` succeeded and the supplied patch was applied once, without staging.
- All 21 resulting files match `manifest.json` SHA-256 values after CRLF-to-LF normalization.
- `git diff --check` passed.
- Patch includes architecture updates to chapters 02, 03, 05 and 06. No application or migration logic was changed beyond that supplied patch.

## Isolated PostgreSQL attempt

Verified PostgreSQL 18 binaries at `C:\Program Files\PostgreSQL\18\bin`.
`netstat -ano -p tcp` showed the existing listener on port 5432 and no listener on candidate port 55433. No connection was made to that listener or to any existing database.
Windows CIM process/listener inspection returned Access denied; netstat provided a non-elevated listener check.

New disposable directory (preserved):
`C:\Users\DW-1\AppData\Local\Temp\doorgo-calendar-verification-676c077773c84972b6308c680deb01a1`

Synthetic initialization password and libpq passfile were created there, outside the repository; their values were never printed. No data directory was successfully initialized. Intended identity was `doorgo_calendar_isolated`, loopback `127.0.0.1:55433`; these settings were never installed because initialization failed. Neither `doorgo_notes_test` nor `doorgo_staff_away_test` was created.

The first invocation had a PowerShell argument-format error for `--pwfile`; it was corrected to a separate argument. The corrected invocation was:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\initdb.exe' -D (Join-Path $sandboxPath 'data') -U postgres --auth=scram-sha-256 --pwfile (Join-Path $sandboxPath 'init-password') --encoding=UTF8 --locale=C
```

It failed with:

```text
initdb: error: could not create restricted token: error code 87
initdb: error: could not re-execute with restricted token: error code 3
The files belonging to this database system will be owned by user "CodexSandboxOffline".
creating directory C:/Users/DW-1/AppData/Local/Temp/doorgo-calendar-verification-676c077773c84972b6308c680deb01a1/data ...
initdb: error: could not create directory "C:/Users/DW-1": File exists
```

Stopped at the handoff's no-elevation boundary. No escalation was requested. `pg_ctl` was never reached. Follow-up checks found no `data/PG_VERSION` and no port 55433 listener. There was no new running cluster to stop. No directories were deleted.

## Test status and fixture fidelity

- `scripts/verify-calendar-linked-notes-local.sql`: NOT RUN, blocked before cluster initialization.
- `scripts/verify-calendar-staff-away-read-local.sql`: NOT RUN, same blocker.
- Supplemental PostgreSQL assertions 1–7 in the handoff: NOT RUN.
- Fixture/bootstrap additions: none; no synthetic database rows or prerequisite SQL were installed. Fixture fidelity is unverified.
- Legacy shared Job/Calendar baseline prerequisites remain to be constructed and documented; existing password fixtures are not a Calendar baseline and were not reused.
- Business-access helper definitions and dynamic wrappers, effective Calendar scope, staffing/workweek tables, Staff Away mutations and later capacity-exception replacements require faithful inclusion in a future dedicated baseline. No cutover acknowledgements were set and the migration chain was not replayed.
- Browser acceptance remains unverified. Previously passed mocked/static/TypeScript/lint/build checks were not rerun and are not claimed as passes from this run.
- RLS, inherited-role ACLs, own/foreign-location mutations, independent capacity outcomes and unchanged persisted capacity snapshots remain unverified on real PostgreSQL.

## Recommendation and boundaries

**NO-GO for the migrations/release until real PostgreSQL authorization tests pass and outstanding browser acceptance is completed.** Resume in an explicitly authorized non-elevated user environment that can initialize and run a new disposable cluster; preserve and verify isolation before any database action. Do not change existing clusters/services to overcome this blocker.

No production/hosted database access, existing-cluster modification, service registration/change, commit, push, merge, deployment or release action occurred.
