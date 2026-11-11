// Copy positions are stable. Never trim the array to the current door quantity.
export function individualDoorIds(value: unknown): string[] {
  return Array.isArray(value) ? value.map((id) => typeof id === 'string' ? id : '') : [];
}
export function validIndividualDoorIds(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length <= 500 && value.every((id) => typeof id === 'string'));
}
