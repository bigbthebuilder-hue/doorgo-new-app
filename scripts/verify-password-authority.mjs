// Source-only staging checks. Cannot establish hosted migration/application state.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
const read=f=>readFileSync(f,'utf8');
const sql=read('supabase/migrations/20261023160000_retire_legacy_password_completion.sql');
assert.match(sql,/CUTOVER ONLY/);
assert.match(sql,/current_setting\('doorgo.password_completion_cutover',true\) IS DISTINCT FROM 'approved'/);
assert.match(sql,/RAISE EXCEPTION 'password.cutover_approval_required'/);
assert.ok(sql.indexOf('password.cutover_approval_required')<sql.indexOf('DROP FUNCTION'));
assert.match(sql,/DROP FUNCTION public\.complete_dg_initial_password_setup\(\) RESTRICT;/);
assert.doesNotMatch(sql.replace(/^\s*--.*$/gm,''),/\bCASCADE\b|CREATE (?:OR REPLACE )?FUNCTION|GRANT |UPDATE public\.|DELETE FROM/i);
assert.match(sql,/BEGIN;[\s\S]*COMMIT;/);
const action=read('app/account/change-password/actions.ts');
assert.match(action,/runEmployeePasswordSetup/);assert.doesNotMatch(action,/executeInitialPasswordSetup|complete_dg_initial_password_setup/);
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
for(const file of [...walk('app'),...walk('components'),...walk('lib')]){
  if (['app/account/change-password/actions.ts','lib/admin/users-server.ts','lib/admin/users-service.ts'].includes(file.replaceAll('\\','/'))) continue;
 if(!/\.tsx?$/.test(file)||file.endsWith('.test.ts')||/(employee-password|password-reset|reactivation)-(server|operation)\.ts$/.test(file))continue;
 assert.doesNotMatch(read(file),/employee-password-(server|operation)|password-reset-(server|operation)|reactivation-(server|operation)|password_completion_cutover/,'Inactive/staging boundary: '+file);
}
console.log('Cutover guard, bounded DROP RESTRICT, trusted action caller and bounded imports verified. Hosted state UNKNOWN; static checks cannot prove non-application.');
