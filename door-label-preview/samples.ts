import type { NativeDoorLine, NativeJobAggregate } from '../lib/jobs/job-intake-types';

const audit = {
  createdAt: '2026-01-12T17:00:00Z',
  updatedAt: '2026-01-12T17:00:00Z',
  createdByUserId: 'sample-user',
  updatedByUserId: 'sample-user',
};

const interiorDoor: NativeDoorLine = {
  ...audit,
  lineId: 'sample-door-1', lineIndex: 1, lineStatus: 'Active', mode: 'Interior',
  doorType: 'Flush', config: 'D', width: "3'0\"", height: "6'8\"",
  hand: 'LH', jambWidth: '4-9/16"', jambType: null, qty: 2,
  doorId: 'D-101', notes: 'Protect the painted face during transport.',
  productCode: ' 00-Ab_9/2+ ',
  customSlab: null, customSlabWidth: null, customSlabHeight: null,
  prep: null, glass: null, sill: null, weatherstrip: null, hingeType: null,
  roWidth: null, roHeight: null, material: null, doorThickness: null, ripJamb: null,
  glassCalcStatus: null, glassWorkorderDetail: null, glassWarnings: [],
  glassBlockers: [], glassOverride: null, glassUnits: [], glassCalc: null,
  vendorCopyText: null, sidelightType: null, sidelightGlass: null, transomGlass: null,
  sidelightMeasurementLeft: null, sidelightMeasurementRight: null,
  panelSidelightWidth: null, panelSidelights: [], includeDiagramOnWorkOrder: false,
};

const standardJob: NativeJobAggregate = {
  ...audit,
  internalJobId: 'sample-job-1', doorGoReference: 'SAMPLE-01',
  bizTrackSalesOrder: '000123', customer: 'Cedar Ridge Builders',
  siteAddress: '124 Sample Crescent, Surrey, BC', phone: null, email: null,
  salesperson: null, lifecycleStage: 'Confirmed Job', notes: null, hingeColor: null,
  shopHours: null, shopHoursSource: null, poNumbers: [], fulfillmentPlan: null,
  deliveryDate: null, customerPickupDate: null, shopDate: null, shopDateSource: null,
  revision: 1,
  lines: [
    interiorDoor,
    { ...interiorDoor, lineId: 'sample-door-2', lineIndex: 2, width: "2'8\"", hand: 'RH', qty: 1,
      doorId: 'D-102', notes: 'Stage separately for the second floor.', productCode: '00004218' },
  ],
};

const installationNotes = 'Deliver to the covered staging area. Keep the units upright and wrapped until the installer is on site. Confirm the floor and opening number against the installation schedule.';

export const samples = [
  {
    title: 'Standard job',
    description: 'Three labels across two door lines. Open Optional Door ID overrides to try a different ID on copy 2. The first barcode includes leading and trailing spaces, leading zeros, mixed case, and punctuation.',
    job: standardJob,
  },
  {
    title: 'Long customer name and notes',
    description: 'One label with a wrapping customer name and multi-line handling notes.',
    job: {
      ...standardJob, internalJobId: 'sample-job-2', bizTrackSalesOrder: '000124',
      customer: 'North Shore Heritage Millwork & Renovations Ltd.',
      lines: [{ ...interiorDoor, qty: 1, notes: 'Protect the finished face.\nKeep the hardware pack with the unit.' }],
    },
  },
  {
    title: 'Notes that exceed the label',
    description: 'Try Omit line notes from this batch to enable printing.',
    job: {
      ...standardJob, internalJobId: 'sample-job-3', bizTrackSalesOrder: '000125',
      lines: [{ ...interiorDoor, qty: 1, notes: Array(5).fill(installationNotes).join('\n') }],
    },
  },
];
