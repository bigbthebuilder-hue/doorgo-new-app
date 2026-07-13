import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const migrationPath = 'supabase/migrations/20260713000000_create_production_flow_checkpoint_read_rpcs.sql';
const c2Path = 'supabase/migrations/20260712030000_create_production_flow_checkpoint_rpcs.sql';
const sql = readFileSync(migrationPath, 'utf8');
const normalize = (text) => text.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim().toLowerCase();
const normalized = normalize(sql);
const splitTopLevel = (text) => {
  const values = []; let depth = 0; let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    if (text[index] === ')') depth -= 1;
    if (text[index] === ',' && depth === 0) { values.push(text.slice(start, index).trim()); start = index + 1; }
  }
  values.push(text.slice(start).trim());
  return values;
};

assert.match(normalized, /^begin;/, 'Migration must begin transactionally');
assert.match(normalized, /commit;$/, 'Migration must commit transactionally');
assert.equal((normalized.match(/create or replace function public\./g) ?? []).length, 2, 'Exactly two read RPCs are allowed');

const expected = {
  read_production_flow_checkpoint_day: { signature: 'date', parameter: 'p_production_date date' },
  read_recent_production_flow_checkpoint_history: { signature: 'integer', parameter: 'p_limit integer' },
};
const declarations = [...normalized.matchAll(/create or replace function public\.([a-z0-9_]+)\s*\((.*?)\)\s*returns table\s*\((.*?)\)\s*language/gs)];
assert.deepEqual(declarations.map((match) => match[1]).sort(), Object.keys(expected).sort());

const returnColumns = [
  'checkpoint_id uuid', 'production_date date', 'revision_number integer', 'status text',
  'calculated_opening_carry_hours numeric(10,2)', 'actual_opening_carry_hours numeric(10,2)',
  'adjustment_hours numeric(10,2)', 'note text', 'removal_reason text',
  'recorded_at timestamptz', 'recorded_by_display_name text',
];
for (let index = 0; index < declarations.length; index += 1) {
  const declaration = declarations[index];
  const name = declaration[1];
  assert.equal(declaration[2].trim(), expected[name].parameter, `${name} has the wrong input`);
  const projection = splitTopLevel(declaration[3]);
  assert.deepEqual(projection, returnColumns, `${name} must return only the approved safe projection`);
  assert.doesNotMatch(declaration[3], /(?:recorded|confirmed)_by_user_id|user_id|series_id|supersedes|superseded_by|command_id|idempotency/i);

  const start = declaration.index;
  const end = index + 1 < declarations.length ? declarations[index + 1].index : normalized.indexOf('revoke all on function');
  const block = normalized.slice(start, end);
  assert.match(block, /security definer/);
  assert.match(block, /set search_path = ''/);
  assert.match(block, /auth\.uid\(\)/);
  assert.match(block, /public\.dg_user_profiles[\s\S]*not v_profile\.active/);
  assert.match(block, /permission\.permission_key = 'production_checkpoints'/);
  assert.match(block, /permission\.access_level in \('view', 'use'\)/);
  assert.doesNotMatch(block, /is_manager|permission_key = 'production'/);
  assert.match(block, /left join public\.dg_user_profiles as recorder/);
  assert.match(block, /recorder\.display_name/);
  assert.match(block, /when checkpoint\.confirmed_at is null then 'removed'/);
  assert.doesNotMatch(declaration[3], /void/i, 'Return contract cannot expose internal void terminology');
}

const dayBlock = normalized.slice(normalized.indexOf('create or replace function public.read_production_flow_checkpoint_day'), normalized.indexOf('create or replace function public.read_recent_production_flow_checkpoint_history'));
assert.match(dayBlock, /p_production_date is null[\s\S]*checkpoint_read\.invalid_date/);
assert.match(dayBlock, /p_production_date > v_today[\s\S]*checkpoint_read\.future_date_not_allowed/);
assert.match(dayBlock, /america\/vancouver/);
assert.match(dayBlock, /where checkpoint\.production_date = p_production_date[\s\S]*order by checkpoint\.revision_number desc/);

const historyBlock = normalized.slice(normalized.indexOf('create or replace function public.read_recent_production_flow_checkpoint_history'), normalized.indexOf('revoke all on function'));
assert.match(historyBlock, /p_limit is null or p_limit < 1 or p_limit > 50/);
assert.match(historyBlock, /checkpoint\.production_date <= v_today/);
assert.match(historyBlock, /order by checkpoint\.production_date desc, checkpoint\.revision_number desc[\s\S]*limit p_limit/);

for (const [name, details] of Object.entries(expected)) {
  const identity = `public.${name}(${details.signature})`;
  assert.match(normalized, new RegExp(`alter function ${identity.replaceAll('.', '\\.').replace(/[()]/g, '\\$&')} owner to postgres;`));
  for (const statement of [`revoke all on function ${identity} from public;`, `revoke all on function ${identity} from anon;`, `grant execute on function ${identity} to authenticated;`]) {
    assert.ok(normalized.includes(statement), `Missing privilege: ${statement}`);
  }
}
assert.match(normalized, /revoke select, insert, update, delete, truncate on public\.dg_production_flow_checkpoints from anon, authenticated/);
assert.doesNotMatch(normalized, /create policy|grant select on public\.dg_production_flow_checkpoints/);
const forbiddenTrustedAccess = new RegExp(`${['service', 'role'].join('_')}|trusted-read|supabase_${['service', 'role', 'key'].join('_')}`);
assert.doesNotMatch(normalized, forbiddenTrustedAccess);

const c2Current = readFileSync(c2Path, 'utf8').replaceAll('\r\n', '\n');
const c2Main = execFileSync('git', ['show', `main:${c2Path}`], { encoding: 'utf8' }).replaceAll('\r\n', '\n');
assert.equal(c2Current, c2Main, 'Applied C2 mutation migration must remain unchanged');

console.log('Phase 2F-C4A checkpoint read RPC static contract verification passed (live PostgreSQL behavior is not proven)');
