export type FulfillmentType = 'delivery' | 'customer_pickup';

export function normalizeSalesOrder(value: string): string | null {
  const normalized = value.trim();
  return /^\d+$/.test(normalized) ? normalized : null;
}

export function salesOrderFamily(value: string): string | null {
  const salesOrder = normalizeSalesOrder(value);
  if (!salesOrder) return null;
  const ending = Number(salesOrder.at(-1));
  const baseEnding = ending <= 4 ? 0 : 5;
  return `${salesOrder.slice(0, -1)}${baseEnding}`;
}

export function validateBackorderSalesOrder(baseSalesOrder: string, candidate: string): { ok: true; familyKey: string; salesOrder: string } | { ok: false; message: string } {
  const base = normalizeSalesOrder(baseSalesOrder);
  const salesOrder = normalizeSalesOrder(candidate);
  const familyKey = base ? salesOrderFamily(base) : null;
  if (!base || !salesOrder || !familyKey) return { ok: false, message: 'Enter a numeric BizTrack Sales Order.' };
  if (salesOrder === familyKey) return { ok: false, message: 'Enter an actual backorder Sales Order, not the original order.' };
  if (salesOrderFamily(salesOrder) !== familyKey) return { ok: false, message: `Backorder Sales Order must belong to the ${familyKey} order family.` };
  return { ok: true, familyKey, salesOrder };
}

export function nextAvailableBackorderSalesOrder(baseSalesOrder:string,currentOrders:string[]):string|null{
  const base=normalizeSalesOrder(baseSalesOrder);if(!base)return null;const occupied=new Set(currentOrders.map(normalizeSalesOrder).filter((value):value is string=>Boolean(value)));const value=Number(base);if(!Number.isSafeInteger(value))return null;
  for(let offset=1;offset<=4;offset+=1){const candidate=String(value+offset);if(salesOrderFamily(candidate)===salesOrderFamily(base)&&!occupied.has(candidate))return candidate;}
  return null;
}

export function fulfillmentCardOrderLabel(orders: string[], fallback: string | null): string | null {
  const actual = [...new Set(orders.map((value) => value.trim()).filter(Boolean))].sort();
  const first = actual[0] ?? fallback?.trim() ?? null;
  if (!first) return null;
  return actual.length > 1 ? `${first} +${actual.length - 1}` : first;
}

export function compatibleFulfillmentTiming(left: string | null, right: string | null): { compatible: boolean; timing: string | null } {
  const a = left?.trim() || null;
  const b = right?.trim() || null;
  if (a && b && a.toLocaleLowerCase() !== b.toLocaleLowerCase()) return { compatible: false, timing: null };
  return { compatible: true, timing: a ?? b };
}
