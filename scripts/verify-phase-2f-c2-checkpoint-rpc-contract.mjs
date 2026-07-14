import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const migrationPath = 'supabase/migrations/20260712030000_create_production_flow_checkpoint_rpcs.sql';
const validatorMigrationPath = 'supabase/migrations/20260712040000_secure_production_flow_checkpoint_link_validator.sql';
const checkpointTableMigrationPath = 'supabase/migrations/20260711010000_create_dg_production_flow_checkpoints.sql';
const contractPath = 'docs/production-flow-checkpoint-rpc-contract.md';
const sql = readFileSync(migrationPath, 'utf8');
const validatorSql = readFileSync(validatorMigrationPath, 'utf8');
const checkpointTableSql = readFileSync(checkpointTableMigrationPath, 'utf8');
const contract = readFileSync(contractPath, 'utf8');
const normalize = (text) => text.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim().toLowerCase();
const normalized = normalize(sql);
const normalizedValidator = normalize(validatorSql);
const normalizedCheckpointTable = normalize(checkpointTableSql);

assert.match(normalized, /^begin;/, 'BEGIN must be the first executable statement');
assert.match(normalized, /commit;$/, 'COMMIT must be the final executable statement');
assert.equal((normalized.match(/\bbegin;/g) ?? []).length, 1, 'Migration must have one outer BEGIN');
assert.equal((normalized.match(/\bcommit;/g) ?? []).length, 1, 'Migration must have one outer COMMIT');
assert.doesNotMatch(
  normalized,
  /validate_production_flow_checkpoint_links/,
  'The applied 030000 RPC migration must not be edited to secure the validator',
);

assert.match(normalizedValidator, /^begin;/, 'Validator follow-up must begin transactionally');
assert.match(normalizedValidator, /commit;$/, 'Validator follow-up must commit transactionally');
assert.equal((normalizedValidator.match(/\bbegin;/g) ?? []).length, 1, 'Validator follow-up must have one BEGIN');
assert.equal((normalizedValidator.match(/\bcommit;/g) ?? []).length, 1, 'Validator follow-up must have one COMMIT');
assert.match(normalizedValidator, /alter function public\.validate_production_flow_checkpoint_links\(\) owner to postgres;/, 'Validator owner must be postgres');
assert.match(normalizedValidator, /alter function public\.validate_production_flow_checkpoint_links\(\) security definer;/, 'Validator must be SECURITY DEFINER');
assert.match(normalizedValidator, /alter function public\.validate_production_flow_checkpoint_links\(\) set search_path to '';/, 'Validator search path must be empty');
for (const role of ['public', 'anon', 'authenticated']) {
  assert.match(
    normalizedValidator,
    new RegExp(`revoke all on function public\\.validate_production_flow_checkpoint_links\\(\\) from ${role};`),
    `Validator EXECUTE must be revoked from ${role}`,
  );
}
assert.doesNotMatch(normalizedValidator, /grant execute/, 'Validator cannot be directly executable by application roles');
assert.doesNotMatch(normalizedValidator, /create (?:or replace )?function|create (?:constraint )?trigger/, 'Follow-up must alter existing objects rather than replace them');
assert.match(normalizedCheckpointTable, /create or replace function public\.validate_production_flow_checkpoint_links\(\)/, 'Reciprocal validator function name must remain unchanged');
assert.match(normalizedCheckpointTable, /create constraint trigger dg_production_flow_checkpoints_link_consistency[\s\S]*execute function public\.validate_production_flow_checkpoint_links\(\)/, 'Deferred reciprocal trigger and function names must remain unchanged');

const expected = {
  create_production_flow_checkpoint: {
    signature: 'uuid, date, numeric, numeric, text, text',
    commandParameter: 'p_checkpoint_id',
  },
  revise_production_flow_checkpoint: {
    signature: 'uuid, date, uuid, integer, numeric, numeric, text, text',
    commandParameter: 'p_new_checkpoint_id',
  },
  void_production_flow_checkpoint: {
    signature: 'uuid, date, uuid, integer, text',
    commandParameter: 'p_void_checkpoint_id',
  },
};

const declarations = [...normalized.matchAll(/create or replace function public\.([a-z0-9_]+)\s*\((.*?)\)\s*returns/gs)];
assert.deepEqual(
  declarations.map((match) => match[1]).sort(),
  Object.keys(expected).sort(),
  'Migration must create exactly the intended three public functions and no helpers',
);

const typeOfParameter = (parameter) => {
  const withoutDefault = parameter.trim().replace(/\s+default\s+null$/, '');
  const match = withoutDefault.match(/^p_[a-z0-9_]+\s+(uuid|date|numeric|text|integer)$/);
  assert.ok(match, `Unexpected function parameter declaration: ${parameter}`);
  return match[1];
};

const blocks = new Map();
for (let index = 0; index < declarations.length; index += 1) {
  const declaration = declarations[index];
  const name = declaration[1];
  const actualSignature = declaration[2].split(',').map(typeOfParameter).join(', ');
  assert.equal(actualSignature, expected[name].signature, `${name} has the wrong exact signature`);
  const start = declaration.index;
  const end = index + 1 < declarations.length ? declarations[index + 1].index : normalized.indexOf('revoke all on function');
  blocks.set(name, normalized.slice(start, end));
}

for (const [name, details] of Object.entries(expected)) {
  const block = blocks.get(name);
  assert.ok(block, `Missing ${name}`);
  assert.match(block, /security definer/, `${name} must be SECURITY DEFINER`);
  assert.match(block, /set search_path = ''/, `${name} must have an empty search path`);
  assert.match(block, /auth\.uid\(\)/, `${name} must derive actor identity from auth.uid()`);
  assert.match(block, /dg_user_profiles[\s\S]*active/, `${name} must require an active profile`);
  assert.match(block, /permission_key = 'production_checkpoints' and p\.access_level = 'use'/, `${name} must require dedicated use permission`);
  assert.match(block, /production_date > v_today[\s\S]*future_date_not_allowed/, `${name} must reject future dates`);

  const commandLock = `pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_flow_checkpoint_command:' || ${details.commandParameter}::text, 0))`;
  const dateLock = "pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_flow_checkpoint:' || p_production_date::text, 0))";
  const uuidLookup = `where c.checkpoint_id = ${details.commandParameter}`;
  const commandIndex = block.indexOf(commandLock);
  const dateIndex = block.indexOf(dateLock);
  const lookupIndex = block.indexOf(uuidLookup);
  assert.ok(commandIndex >= 0, `${name} must lock its command UUID`);
  assert.ok(dateIndex > commandIndex, `${name} must take command lock before date lock`);
  assert.ok(lookupIndex > dateIndex, `${name} must inspect UUID state only after both locks`);
  const stateMutationIndexes = [block.indexOf(' for update'), block.indexOf(' update public.dg_production_flow_checkpoints'), block.indexOf(' insert into public.dg_production_flow_checkpoints')].filter((value) => value >= 0);
  assert.ok(stateMutationIndexes.every((value) => value > dateIndex), `${name} must lock before row locks or mutation`);
  assert.match(block, /checkpoint\.command_uuid_collision/, `${name} must reject changed UUID reuse`);
}

assert.doesNotMatch(normalized, /permission_key = 'production'/, 'Broad production permission cannot authorize checkpoint mutation');
assert.doesNotMatch(normalized, /is_manager/, 'Manager status cannot gate or bypass checkpoint mutation');
assert.doesNotMatch(normalized, /production_date < v_today/, 'Backdating cannot have a manager-only gate');
assert.doesNotMatch(normalized, /unique_violation/, 'Migration must not broadly mask uniqueness failures');
assert.match(normalized, /america\/vancouver/, 'Vancouver business date is required');
assert.match(normalized, /opening_carry_hours < 0[\s\S]*opening_carry_hours > 99999999\.99/, 'Carry range must be checked');
assert.match(normalized, /trunc\(p_opening_carry_hours, 2\)/, 'More than two decimals must be rejected');
assert.doesNotMatch(
  normalized,
  /is distinct from\s+case\b/,
  'CASE operands of IS DISTINCT FROM must be explicitly grouped',
);
for (const name of [
  'create_production_flow_checkpoint',
  'revise_production_flow_checkpoint',
]) {
  assert.match(
    blocks.get(name),
    /adjustment_hours_snapshot is distinct from \( case when p_calculated_opening_carry_snapshot is null then null else p_opening_carry_hours - p_calculated_opening_carry_snapshot end \)/,
    `${name} must group its derived adjustment CASE comparison`,
  );
}
assert.match(normalized, /v_note is null[\s\S]*checkpoint\.note_required/, 'Removal reason must be required');
assert.match(normalized, /checkpoint_status = 'superseded', superseded_by_checkpoint_id/, 'Predecessor must transition to superseded');
assert.match(normalized, /v_latest\.checkpoint_series_id[\s\S]*v_latest\.revision_number \+ 1[\s\S]*v_latest\.checkpoint_id/, 'Reconfirmation must remain same-series and adjacent');
assert.match(normalized, /'voided'[\s\S]*v_current\.revision_number \+ 1[\s\S]*v_current\.checkpoint_id/, 'Remove must append an adjacent voided row');
assert.match(blocks.get('create_production_flow_checkpoint'), /v_prior\.confirmed_at is not null[\s\S]*command_uuid_collision/, 'Create/reconfirm must reject revise UUID semantics');
assert.match(blocks.get('revise_production_flow_checkpoint'), /v_prior\.confirmed_at is null[\s\S]*command_uuid_collision/, 'Revise must reject reconfirm UUID semantics');
assert.match(blocks.get('void_production_flow_checkpoint'), /v_existing\.confirmed_at is not null[\s\S]*command_uuid_collision/, 'Remove must reject confirmed-operation UUID semantics');

for (const [name, details] of Object.entries(expected)) {
  const identity = `public.${name}(${details.signature})`;
  for (const statement of [
    `revoke all on function ${identity} from public;`,
    `revoke all on function ${identity} from anon;`,
    `grant execute on function ${identity} to authenticated;`,
  ]) {
    assert.ok(normalized.includes(statement), `Missing exact privilege statement: ${statement}`);
    assert.ok(normalized.indexOf(statement) > normalized.indexOf('begin;') && normalized.indexOf(statement) < normalized.lastIndexOf('commit;'), 'Privilege statements must be transactional');
  }
}
assert.match(normalized, /revoke insert, update, delete, truncate on public\.dg_production_flow_checkpoints from anon, authenticated/, 'Direct writes must remain revoked');
assert.match(normalized, /extensions\.gen_random_uuid\(\)/, 'Qualified Supabase extension generator assumption must be explicit');

const forbiddenAuthorizationSource = new RegExp(`${['service', 'role'].join('_')}|raw_user_meta_data|user_metadata`);
assert.doesNotMatch(normalized, forbiddenAuthorizationSource, 'Forbidden authorization source/path');
assert.doesNotMatch(normalized, /p_(?:actor|recorder|confirmer|manager|user)(?:_|\s)/, 'Caller identity/role inputs are forbidden');

const normalizePath = (path) => path.replaceAll('\\', '/').replace(/^\.\//, '');
const repositoryPaths = new Set(execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean).map(normalizePath));
const mainPaths = new Set(execFileSync('git', ['ls-tree', '-r', '--name-only', 'main'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean).map(normalizePath));
const diffPaths = new Set(execFileSync('git', ['diff', '--name-only', 'main', '--'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean).map(normalizePath));
const changedPaths = [...repositoryPaths].filter((path) => diffPaths.has(path) || !mainPaths.has(path));
assert.ok(repositoryPaths.has(migrationPath), 'Dirty and clean trees must discover the migration');
assert.deepEqual(changedPaths.filter((path) => /^lib\/production-board\//.test(path)), [], 'Board calculations must remain unchanged');
const approvedLaterUi = new Set([
  'app/account/page.tsx',
  'app/production-checkpoints/page.tsx',
  'app/production-checkpoints/checkpoint-operation-forms.tsx',
  'app/production-recovery/page.tsx',
  'app/production-recovery/production-recovery-list.tsx',
]);
assert.deepEqual(changedPaths.filter((path) => /^(?:app|components)\//.test(path) && !approvedLaterUi.has(path)), [], 'Only exact reviewed later-phase UI paths may follow C2');
assert.deepEqual(changedPaths.filter((path) => /calendar/i.test(path)), [], 'No Calendar mutation file may be added');

const reviewable = [...repositoryPaths].filter((path) => !path.startsWith('node_modules/') && !path.startsWith('.next/') && existsSync(path) && statSync(path).isFile() && /\.(?:ts|tsx|js|jsx|mjs|cjs|sql|md|json)$/.test(path));
const applicationText = reviewable.filter((path) => !path.startsWith('scripts/') && path !== migrationPath && path !== contractPath).map((path) => readFileSync(path, 'utf8')).join('\n');
assert.doesNotMatch(applicationText, /\.rpc\(['"](?:create|revise|void)_production_flow_checkpoint/, 'No application RPC caller may be added');

const contractText = contract.toLowerCase();
assert.match(contractText, /invariant lock order[\s\S]*command uuid lock[\s\S]*production-date lock/, 'Two-lock ordering must be documented');
assert.match(contractText, /to_regprocedure\('extensions\.gen_random_uuid\(\)'\)/, 'Generator preflight must be documented');
assert.match(contractText, /static verification does not prove postgresql compilation[\s\S]*extension availability[\s\S]*concurrent execution[\s\S]*rollback[\s\S]*deferred-trigger[\s\S]*postgrest overload resolution/, 'Static limitations must be explicit');
assert.match(contractText, /deferred reciprocal-link validation[\s\S]*trusted database owner context[\s\S]*outer [^a-z0-9]*security definer[^a-z0-9]*rpc returns/, 'Deferred validator execution context must be documented');

console.log('Phase 2F-C2 checkpoint RPC static contract verification passed (live PostgreSQL behavior is not proven)');
