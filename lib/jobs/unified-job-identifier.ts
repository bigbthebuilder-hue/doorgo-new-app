export type UnifiedJobIdentifierKind = 'sales_order' | 'door_go_reference' | 'legacy_job_id';

export type UnifiedJobIdentity = {
  bizTrackSalesOrder?: string | null;
  doorGoReference?: string | null;
  legacyJobId?: string | null;
};

const clean = (value: string | null | undefined) => value?.trim() || null;

export function unifiedJobIdentifier(identity: UnifiedJobIdentity): {
  value: string;
  kind: UnifiedJobIdentifierKind;
  label: string;
  displayValue: string;
} {
  const salesOrder = clean(identity.bizTrackSalesOrder);
  const doorGoReference = clean(identity.doorGoReference);
  const legacyJobId = clean(identity.legacyJobId);
  if (salesOrder) return { value: salesOrder, kind: 'sales_order', label: 'Sales Order', displayValue: salesOrder };
  if (doorGoReference) return { value: doorGoReference, kind: 'door_go_reference', label: 'DoorGo reference', displayValue: doorGoReference };
  if (legacyJobId) return { value: legacyJobId, kind: 'legacy_job_id', label: 'Legacy job ID', displayValue: legacyJobId };
  throw new Error('A job requires a unified identifier.');
}
