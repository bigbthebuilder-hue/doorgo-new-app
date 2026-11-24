export type ActionViewport = { left: number; top: number; width: number; height: number };
export function clampActionCard(point: { x: number; y: number }, size: { width: number; height: number }, viewport: ActionViewport) {
  const left = viewport.left + 8, top = viewport.top + 8;
  return { x: Math.max(left, Math.min(point.x, viewport.left + viewport.width - size.width - 8)), y: Math.max(top, Math.min(point.y, viewport.top + viewport.height - size.height - 8)) };
}
export function centreActionCard(size: { width: number; height: number }, viewport: ActionViewport) {
  return clampActionCard({ x: viewport.left + (viewport.width - size.width) / 2, y: viewport.top + (viewport.height - size.height) / 2 }, size, viewport);
}
