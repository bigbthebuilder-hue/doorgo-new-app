import type {
  CheckpointErrorCode,
  ConfirmCheckpointRequest,
  RemoveCheckpointRequest,
  ReviseCheckpointRequest,
} from './checkpoint-action-contract';

export const PRODUCTION_TIME_ZONE = 'America/Vancouver';
export const RECENT_CHECKPOINT_HISTORY_LIMIT = 20;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export type CheckpointReadStatus = 'confirmed' | 'revised' | 'removed';
export type CheckpointReadItem = {
  checkpointId: string;
  productionDate: string;
  revisionNumber: number;
  status: CheckpointReadStatus;
  calculatedOpeningCarryHours: number | null;
  actualOpeningCarryHours: number;
  adjustmentHours: number | null;
  note: string | null;
  removalReason: string | null;
  recordedAt: string;
  recordedByDisplayName: string | null;
};

export type CheckpointCurrentState =
  | { kind: 'empty'; current: null; operation: 'confirm' }
  | { kind: 'confirmed'; current: CheckpointReadItem; operation: 'revise_remove' }
  | { kind: 'removed'; current: CheckpointReadItem; operation: 'reconfirm' };

export function getVancouverToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PRODUCTION_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function isValidDateOnly(value: string): boolean {
  const match = DATE_ONLY.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

export function selectCheckpointDate(raw: string | string[] | undefined, today: string): {
  selectedDate: string; message: string | null;
} {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) return { selectedDate: today, message: null };
  if (!isValidDateOnly(value)) return { selectedDate: today, message: 'The selected date was invalid. Today has been loaded.' };
  if (value > today) return { selectedDate: today, message: 'Future production dates are not available. Today has been loaded.' };
  return { selectedDate: value, message: null };
}

export function getCheckpointCurrentState(revisions: CheckpointReadItem[]): CheckpointCurrentState {
  const current = revisions[0];
  if (!current) return { kind: 'empty', current: null, operation: 'confirm' };
  return current.status === 'removed'
    ? { kind: 'removed', current, operation: 'reconfirm' }
    : { kind: 'confirmed', current, operation: 'revise_remove' };
}

export function checkpointHistoryStatusLabel(item: CheckpointReadItem, current: boolean): 'Confirmed' | 'Removed' | 'Previous version' {
  if (item.status === 'removed') return 'Removed';
  return current && item.status === 'confirmed' ? 'Confirmed' : 'Previous version';
}

export function getCheckpointOperations(access: 'none' | 'view' | 'use', state: CheckpointCurrentState): Array<'confirm' | 'revise' | 'remove' | 'reconfirm'> {
  if (access !== 'use') return [];
  if (state.kind === 'empty') return ['confirm'];
  if (state.kind === 'removed') return ['reconfirm'];
  return ['revise', 'remove'];
}

export function selectCalculatedCarry(params: { selectedDate: string; today: string; revisions: CheckpointReadItem[]; liveCarry: number | null }): number | null {
  if (params.selectedDate === params.today) return params.liveCarry;
  return params.revisions[0]?.calculatedOpeningCarryHours ?? null;
}

export function calculateAdjustment(actual: number | null, calculated: number | null): number | null {
  return actual === null || calculated === null ? null : actual - calculated;
}

type CommonRequest = { commandId: string; productionDate: string; openingCarryHours: number; calculatedOpeningCarrySnapshot: number | null; note: string | null };
export const buildConfirmRequest = (input: CommonRequest): ConfirmCheckpointRequest => ({ ...input, calculationVersion: 'production-board-flow-v1' });
export const buildReconfirmRequest = buildConfirmRequest;
export const buildReviseRequest = (input: CommonRequest & { expectedCheckpointId: string; expectedRevisionNumber: number }): ReviseCheckpointRequest => ({ ...input, calculationVersion: 'production-board-flow-v1' });
export const buildRemoveRequest = (input: { commandId: string; productionDate: string; expectedCheckpointId: string; expectedRevisionNumber: number; removalReason: string }): RemoveCheckpointRequest => input;

export type RetryCommandState = { commandId: string; submittedFingerprint: string | null };
export function commandForSubmission(state: RetryCommandState, fingerprint: string, createUuid: () => string): RetryCommandState {
  if (state.submittedFingerprint === null || state.submittedFingerprint === fingerprint) {
    return { commandId: state.commandId, submittedFingerprint: fingerprint };
  }
  return { commandId: createUuid(), submittedFingerprint: fingerprint };
}

export function checkpointActionMessage(code: CheckpointErrorCode): string {
  switch (code) {
    case 'stale_revision': return 'This checkpoint changed after the page was opened. The latest version has been loaded.';
    case 'already_confirmed': return 'A checkpoint has already been confirmed for this date.';
    case 'not_found': return 'The checkpoint is no longer available. The latest history has been loaded.';
    case 'command_uuid_collision': return 'This operation conflicts with an earlier request. Change the form to begin a new operation.';
    case 'permission_required': case 'authentication_required': case 'active_profile_required': return 'Your access to production checkpoints is no longer available.';
    default: return 'The checkpoint could not be saved. Check the form and try again.';
  }
}
