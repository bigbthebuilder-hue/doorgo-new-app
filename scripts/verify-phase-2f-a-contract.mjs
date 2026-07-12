import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const statusMigration = readFileSync(
  'supabase/migrations/20260711000000_create_dg_production_status_events.sql',
  'utf8',
);
const checkpointMigration = readFileSync(
  'supabase/migrations/20260711010000_create_dg_production_flow_checkpoints.sql',
  'utf8',
);
const statusContract = readFileSync(
  'docs/production-status-events-contract.md',
  'utf8',
);
const checkpointContract = readFileSync(
  'docs/production-flow-checkpoints-contract.md',
  'utf8',
);

function normalize(text) {
  return text.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function requirePattern(text, pattern, message) {
  assert.match(normalize(text), pattern, message);
}

function rejectPattern(text, pattern, message) {
  assert.doesNotMatch(normalize(text), pattern, message);
}

requirePattern(
  statusMigration,
  /booking_id text not null/,
  'Status events must use text booking IDs',
);
requirePattern(
  statusMigration,
  /constraint dg_production_status_events_booking_fk foreign key \(booking_id\) references public\.dg_production_bookings\(booking_id\) on delete restrict/,
  'Status events must use the exact restricted booking FK',
);
requirePattern(
  statusMigration,
  /create trigger dg_production_status_events_immutable before update or delete on public\.dg_production_status_events/,
  'Status events must reject both UPDATE and DELETE',
);
requirePattern(
  statusMigration,
  /create constraint trigger dg_production_status_events_same_booking_supersession[\s\S]*execute function public\.validate_production_status_event_supersession\(\)/,
  'Same-booking supersession trigger must be installed',
);
requirePattern(
  statusMigration,
  /create unique index dg_production_status_events_source_idempotency_uidx on public\.dg_production_status_events \(source_system, idempotency_key\) where idempotency_key is not null/,
  'Idempotency uniqueness must be source scoped and partial',
);
requirePattern(
  statusMigration,
  /alter table public\.dg_production_status_events enable row level security/,
  'Status-event RLS must be enabled',
);

requirePattern(
  checkpointMigration,
  /opening_carry_hours numeric\(10,2\) not null/,
  'Opening carry must use numeric(10,2)',
);
requirePattern(
  checkpointMigration,
  /check \(opening_carry_hours >= 0\)/,
  'Negative opening carry must be rejected',
);
rejectPattern(
  checkpointMigration,
  /check \([^)]*adjustment_hours_snapshot[^)]*(?:>=|>)\s*0[^)]*\)/,
  'Adjustment snapshots must permit negative values',
);
requirePattern(
  checkpointMigration,
  /constraint dg_production_flow_checkpoints_series_revision_unique unique \(checkpoint_series_id, revision_number\)/,
  'Series/revision uniqueness must target the exact columns',
);
requirePattern(
  checkpointMigration,
  /create unique index dg_production_flow_checkpoints_confirmed_date_uidx on public\.dg_production_flow_checkpoints \(production_date\) where checkpoint_status = 'confirmed'/,
  'Confirmed-date uniqueness must use the exact date and predicate',
);
requirePattern(
  checkpointMigration,
  /constraint dg_production_flow_checkpoints_superseded_by_fk foreign key \(superseded_by_checkpoint_id\) references public\.dg_production_flow_checkpoints\(checkpoint_id\) on delete restrict deferrable initially deferred/,
  'Reverse checkpoint FK must be deferred',
);
requirePattern(
  checkpointMigration,
  /create constraint trigger dg_production_flow_checkpoints_link_consistency[\s\S]*deferrable initially deferred[\s\S]*execute function public\.validate_production_flow_checkpoint_links\(\)/,
  'Checkpoint link validation must be deferred',
);
requirePattern(
  checkpointMigration,
  /checkpoint_status <> 'confirmed' or superseded_by_checkpoint_id is null/,
  'Confirmed checkpoints cannot identify a successor',
);
requirePattern(
  checkpointMigration,
  /checkpoint_status <> 'superseded' or superseded_by_checkpoint_id is not null/,
  'Superseded checkpoints must identify a successor',
);
requirePattern(
  checkpointMigration,
  /revision_number = 1 and supersedes_checkpoint_id is null[\s\S]*revision_number > 1 and supersedes_checkpoint_id is not null/,
  'Revision/link lifecycle must distinguish first and later revisions',
);
requirePattern(
  checkpointMigration,
  /prior_checkpoint\.superseded_by_checkpoint_id is distinct from new\.checkpoint_id/,
  'Forward links must validate the reciprocal reverse link',
);
requirePattern(
  checkpointMigration,
  /next_checkpoint\.supersedes_checkpoint_id is distinct from new\.checkpoint_id/,
  'Reverse links must validate the reciprocal forward link',
);
requirePattern(
  checkpointMigration,
  /new\.revision_number <> prior_checkpoint\.revision_number \+ 1/,
  'Forward links must validate adjacent revisions',
);
requirePattern(
  checkpointMigration,
  /next_checkpoint\.revision_number <> new\.revision_number \+ 1/,
  'Reverse links must validate adjacent revisions',
);
requirePattern(
  checkpointMigration,
  /alter table public\.dg_production_flow_checkpoints enable row level security/,
  'Checkpoint RLS must be enabled',
);
rejectPattern(
  checkpointMigration,
  /create trigger [^ ]*immutable[\s\S]*on public\.dg_production_flow_checkpoints/,
  'Checkpoint updates must remain possible through the future controlled RPC',
);

for (const migration of [statusMigration, checkpointMigration]) {
  rejectPattern(migration, /create policy/, 'Phase 2F-A must not create policies');
  requirePattern(
    migration,
    /revoke insert, update, delete, truncate on public\.[a-z0-9_]+ from anon, authenticated/,
    'Ordinary mutation privileges must be revoked',
  );
}

const combinedContracts = `${statusContract}\n${checkpointContract}`;
requirePattern(combinedContracts, /america\/vancouver/, 'Timezone contract is required');
requirePattern(
  combinedContracts,
  /completion[^.]*never (?:change|subtract)[^.]*carry/,
  'Completion events must not alter carry',
);
requirePattern(
  checkpointContract,
  /checkpoint overrides calculated opening carry/,
  'Checkpoint authority over calculated carry must be documented',
);
requirePattern(
  combinedContracts,
  /google calendar[^.]*must never (?:own|overwrite)/,
  'Google Calendar non-authority must be documented',
);
requirePattern(
  checkpointContract,
  /one logical `checkpoint_series_id` per production date[\s\S]*future constrained checkpoint rpc[\s\S]*reject a request carrying a different series id/,
  'One-series-per-date must be assigned to the future RPC',
);
requirePattern(
  checkpointContract,
  /ordinary writes remain unavailable until that rpc phase/,
  'Ordinary writes must remain unavailable until the RPC phase',
);

execFileSync(
  'git',
  [
    'diff',
    '--quiet',
    '--',
    'app/production-board',
    'lib/production-board/queries.ts',
    'lib/production-board/normalize.ts',
    'components/ProductionBoardReadOnly.tsx',
    'components/ProductionBoardWeekSection.tsx',
    'components/ProductionBoardDay.tsx',
    'components/ProductionBookingCard.tsx',
    'components/ProductionBoardSummary.tsx',
  ],
  { stdio: 'inherit' },
);

console.log(
  'Phase 2F-A static contract verification passed (PostgreSQL execution syntax is not proven)',
);
