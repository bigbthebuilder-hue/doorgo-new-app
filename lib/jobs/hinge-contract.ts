import type { DoorLineMode } from './job-intake-types';

export const HINGE_COLOR_OPTIONS = [
  { value: '', label: 'No color selected' },
  { value: 'L1', label: 'L1 — Black' },
  { value: 'C15', label: 'C15 — Satin Nickel' },
  { value: 'C4', label: 'C4 — Satin Brass' },
  { value: '10B', label: '10B — Oil Rubbed Bronze' },
  { value: 'C26', label: 'C26 — Bright Chrome' },
  { value: '26D', label: '26D — Satin Chrome' },
  { value: 'SS', label: 'SS — Stainless Steel' },
] as const;

export const INTERIOR_HINGE_TYPES = ['REG', 'BB'] as const;
export const EXTERIOR_HINGE_TYPES = ['REG', 'BB', 'NRP', 'BOM'] as const;
export const HINGE_COLOR_MESSAGE = 'Job hinge color must be blank or one of L1, C15, C4, 10B, C26, 26D, or SS.';

export type HingeNormalization =
  | { ok: true; value: string | null }
  | { ok: false; message: string };

export function hingeNotApplicable(mode: unknown, config: unknown): boolean {
  return mode === 'Interior' && (config === 'PKT' || config === 'B.P.');
}

export function normalizeHingeColor(value: unknown): HingeNormalization {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/\s+NRP$/, '').trim();
  if (!normalized) return { ok: true, value: null };
  if (HINGE_COLOR_OPTIONS.some((option) => option.value === normalized)) return { ok: true, value: normalized };
  return { ok: false, message: HINGE_COLOR_MESSAGE };
}

export function hingeTypeOptions(mode: DoorLineMode): readonly string[] {
  return mode === 'Interior' ? INTERIOR_HINGE_TYPES : EXTERIOR_HINGE_TYPES;
}

export function normalizeHingeType(mode: unknown, config: unknown, value: unknown): HingeNormalization {
  if (hingeNotApplicable(mode, config)) return { ok: true, value: null };
  if (mode !== 'Interior' && mode !== 'Exterior') return { ok: false, message: 'Choose Interior or Exterior before selecting a hinge type.' };
  const normalized = String(value ?? '').trim().toUpperCase() || 'REG';
  if (hingeTypeOptions(mode).includes(normalized)) return { ok: true, value: normalized };
  return { ok: false, message: mode === 'Interior' ? 'Interior doors may use REG or BB hinges only.' : 'Exterior doors may use REG, BB, NRP, or BOM hinges only.' };
}

export function hingeTypeAfterModeChange(mode: DoorLineMode, config: unknown, value: unknown): string {
  if (hingeNotApplicable(mode, config)) return '';
  const normalized = String(value ?? '').trim().toUpperCase();
  if (mode === 'Interior' && (normalized === 'NRP' || normalized === 'BOM')) return 'REG';
  const result = normalizeHingeType(mode, config, normalized);
  return result.ok ? (result.value ?? '') : 'REG';
}

export function workOrderHingeDisplay(input: {
  mode: unknown; config: unknown; hingeType: unknown; hingeColor: unknown; hand: unknown;
}): string {
  if (hingeNotApplicable(input.mode, input.config)) return '';
  const type = normalizeHingeType(input.mode, input.config, input.hingeType);
  const color = normalizeHingeColor(input.hingeColor);
  if (!type.ok || !color.ok || !type.value) return '';
  const outswing = input.mode === 'Exterior' && String(input.hand ?? '').trim().toUpperCase().endsWith('OUT');
  if (type.value === 'BOM') return ['BOM', color.value].filter(Boolean).join(' ');
  if (type.value === 'REG') return outswing ? 'SS' : (color.value ?? '');
  return [type.value, outswing ? 'SS' : color.value].filter(Boolean).join(' ');
}
