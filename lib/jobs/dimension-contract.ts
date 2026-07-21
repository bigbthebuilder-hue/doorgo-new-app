export type DimensionParseResult =
  | { ok: true; inches: number; formatted: string }
  | { ok: false; code: 'required' | 'units_required' | 'malformed' | 'nonpositive' | 'unsupported_precision'; message: string };

export const DIMENSION_FORMAT_HELP = `Use explicit shop units, for example 3', 3'0", 36", 35 3/4", 35-3/4", or 35.75".`;

function gcd(left: number, right: number): number {
  return right ? gcd(right, left % right) : left;
}

export function formatDimension(inches: number): string {
  if (!Number.isFinite(inches)) return '';
  const rounded = Math.round(inches * 16) / 16;
  const sign = rounded < 0 ? '-' : '';
  const absolute = Math.abs(rounded);
  const feet = Math.floor(absolute / 12);
  let wholeInches = Math.floor(absolute - feet * 12 + 1e-9);
  let sixteenths = Math.round((absolute - feet * 12 - wholeInches) * 16);
  if (sixteenths === 16) { wholeInches += 1; sixteenths = 0; }
  const fraction = sixteenths
    ? (() => { const divisor = gcd(sixteenths, 16); return `${sixteenths / divisor}/${16 / divisor}`; })()
    : '';
  const inchText = fraction ? `${wholeInches ? `${wholeInches} ` : ''}${fraction}` : String(wholeInches);
  return feet ? `${sign}${feet}' ${inchText}"` : `${sign}${inchText}"`;
}

function parseInchPart(source: string): number | null {
  if (/^\d+(?:\.\d+)?$/.test(source)) return Number(source);
  const match = source.match(/^(?:(\d+)[ -])?(\d+)\/(\d+)$/);
  if (!match) return null;
  const whole = Number(match[1] ?? 0);
  const numerator = Number(match[2]);
  const denominator = Number(match[3]);
  if (![2, 4, 8, 16].includes(denominator) || numerator <= 0 || numerator >= denominator) return null;
  return whole + numerator / denominator;
}

export function parseDimension(value: unknown): DimensionParseResult {
  const source = String(value ?? '').trim().replace(/[′’]/g, "'").replace(/[″“”]/g, '"');
  if (!source) return { ok: false, code: 'required', message: `Enter a dimension. ${DIMENSION_FORMAT_HELP}` };
  if (Number(source) === Number(source)) return { ok: false, code: 'units_required', message: `Dimensions require ' or ". ${DIMENSION_FORMAT_HELP}` };
  if (source.startsWith('-')) return { ok: false, code: 'nonpositive', message: `Dimensions must be greater than zero. ${DIMENSION_FORMAT_HELP}` };

  let feet = 0;
  let inches = 0;
  const feetMatch = source.match(/^(\d+)'(?:\s*(.*))?$/);
  if (feetMatch) {
    feet = Number(feetMatch[1]);
    const rest = (feetMatch[2] ?? '').trim();
    if (rest) {
      if (!rest.endsWith('"')) return { ok: false, code: 'units_required', message: `Additional inches require ". ${DIMENSION_FORMAT_HELP}` };
      const parsed = parseInchPart(rest.slice(0, -1).trim());
      if (parsed === null || parsed >= 12) return { ok: false, code: 'malformed', message: `Enter valid feet-and-inches notation. ${DIMENSION_FORMAT_HELP}` };
      inches = parsed;
    }
  } else if (source.endsWith('"')) {
    const parsed = parseInchPart(source.slice(0, -1).trim());
    if (parsed === null) return { ok: false, code: 'malformed', message: `Enter valid inch notation. ${DIMENSION_FORMAT_HELP}` };
    inches = parsed;
  } else {
    return { ok: false, code: 'units_required', message: `Dimensions require ' or ". ${DIMENSION_FORMAT_HELP}` };
  }

  const total = feet * 12 + inches;
  if (!(total > 0)) return { ok: false, code: 'nonpositive', message: `Dimensions must be greater than zero. ${DIMENSION_FORMAT_HELP}` };
  const normalized = Math.round(total * 16) / 16;
  if (Math.abs(normalized - total) > 1e-9) {
    return { ok: false, code: 'unsupported_precision', message: `Use precision no finer than 1/16 inch. ${DIMENSION_FORMAT_HELP}` };
  }
  return { ok: true, inches: normalized, formatted: formatDimension(normalized) };
}
