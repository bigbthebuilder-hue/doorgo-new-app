export type GlassUnitComposition = {
  door: 'D' | 'DD';
  leftSidelightCount: number;
  rightSidelightCount: number;
  hasTransom: boolean;
};

export type GlassCompositionParseResult =
  | { ok: true; value: GlassUnitComposition; canonicalConfig: string }
  | { ok: false; code: 'invalid_configuration'; message: string };

const count = (value: string, token: string) => value.split('').filter((entry) => entry === token).length;

export function resolveGlassUnitConfiguration(composition: GlassUnitComposition): string {
  if (!Number.isSafeInteger(composition.leftSidelightCount) || composition.leftSidelightCount < 0 ||
      !Number.isSafeInteger(composition.rightSidelightCount) || composition.rightSidelightCount < 0) {
    throw new Error('Sidelight counts must be nonnegative integers.');
  }
  return `${composition.hasTransom ? 'T/' : ''}${'S'.repeat(composition.leftSidelightCount)}${composition.door}${'S'.repeat(composition.rightSidelightCount)}`;
}

export function parseGlassUnitConfiguration(value: unknown): GlassCompositionParseResult {
  const raw = String(value ?? '').trim().toUpperCase();
  const normalized = raw.startsWith('T-') ? `T/${raw.slice(2)}` : raw;
  const hasTransom = normalized.startsWith('T/');
  const body = hasTransom ? normalized.slice(2) : normalized;
  const match = /^(S*)(DD|D)(S*)$/.exec(body);
  if (!match) return { ok: false, code: 'invalid_configuration', message: 'Configuration must contain one D or DD with optional exterior-view sidelights and T/ transom prefix.' };
  const valueResult: GlassUnitComposition = {
    door: match[2] as 'D' | 'DD',
    leftSidelightCount: count(match[1], 'S'),
    rightSidelightCount: count(match[3], 'S'),
    hasTransom,
  };
  return { ok: true, value: valueResult, canonicalConfig: resolveGlassUnitConfiguration(valueResult) };
}

export function totalSidelightCount(value: GlassUnitComposition): number {
  return value.leftSidelightCount + value.rightSidelightCount;
}

export function isFrameGlassBuilderComposition(value: GlassUnitComposition): boolean {
  return value.hasTransom || totalSidelightCount(value) > 0;
}

export function isFrameGlassConfiguration(value: unknown): boolean {
  const parsed = parseGlassUnitConfiguration(value);
  return parsed.ok && isFrameGlassBuilderComposition(parsed.value);
}

export function normalizeExteriorSwing(value: unknown): 'LH' | 'RH' | 'LHOUT' | 'RHOUT' | null {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'LH' || normalized === 'RH') return normalized;
  if (normalized === 'LHOUT' || normalized === 'LHOS') return 'LHOUT';
  if (normalized === 'RHOUT' || normalized === 'RHOS') return 'RHOUT';
  return null;
}

export function placeSingleSidelightForSwing(composition: GlassUnitComposition, swing: unknown): GlassUnitComposition {
  if (totalSidelightCount(composition) !== 1) return { ...composition };
  const normalized = normalizeExteriorSwing(swing);
  if (!normalized) return { ...composition };
  const right = normalized === 'LH' || normalized === 'RHOUT';
  return { ...composition, leftSidelightCount: right ? 0 : 1, rightSidelightCount: right ? 1 : 0 };
}

export type GlassPhysicalComponent =
  | { kind: 'sidelight'; side: 'left' | 'right'; index: number }
  | { kind: 'door'; index: number }
  | { kind: 'transom'; index: 1 };

export function orderedGlassUnitComponents(value: GlassUnitComposition): GlassPhysicalComponent[] {
  return [
    ...Array.from({ length: value.leftSidelightCount }, (_, index) => ({ kind: 'sidelight' as const, side: 'left' as const, index: index + 1 })),
    ...Array.from({ length: value.door === 'DD' ? 2 : 1 }, (_, index) => ({ kind: 'door' as const, index: index + 1 })),
    ...Array.from({ length: value.rightSidelightCount }, (_, index) => ({ kind: 'sidelight' as const, side: 'right' as const, index: index + 1 })),
    ...(value.hasTransom ? [{ kind: 'transom' as const, index: 1 as const }] : []),
  ];
}
