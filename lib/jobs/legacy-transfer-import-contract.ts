import { LEGACY_TRANSFER_MAX_BYTES, type LegacyTransferIssue } from './legacy-transfer-types';

export type LegacyTransferFilePreflight =
  | { ok: true }
  | { ok: false; message: string };

export function legacyTransferFilePreflight(file: { name: string; size: number }): LegacyTransferFilePreflight {
  if (!file.name.toLocaleLowerCase().endsWith('.json')) return { ok: false, message: 'Select one downloaded .json legacy-transfer file.' };
  if (file.size > LEGACY_TRANSFER_MAX_BYTES) return { ok: false, message: 'The legacy-transfer file exceeds the 1 MiB limit.' };
  if (file.size === 0) return { ok: false, message: 'The selected legacy-transfer file is empty.' };
  return { ok: true };
}

export function unresolvedTransferBlockers(blockers: LegacyTransferIssue[]): LegacyTransferIssue[] {
  return blockers.filter((issue) => !issue.code.startsWith('native_header_validation') && !issue.code.startsWith('native_line_validation'));
}
