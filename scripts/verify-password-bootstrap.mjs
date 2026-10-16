// Offline only: no subprocesses, database connections, or credential-file reads.
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { passwordTestConnection } from './password-test-connection.mjs';

const argv = ['--host','127.0.0.1','--port','55432','--database','doorgo_password_test',
  '--user','postgres','--psql',path.resolve('psql.exe'),'--passfile',path.resolve('unused-test-path')];
let checks = 0;
function reject(key, value) {
  const args = [...argv]; args[args.indexOf(key)+1] = value;
  assert.throws(() => passwordTestConnection(args)); checks++;
}
for (const host of ['localhost','example.supabase.co','127.0.0.2','127.0.0.1,example.com','/tmp']) reject('--host',host);
for (const port of ['5432','05432','0','65536','55432;DROP','abc']) reject('--port',port);
reject('--database','postgres'); reject('--database','production'); reject('--user','other');
reject('--psql','psql'); reject('--passfile','relative');
assert.throws(() => passwordTestConnection([])); checks++;
assert.throws(() => passwordTestConnection([...argv,'--password','forbidden'])); checks++;
assert.throws(() => passwordTestConnection([...argv,'--port','55433'])); checks++;
const config = passwordTestConnection(argv, { PATH:'unchanged', PGPASSWORD:'sentinel', PGSERVICE:'remote',
  PGHOSTADDR:'remote', PGDATABASE:'remote', PGOPTIONS:'unsafe', pgservicefile:'remote' });
assert.equal(config.env.PGPASSWORD,undefined); assert.equal(config.env.PGSERVICE,undefined);
assert.equal(config.env.PGHOSTADDR,undefined); assert.equal(config.env.PGDATABASE,undefined);
assert.equal(config.env.pgservicefile,undefined); assert.equal(config.env.PATH,'unchanged');
assert.ok(config.args.includes('-w')); assert.ok(config.args.includes('-X'));
assert.match(config.guard,/inet_server_port\(\)<>55432/);
assert.match(config.guard,/doorgo_password_isolated/);
const ipv6 = [...argv]; ipv6[1]='::1'; passwordTestConnection(ipv6); checks++;
const bootstrap = readFileSync('scripts/bootstrap-password-operations.sql','utf8');
for (const match of bootstrap.matchAll(/^\\ir (.+)$/gm)) assert.ok(existsSync(path.resolve('scripts',match[1].trim())));
assert.equal((bootstrap.match(/^\\ir /gm) ?? []).length,3);
assert.match(bootstrap,/pg_try_advisory_lock/); assert.match(bootstrap,/Requires fresh cluster/);
assert.match(bootstrap,/CREATE ROLE service_role NOLOGIN.*BYPASSRLS/);
assert.doesNotMatch(bootstrap,/DROP\s|TRUNCATE\s|ON CONFLICT|CREATE OR REPLACE/i);
assert.doesNotMatch(bootstrap,/CREATE FUNCTION public\.dg_password_/);
for (const file of ['scripts/run-password-database.mjs','scripts/verify-password-operations-concurrency.mjs']) {
  const source=readFileSync(file,'utf8');
  assert.match(source,/passwordTestConnection/); assert.doesNotMatch(source,/spawn(?:Sync)?\('psql'/);
}
console.log(`Password bootstrap offline safeguards passed (${checks} argument cases plus SQL/runner checks); no connections made.`);
