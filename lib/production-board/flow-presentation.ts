export type FlowOperationalStatus =
  | 'unresolved'
  | 'building'
  | 'reducing'
  | 'unchanged'
  | 'clear';

const HOUR_COMPARISON_EPSILON = 1e-9;

export function classifyFlowOperationalStatus(params: {
  unresolved: boolean;
  openingCarry: number | null;
  endingCarry: number | null;
}): FlowOperationalStatus {
  if (
    params.unresolved ||
    params.openingCarry === null ||
    params.endingCarry === null
  ) {
    return 'unresolved';
  }

  if (Math.abs(params.endingCarry) < HOUR_COMPARISON_EPSILON) {
    return 'clear';
  }

  const carryDifference = params.endingCarry - params.openingCarry;

  if (Math.abs(carryDifference) < HOUR_COMPARISON_EPSILON) {
    return 'unchanged';
  }

  return carryDifference > 0 ? 'building' : 'reducing';
}

export function dailyFlowStatusLabel(status: FlowOperationalStatus): string {
  switch (status) {
    case 'building':
      return 'Carry building';
    case 'reducing':
      return 'Carry reducing';
    case 'unchanged':
      return 'Carry unchanged';
    case 'clear':
      return 'Clear after flow';
    default:
      return 'Flow unresolved';
  }
}

export function weeklyFlowStatusLabel(status: FlowOperationalStatus): string {
  switch (status) {
    case 'building':
      return 'Carry building';
    case 'reducing':
      return 'Carry reducing';
    case 'unchanged':
      return 'Carry unchanged';
    case 'clear':
      return 'Accumulated load clears';
    default:
      return 'Flow unresolved';
  }
}

export function startsOnlyBalanceLabel(params: {
  comparisonComplete: boolean;
  remainingHours: number | null;
  overloadHours: number | null;
}): string {
  if (!params.comparisonComplete) {
    return 'Starts-only comparison incomplete';
  }

  if (params.overloadHours !== null && params.overloadHours > 0) {
    return `Starts ${formatHoursWithUnit(params.overloadHours)} over capacity`;
  }

  if (params.remainingHours !== null && params.remainingHours > 0) {
    return `Starts ${formatHoursWithUnit(params.remainingHours)} under capacity`;
  }

  return 'Starts match capacity';
}

function formatHoursWithUnit(value: number): string {
  return `${value.toFixed(2)} ${value === 1 ? 'hr' : 'hrs'}`;
}
