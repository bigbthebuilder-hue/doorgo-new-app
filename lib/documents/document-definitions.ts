export type DoorGoDocumentDefinition = {
  key: 'work_order' | 'glass_calculation';
  label: string;
  description: string;
  entryHref: string;
  availability: string;
};

export const DOORGO_DOCUMENT_DEFINITIONS: readonly DoorGoDocumentDefinition[] = [
  { key: 'work_order', label: 'Work Orders', description: 'Preview, download, print, or send the current saved revision from its Job workspace.', entryHref: '/jobs', availability: 'Generated from a saved Job; no document-history repository exists.' },
  { key: 'glass_calculation', label: 'Glass Calculations', description: 'Build and print a live calculation from the shared Glass workspace.', entryHref: '/glass-calculator', availability: 'Live calculation only; it is not stored as a document.' },
];
