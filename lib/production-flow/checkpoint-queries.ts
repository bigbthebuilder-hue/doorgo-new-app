import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  ConfirmedFlowCheckpoint,
  ConfirmedFlowCheckpointRow,
} from './checkpoint-types';

const CHECKPOINT_SELECT = `
  checkpoint_id,
  checkpoint_series_id,
  production_date,
  opening_carry_hours,
  checkpoint_status,
  revision_number,
  calculated_opening_carry_snapshot,
  adjustment_hours_snapshot,
  calculation_version,
  note,
  recorded_at,
  recorded_by_user_id,
  actor_type,
  confirmed_at,
  confirmed_by_user_id,
  source_system
`;

export async function loadLatestConfirmedCheckpointOnOrBefore(
  productionDate: string,
): Promise<ConfirmedFlowCheckpoint | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('dg_production_flow_checkpoints')
    .select(CHECKPOINT_SELECT)
    .eq('checkpoint_status', 'confirmed')
    .lte('production_date', productionDate)
    .order('production_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load production flow checkpoint anchor: ${error.message}`);
  }

  return data ? normalizeConfirmedFlowCheckpoint(data as ConfirmedFlowCheckpointRow) : null;
}

export async function loadConfirmedCheckpointsInRange(params: {
  startDate: string;
  endDateExclusive: string;
}): Promise<ConfirmedFlowCheckpoint[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('dg_production_flow_checkpoints')
    .select(CHECKPOINT_SELECT)
    .eq('checkpoint_status', 'confirmed')
    .gte('production_date', params.startDate)
    .lt('production_date', params.endDateExclusive)
    .order('production_date', { ascending: true });

  if (error) {
    throw new Error(`Failed to load production flow checkpoints: ${error.message}`);
  }

  return ((data ?? []) as ConfirmedFlowCheckpointRow[]).map(
    normalizeConfirmedFlowCheckpoint,
  );
}

function normalizeConfirmedFlowCheckpoint(
  row: ConfirmedFlowCheckpointRow,
): ConfirmedFlowCheckpoint {
  const openingCarryHours = toRequiredHours(
    row.opening_carry_hours,
    row.checkpoint_id,
  );

  return {
    checkpointId: row.checkpoint_id,
    checkpointSeriesId: row.checkpoint_series_id,
    productionDate: row.production_date,
    openingCarryHours,
    revisionNumber: row.revision_number,
    calculatedOpeningCarrySnapshot: toOptionalHours(
      row.calculated_opening_carry_snapshot,
    ),
    adjustmentHoursSnapshot: toOptionalHours(row.adjustment_hours_snapshot),
    calculationVersion: row.calculation_version,
    note: row.note,
    recordedAt: row.recorded_at,
    recordedByUserId: row.recorded_by_user_id,
    actorType: row.actor_type,
    confirmedAt: row.confirmed_at,
    confirmedByUserId: row.confirmed_by_user_id,
    sourceSystem: row.source_system,
  };
}

function toRequiredHours(value: number | string, checkpointId: string): number {
  const hours = Number(value);

  if (!Number.isFinite(hours)) {
    throw new Error(`Checkpoint ${checkpointId} has invalid opening carry hours`);
  }

  return hours;
}

function toOptionalHours(value: number | string | null): number | null {
  if (value === null) {
    return null;
  }

  const hours = Number(value);
  return Number.isFinite(hours) ? hours : null;
}
