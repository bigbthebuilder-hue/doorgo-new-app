// Real two-session PostgreSQL lock test. Requires local psql and prepared fixtures.
// No migration application. Both sessions roll back; never point this at hosted data.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

if (!process.argv.includes('--local')) throw new Error('Explicit --local required');
const args = ['-X', '-qAt', '-h', '127.0.0.1', '-d', 'doorgo_password_test', '-v', 'ON_ERROR_STOP=1'];
const guard = `DO $$ BEGIN IF current_database()<>'doorgo_password_test' OR inet_server_addr()<>'127.0.0.1'::inet THEN RAISE EXCEPTION 'Local test database required'; END IF; END $$;`;
const selectUser = `SELECT user_id FROM public.dg_user_profiles p WHERE active AND must_change_password AND NOT EXISTS(SELECT 1 FROM public.dg_password_setup_state s WHERE s.user_id=p.user_id) ORDER BY user_id LIMIT 1`;
const probe = spawnSync('psql', [...args, '-c', `${guard} ${selectUser}`], { encoding: 'utf8' });
assert.equal(probe.status, 0, probe.error?.message ?? probe.stderr);
const user = probe.stdout.trim();
assert.match(user, /^[0-9a-f-]{36}$/, 'Unused active setup-required fixture required');
const a = spawn('psql', args, { stdio: ['pipe', 'pipe', 'pipe'] });
let stderr = '';
a.stderr.on('data', chunk => { stderr += chunk; });
const closed = once(a, 'close');
try {
  await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Reservation session did not become ready')), 10000);
    a.on('error', error => { clearTimeout(timeout); reject(error); });
    a.on('close', () => { clearTimeout(timeout); reject(new Error(stderr || 'Reservation session exited')); });
    a.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('RESERVED')) { clearTimeout(timeout); resolve(); }
    });
    a.stdin.write(`BEGIN; ${guard} SELECT public.dg_password_reserve('${user}','10000000-0000-4000-8000-000000000001',1,'employee_setup'); SELECT 'RESERVED';\n`);
  });
  const b = spawnSync('psql', args, { encoding: 'utf8', timeout: 10000,
    input: `BEGIN; ${guard} SET LOCAL lock_timeout='300ms'; SELECT public.dg_password_reserve('${user}','10000000-0000-4000-8000-000000000002',1,'employee_setup'); ROLLBACK;` });
  assert.notEqual(b.status, 0);
  assert.match(b.stderr, /lock timeout/, 'Second session must block on the first user lock');
} finally {
  a.stdin.end('ROLLBACK;\n');
  const [code] = await closed;
  assert.equal(code, 0, stderr);
}
const retry = spawnSync('psql', args, { encoding: 'utf8', input:
  `BEGIN; ${guard} SELECT public.dg_password_reserve('${user}','10000000-0000-4000-8000-000000000002',1,'employee_setup'); ROLLBACK;` });
assert.equal(retry.status, 0, retry.stderr);
console.log('Two-session reservation serialization passed; both transactions rolled back.');
