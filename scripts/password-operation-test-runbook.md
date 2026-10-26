# Isolated password-operation PostgreSQL tests

Prepared against `156498f`. **Preparation only: these commands have not been executed.**
Obtain separate approval before creating/starting the cluster, applying SQL, or running database tests.
Never use the existing Windows PostgreSQL service or a hosted Supabase connection.

## Scope and prerequisites

- Installed PostgreSQL 18.4 binaries: `C:\Program Files\PostgreSQL\18\bin`; Node.js.
- A fresh user-owned directory outside the repository, unused port `55432`, and local disk space.
- Dedicated cluster superuser `postgres`, created interactively with SCRAM password authentication.
- A user-prepared, access-restricted PostgreSQL password file **outside the repository**, for the exact local host/port/database/user only. No wildcards. Never commit it or put its contents in command arguments/logs. Preparing this credential file is a separate operator step after approval; the scripts neither create nor read its contents (libpq consumes it).
- Cluster must be named `doorgo_password_isolated`; database must be `doorgo_password_test`.

The bootstrap creates NOLOGIN roles `anon`, `authenticated`, and `service_role`. Only the latter has BYPASSRLS, matching the relevant Supabase boundary. Tests connect as the isolated owner and use SET ROLE to exercise real PostgreSQL privileges. This is not a Supabase Auth/PostgREST environment and does not test real JWT issuance or Auth password writes.

**Test-only stand-ins:** `auth.users(id uuid primary key)` supplies the profile FK; `auth.uid()` reads `request.jwt.claim.sub` for policy compatibility, without validating a JWT. Nothing should use this stand-in as authentication outside the disposable tests.

The bootstrap executes these actual, unchanged repository migrations via `\ir`:

1. [Profile schema](../supabase/migrations/20260712000000_create_dg_user_profiles.sql).
2. [Password setup prerequisite](../supabase/migrations/20260712020000_add_dg_password_setup_requirement.sql), including its historical completion function. That function is not invoked or certified by this suite.
3. [Password operation foundation](../supabase/migrations/20261016120000_password_operation_foundation.sql).

This is a dependency-minimal test schema, **not a replay of the complete DoorGo migration history**. It seeds two synthetic active setup-required profiles (employee and manager), with no existing operation state. No real identities, emails or passwords are seeded. The Calendar-notes suite requires a different bootstrap and is out of scope.

## Create the isolated cluster — later approval only

Run from the repository root in PowerShell. Do not run elevated or change the existing service.

```powershell
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$testRoot = Join-Path $env:LOCALAPPDATA 'DoorGoPasswordTests'
$testData = Join-Path $testRoot 'pgdata'
if (Get-ChildItem Env: | Where-Object Name -Match '^PG') {
    throw 'Inherited PostgreSQL settings exist; review before using direct PostgreSQL utilities.'
}
if (Test-Path -LiteralPath $testRoot) { throw 'Directory exists: inspect; do not overwrite.' }
if (Get-NetTCPConnection -State Listen -LocalPort 55432 -ErrorAction SilentlyContinue) {
    throw 'Port 55432 is already in use.'
}
New-Item -ItemType Directory -Path $testRoot -ErrorAction Stop
& "$pgBin\initdb.exe" -D $testData -U postgres --auth-host=scram-sha-256 --auth-local=scram-sha-256 -W
if ($LASTEXITCODE -ne 0) { throw 'initdb failed; stop and inspect.' }
& "$pgBin\pg_ctl.exe" -D $testData -l (Join-Path $testRoot 'postgres.log') `
    -o '-h 127.0.0.1 -p 55432 -c cluster_name=doorgo_password_isolated' -w start
if ($LASTEXITCODE -ne 0) { throw 'Isolated startup failed; stop and inspect.' }
& "$pgBin\createdb.exe" -h 127.0.0.1 -p 55432 -U postgres -W --maintenance-db=postgres doorgo_password_test
if ($LASTEXITCODE -ne 0) { throw 'Database creation failed; stop and inspect.' }
```

Passwords are entered through the interactive prompts, never as command arguments. Use a local-only password. Do not reuse production credentials. Before executing these direct PostgreSQL utilities, ensure the shell has no inherited `PGHOSTADDR`, `PGSERVICE`, `PGSERVICEFILE` or `PGOPTIONS` overrides; stop for review if it does. The Node runners below independently remove inherited PG settings from child processes.

## Bootstrap and test — later approval only

After the operator has prepared the narrowly scoped, private password file, supply its absolute path. No global PATH or parent environment changes are needed.

```powershell
$passfile = Read-Host 'Absolute path to the approved private local PostgreSQL password file'
if (-not (Test-Path -LiteralPath $passfile -PathType Leaf)) { throw 'Password file missing.' }
$connection = @('--host', '127.0.0.1', '--port', '55432',
    '--database', 'doorgo_password_test', '--user', 'postgres',
    '--psql', 'C:\Program Files\PostgreSQL\18\bin\psql.exe', '--passfile', $passfile)

node scripts/run-password-database.mjs bootstrap @connection
if ($LASTEXITCODE -ne 0) { throw 'Bootstrap failed; do not retry on this database.' }
node scripts/run-password-database.mjs test @connection
if ($LASTEXITCODE -ne 0) { throw 'SQL tests failed.' }
node scripts/verify-password-operations-concurrency.mjs @connection
if ($LASTEXITCODE -ne 0) { throw 'Concurrency test failed.' }
```

The bootstrap intentionally requires a fresh cluster/database; reruns are rejected rather than overwriting objects. The migrations have their own transaction boundaries: a failed bootstrap can leave partial setup. Stop and inspect; recreate only after separate cleanup approval. Tests can be rerun after successful setup: fixture mutations roll back, including both concurrency sessions.

The runners validate arguments before spawning psql; prohibit port 5432, DNS/non-loopback hosts and other database names; use explicit executable paths; ignore psqlrc; disable interactive password prompts; and remove inherited libpq connection overrides. Same-connection SQL guards verify server address, port, cluster name, database and session user. Bootstrap checks for existing roles, schemas, public relations/functions and unrelated databases before creating anything. A session advisory lock serializes cooperating bootstraps across migration commits. Do not use the cluster concurrently for other work. Local port forwarding is not a supported target.

The concurrency test uses a short lock timeout to prove contention, not to release production password-operation state. PostgreSQL statement/connect timeouts bound test failures; no test assertion was removed. These tests do not establish hosted schema parity or full Auth concurrency.

## Stop and clean up

Stop only the cluster identified by the previously verified `$testData` directory:

```powershell
& "$pgBin\pg_ctl.exe" -D $testData -m fast -w stop
if ($LASTEXITCODE -ne 0) { throw 'Stop failed; inspect before cleanup.' }
```

No automatic deletion is provided. **After separate cleanup approval**, confirm the cluster is stopped, resolve `$testRoot` to its absolute path, verify it is exactly the dedicated `DoorGoPasswordTests` directory outside the repository and installed PostgreSQL data directory, then remove only that directory and its dedicated credential file if appropriate. Never stop a Windows service, drop an existing database, or recursively delete a computed path without this verification.

## Offline checks (no database connections)

```powershell
node scripts/verify-password-bootstrap.mjs
node scripts/verify-password-operations.mjs
npx.cmd eslint scripts/password-test-connection.mjs scripts/run-password-database.mjs scripts/verify-password-bootstrap.mjs scripts/verify-password-operations-concurrency.mjs
git diff --check
```

## Snapshot RPC follow-up validation

Validated locally against `1dd7e45` on 2026-10-23 using the preserved cluster above.
Do not repeat cluster creation, database creation, or bootstrap. After verifying the
preserved cluster identity and starting it if needed, reuse `$connection` above:

```powershell
node scripts/run-password-snapshot.mjs inspect @connection
if ($LASTEXITCODE -ne 0) { throw 'Prerequisite inspection failed.' }
# Apply only with separate authorization, and only if inspect reports no snapshot function:
node scripts/run-password-snapshot.mjs apply @connection
if ($LASTEXITCODE -ne 0) { throw 'Snapshot migration failed.' }
node scripts/run-password-snapshot.mjs test @connection
if ($LASTEXITCODE -ne 0) { throw 'Snapshot tests failed.' }
node scripts/run-password-database.mjs test @connection
if ($LASTEXITCODE -ne 0) { throw 'Foundation tests failed.' }
node scripts/verify-password-operations-concurrency.mjs @connection
if ($LASTEXITCODE -ne 0) { throw 'Concurrency tests failed.' }
```

The snapshot migration is now present in this disposable database: **skip apply on
subsequent test runs**. The runner rejects an existing function rather than replacing
it, requires exactly `127.0.0.1:55432`, uses the shared connection safeguards, and checks
for the two preserved setup-required profiles and empty foundation state/operation
tables. It applies the actual repository migration, not a copied definition.

[Snapshot SQL tests](verify-password-snapshot-local.sql) exercise real `service_role`,
`authenticated`, and `anon` privileges, generation/default/receipt selection, pending
resets, stale unresolved writes, unknown outcomes, user isolation, missing profiles,
unchanged table contents, and execution in a read-only transaction. All test mutations
roll back. The trusted service role can intentionally request either user's snapshot;
binding the target to `auth.getUser()` belongs to the inactive server adapter. Ordinary
roles are denied both their own and another user's snapshot, even with a subject claim.

Snapshot tests, unchanged foundation SQL tests, and two-session reservation tests all
passed. No bootstrap was rerun. This validates PostgreSQL behavior in the minimal
fixture schema, not Supabase Auth, PostgREST, hosted grants, or full migration replay.
Stop the isolated cluster using the existing stop instructions; preserve its files.

## Stage 4A atomic-transition validation

Against source `3ef49aa`, the actual `20261023140000_password_atomic_profile_transitions.sql`
was applied only to this preserved disposable database. Do not recreate fixtures or
rerun bootstrap. Start/stop only the existing isolated cluster as described above.
Reuse the explicit `$connection` arguments, then:

```powershell
node scripts/run-password-atomic.mjs inspect @connection
if ($LASTEXITCODE -ne 0) { throw 'Inspection failed.' }
# Only with authorization and only when inspect reports atomic_completion = f:
node scripts/run-password-atomic.mjs apply @connection
if ($LASTEXITCODE -ne 0) { throw 'Migration failed.' }
node scripts/run-password-atomic.mjs test @connection
if ($LASTEXITCODE -ne 0) { throw 'Atomic SQL tests failed.' }
node scripts/verify-password-atomic-concurrency.mjs @connection
if ($LASTEXITCODE -ne 0) { throw 'Atomic concurrency tests failed.' }
node scripts/run-password-database.mjs test @connection
if ($LASTEXITCODE -ne 0) { throw 'Foundation regression failed.' }
node scripts/run-password-snapshot.mjs test @connection
if ($LASTEXITCODE -ne 0) { throw 'Snapshot regression failed.' }
node scripts/verify-password-operations-concurrency.mjs @connection
if ($LASTEXITCODE -ne 0) { throw 'Reservation regression failed.' }
```

**Skip apply on this database now:** the atomic migration is already installed. All
listed runtime tests passed. The two older SQL suites now expect profile completion
and therefore require Stage 4A; the bootstrap itself remains historical and unchanged.
Atomic rollback tests create failure-injection triggers inside a rolled-back transaction.
The new concurrency suite commits competing operations on unique random synthetic test
users and removes only those newly inserted rows afterward; it does not modify the two
original fixtures, invoke Auth, or delete cluster files. Failed assertions remain failures.
The minimal Auth table is still a test stand-in, not a live account service.

Offline SQL check: `node scripts/verify-password-atomic.mjs`. The cluster was stopped
after validation and its files/credentials preserved. No hosted-state inference applies.

## Stage 4B cutover-only legacy removal

Prepared from `93fb453`, resumed 2026-10-26. The earlier partial run already applied
[20261023160000](../supabase/migrations/20261023160000_retire_legacy_password_completion.sql)
to this disposable database. **Do not recreate the RPC, rebootstrap, or repeat apply.**
No hosted database was accessed; static tests cannot prove hosted migration state.

Repository inspection found no `supabase/config.toml`, project-local CLI installation,
package migration command or checked-in CI migration workflow. The isolated runners use
one direct `psql` process, `-X -w`, `ON_ERROR_STOP=1`, explicit connection arguments and
the existing cluster guard. They do not update Supabase migration history.

With the existing `$connection` arguments and verified isolated cluster, run:

```powershell
node scripts/run-password-authority.mjs inspect @connection
if ($LASTEXITCODE -ne 0) { throw 'Inspection failed.' }
node scripts/run-password-authority.mjs guard-test @connection
if ($LASTEXITCODE -ne 0) { throw 'Guard tests failed.' }
node scripts/run-password-authority.mjs test @connection
if ($LASTEXITCODE -ne 0) { throw 'Authority tests failed.' }
```

Run the existing foundation/snapshot/atomic SQL and both concurrency suites afterward.
Stop only the isolated cluster; preserve files and credentials. Authority tests roll back.
The earlier `apply` run proved rejection without acknowledgement and successful removal
with acknowledgement. Resumed `guard-test` proves fresh/separate-session rejection and
same-direct-session passage through the actual migration guard to the already-absent
DROP (an expected error, not a second application). It never recreates the bypass.
Successful local DROP RESTRICT established local catalog compatibility only.

### Future authorized cutover procedure — not performed

The GUC is an accident-prevention acknowledgement, not authorization or readiness proof.
Never set it as a role/database default, inherited PGOPTIONS, or pooled-session setting.
Ordinary migration execution with it unset fails. A generic migration sweep is not an
approved procedure; neither is setting it in one SQL Editor/CLI request and relying on
another request to inherit it.

1. Obtain separate cutover approval. Verify hosted migration history, prerequisites through
   Stage 4A, grants, dependencies and existing operations. Prepare compatible application,
   recovery and remaining coordination/gates first. Hosted parity has not been inspected.
2. Quiesce and drain old password writers. Keep supported login/logout/recovery available.
   Do not serve the old setup action during schema/application cutover.
3. Use a fresh **direct, non-pooled** owner connection, with no inherited libpq routing or
   option overrides. Check the acknowledgement is unset. Supply credentials through a
   private password file, not command arguments. If a direct endpoint or a verified plan
   to record migration history is unavailable, stop; do not improvise with pooling.
4. Execute acknowledgement and SQL in one dedicated process, using separately reviewed
   target parameters (these variables are intentionally not populated here):

```powershell
$approvedDirectConnection = @('-X', '-w', '-v', 'ON_ERROR_STOP=1',
    '-h', $verifiedDirectHost, '-p', $verifiedDirectPort,
    '-U', $approvedOwner, '-d', $approvedDatabase)
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' @approvedDirectConnection `
    -c "SELECT set_config('doorgo.password_completion_cutover','approved',false);" `
    -f 'supabase/migrations/20261023160000_retire_legacy_password_completion.sql'
if ($LASTEXITCODE -ne 0) { throw 'Cutover failed; keep password writers quiesced.' }
```

Both commands use the same direct backend; the process exits afterward. There is no
transaction-pooling or connection-reuse dependency. The file supplies its own transaction;
do not add an outer `--single-transaction` wrapper.

5. Verify RPC absence and trusted setup/retry behavior. Record exactly this migration using
   the separately verified migration-history procedure, only after successful DDL. Raw
   `psql` does not record Supabase history; no unverified repair command is prescribed.
6. Switch to the coordinated application, verify, then reopen writes. The unchanged old
   action would update Auth and fail completion against this schema. Never restore it or
   the session-only RPC as an automatic fallback; keep writers paused or use a reviewed
   forward correction on failure. None of these deployment steps is authorized by testing.

## Stage 4C-1 requirement-only validation

Prepared against `2c20e83`. Reuse the preserved isolated cluster and explicit `$connection` from above; no bootstrap or fixture recreation. After verifying cluster identity:

```powershell
node scripts/run-password-require-change.mjs inspect @connection
# Apply only with task approval and only if inspect reports the new function absent:
node scripts/run-password-require-change.mjs apply @connection
node scripts/run-password-require-change.mjs test @connection
node scripts/verify-password-require-change-concurrency.mjs @connection
node scripts/run-password-database.mjs test @connection
node scripts/run-password-snapshot.mjs test @connection
node scripts/run-password-atomic.mjs test @connection
node scripts/run-password-authority.mjs test @connection
node scripts/verify-password-operations-concurrency.mjs @connection
node scripts/verify-password-atomic-concurrency.mjs @connection
```

Check each exit code and stop on failure. The actual [migration](../supabase/migrations/20261026120000_password_require_change.sql) was applied only to the disposable database on 2026-10-26; **skip apply on subsequent runs**. All listed SQL/concurrency suites passed. SQL tests roll back; concurrency tests clean up only their own random synthetic identities. Stop the isolated cluster afterward using the earlier instructions; preserve cluster files and credentials. Never operate the Windows PostgreSQL service.

Offline checks: `node scripts/verify-password-require-change.mjs`, existing employee/admin password verifiers, `npx.cmd tsc --noEmit`, scoped ESLint on the new adapter and three .mjs files, and `git diff --check`. The adapter's human-admin authorization is mocked separately from real SQL role tests; no Auth call is made. Generation advances on every successful request; lost-response retry can advance again. Pending admin resets are rejected unchanged; unresolved employee writes remain blocked. No active action is connected, no production migration is applied, and no hosted state is inferred.
