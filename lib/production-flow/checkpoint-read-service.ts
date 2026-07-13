import 'server-only';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import { hasAtLeastView, type CurrentDoorGoAccess } from '@/lib/auth/access';
import { isValidDateOnly, type CheckpointReadItem, type CheckpointReadStatus } from './checkpoint-page-contract';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER = /^-?\d+(?:\.\d+)?$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export class CheckpointReadFailure extends Error {
  constructor(public readonly code: 'access_denied' | 'unavailable') { super(code); }
}

function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function number(value: unknown, nullable: boolean): number | null | undefined {
  if (value === null && nullable) return null;
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !NUMBER.test(value))) return undefined;
  const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined;
}
function nullableText(value: unknown): string | null | undefined { return value === null ? null : typeof value === 'string' ? value : undefined; }

export function normalizeCheckpointReadRow(raw: unknown): CheckpointReadItem | null {
  if (!object(raw)) return null;
  const calculated = number(raw.calculated_opening_carry_hours, true);
  const actual = number(raw.actual_opening_carry_hours, false);
  const adjustment = number(raw.adjustment_hours, true);
  const note = nullableText(raw.note); const reason = nullableText(raw.removal_reason); const recorder = nullableText(raw.recorded_by_display_name);
  if (typeof raw.checkpoint_id !== 'string' || !UUID.test(raw.checkpoint_id) || typeof raw.production_date !== 'string' || !DATE.test(raw.production_date) || !isValidDateOnly(raw.production_date)
    || !Number.isInteger(raw.revision_number) || Number(raw.revision_number) < 1 || !['confirmed', 'revised', 'removed'].includes(String(raw.status))
    || calculated === undefined || actual === undefined || actual === null || adjustment === undefined || note === undefined || reason === undefined || recorder === undefined
    || typeof raw.recorded_at !== 'string' || !TIMESTAMP.test(raw.recorded_at) || !Number.isFinite(Date.parse(raw.recorded_at))) return null;
  return { checkpointId: raw.checkpoint_id, productionDate: raw.production_date, revisionNumber: raw.revision_number as number,
    status: raw.status as CheckpointReadStatus, calculatedOpeningCarryHours: calculated, actualOpeningCarryHours: actual,
    adjustmentHours: adjustment, note, removalReason: reason, recordedAt: raw.recorded_at, recordedByDisplayName: recorder };
}

async function read(name: 'read_production_flow_checkpoint_day' | 'read_recent_production_flow_checkpoint_history', parameters: Record<string, unknown>): Promise<CheckpointReadItem[]> {
  const supabase = await createAuthenticatedSupabaseServerClient();
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) {
    const message = typeof error.message === 'string' ? error.message.trim() : '';
    if (['checkpoint_read.authentication_required', 'checkpoint_read.active_profile_required', 'checkpoint_read.permission_required'].includes(message)) throw new CheckpointReadFailure('access_denied');
    throw new CheckpointReadFailure('unavailable');
  }
  if (!Array.isArray(data)) throw new CheckpointReadFailure('unavailable');
  const rows = data.map(normalizeCheckpointReadRow);
  if (rows.some((row) => row === null)) throw new CheckpointReadFailure('unavailable');
  return rows as CheckpointReadItem[];
}

export async function loadAuthorizedCheckpointReads(access: CurrentDoorGoAccess, productionDate: string, recentLimit: number): Promise<{ revisions: CheckpointReadItem[]; recent: CheckpointReadItem[] }> {
  if (!hasAtLeastView(access, 'production_checkpoints')) throw new CheckpointReadFailure('access_denied');
  const [revisions, recent] = await Promise.all([
    read('read_production_flow_checkpoint_day', { p_production_date: productionDate }),
    read('read_recent_production_flow_checkpoint_history', { p_limit: recentLimit }),
  ]);
  if (revisions.some((item, index) => item.productionDate !== productionDate || (index > 0 && item.revisionNumber >= revisions[index - 1].revisionNumber))
    || revisions[0]?.status === 'revised' || recent.length > recentLimit
    || recent.some((item, index) => index > 0 && (item.productionDate > recent[index - 1].productionDate || (item.productionDate === recent[index - 1].productionDate && item.revisionNumber >= recent[index - 1].revisionNumber)))) {
    throw new CheckpointReadFailure('unavailable');
  }
  return { revisions, recent };
}
