import assert from 'node:assert/strict';
import { defaultDoorLine } from './door-line-contract';
import { EXTERIOR_GLASS_EDITOR_CONFIGS, calculationPresentation, canCommitGlassCalculation, diagramSemanticLayout, glassEditorVisibility, nextGlassBuilderDraft } from './glass-editor-contract';
import { calculateGlassDiagramLayout, type GlassDiagramPart } from './glass-diagram-contract';
import { calculateGlassGeometry, GLASS_CONFIGS, glassConfigurationTopology, retainCompatibleGlassFields } from './glass-geometry-contract';

assert.deepEqual(EXTERIOR_GLASS_EDITOR_CONFIGS, ['SD', 'DS', 'SDS', 'SDDS', 'T/D', 'T/DD', 'T/SD', 'T/DS', 'T/SDS', 'T/SDDS']);
const exterior = { ...defaultDoorLine('Exterior'), config: 'SD', sidelightType: 'Glass' as const };
assert.equal(glassEditorVisibility(exterior).showSidelightGlass, true);
assert.equal(glassEditorVisibility({ ...exterior, sidelightType: 'Panel' }).showPanelWidth, true);
assert.equal(glassEditorVisibility({ ...exterior, config: 'T/SD' }).showTransomGlass, true);
assert.equal(glassEditorVisibility({ ...defaultDoorLine('Interior'), config: 'SD' }).showGlassMeasure, false, 'glass editor is unavailable for Interior');
assert.deepEqual(diagramSemanticLayout('SD'), { left: 'sidelight', center: 'single-door', right: null, transom: false });
assert.deepEqual(diagramSemanticLayout('DS'), { left: null, center: 'single-door', right: 'sidelight', transom: false });
assert.deepEqual(diagramSemanticLayout('T/SDDS'), { left: 'sidelight', center: 'double-door', right: 'sidelight', transom: true });
const mirrored = retainCompatibleGlassFields({ ...exterior, sidelightMeasurementLeft: `12"`, glassCalc: { stale: 'yes' } }, 'DS', 'Glass');
assert.equal(mirrored.sidelightMeasurementLeft, null); assert.equal(mirrored.glassCalc, null);
const panel = retainCompatibleGlassFields({ ...exterior, glassCalc: { stale: 'yes' }, vendorCopyText: 'stale' }, 'SD', 'Panel');
assert.equal(panel.glassCalc, null); assert.equal(panel.vendorCopyText, null);

function calculatedLine(config: (typeof GLASS_CONFIGS)[number], sidelightType: 'Glass' | 'Panel' = 'Glass') {
  return {
    ...defaultDoorLine('Exterior'), config, width: `3'0"`, height: `6'8"`, material: 'fiberglass',
    roWidth: config.includes('DD') ? '96' : config.includes('SDS') ? '78' : config === 'T/D' ? '38' : config === 'T/DD' ? '75' : '60',
    roHeight: config.startsWith('T/') ? '96' : '', sidelightType,
    sidelightGlass: 'CLR_SB60_K4SG', transomGlass: 'CLR_SB60_K4SG', panelSidelightWidth: '11 3/4',
  };
}

for (const config of GLASS_CONFIGS) {
  const layout = calculateGlassDiagramLayout(calculatedLine(config));
  assert.ok(layout, `${config} has an engine-derived diagram layout`);
  const resolvedLayout = layout!;
  const topology = glassConfigurationTopology(config);
  assert.equal(resolvedLayout.parts.filter((part) => part.kind === 'divider').length, topology.sidelightPositions.length, `${config} renders every vertical divider`);
  assert.equal(resolvedLayout.parts.filter((part) => part.kind === 'transom-divider').length, topology.hasTransom ? 1 : 0, `${config} renders its transom bar`);
  for (const side of new Set(topology.sidelightPositions)) {
    const lite: GlassDiagramPart | undefined = resolvedLayout.parts.find((part) => part.id === `${side}-sidelight-1`);
    const divider: GlassDiagramPart | undefined = resolvedLayout.parts.find((part) => part.id === `${side}-divider-1`);
    assert.ok(lite && divider);
    assert.equal(side === 'left' ? lite.x + lite.width : divider.x + divider.width, side === 'left' ? divider.x : lite.x, `${config} ${side} edges align at the divider boundary`);
  }
  if (topology.hasTransom) {
    const transom = resolvedLayout.parts.find((part) => part.id === 'transom');
    const bar = resolvedLayout.parts.find((part) => part.id === 'transom-divider');
    const door = resolvedLayout.parts.find((part) => part.kind === 'door');
    assert.ok(transom && bar && door);
    assert.equal(transom.y + transom.height, bar.y, `${config} transom meets its calculated bar`);
    assert.equal(bar.y + bar.height, door.y, `${config} body begins at the calculated transom-bar boundary`);
  }
}
const glassLayout = calculateGlassDiagramLayout(calculatedLine('SD', 'Glass'))!;
const panelLayout = calculateGlassDiagramLayout(calculatedLine('SD', 'Panel'))!;
assert.equal(glassLayout.dividerWidth, 2.25);
assert.equal(panelLayout.dividerWidth, 1.5);
assert.notEqual(glassLayout.parts.find((part) => part.kind === 'divider')?.width, panelLayout.parts.find((part) => part.kind === 'divider')?.width, 'calculated divider sizes render at visibly different physical widths');
const rightLabel = calculateGlassDiagramLayout(calculatedLine('DS'))!.parts.find((part) => part.id === 'right-sidelight-1')!;
assert.equal(rightLabel.label, 'R', 'narrow DS label is shortened within its own calculated region');
assert.equal(rightLabel.x > calculateGlassDiagramLayout(calculatedLine('SD'))!.parts.find((part) => part.id === 'left-sidelight-1')!.x, true, 'SD and DS labels remain mirrored');
assert.deepEqual(calculationPresentation('Ready', 'Glass Detail Needed'), { displayStatus: 'Incomplete', persistedStatus: 'Ready' }, 'calculation does not persist Glass Detail Needed without explicit leave');
for (const status of ['Complete', 'Warning', 'Blocked'] as const) assert.deepEqual(calculationPresentation('Glass Detail Needed', status), { displayStatus: status, persistedStatus: status }, `recalculation clears prior detail-needed state to ${status}`);
assert.equal(canCommitGlassCalculation('Glass Detail Needed', false), false);
assert.equal(canCommitGlassCalculation('Glass Detail Needed', true), true, 'explicit Leave Glass Detail Needed permits incomplete persistence');
const nextType = nextGlassBuilderDraft({ sidelightType: null, glassOverride: { reason: 'old' } } as never, 'sidelightType', 'Glass');
assert.equal(nextType.sidelightType, 'Glass');
assert.equal(nextType.glassOverride, null);
assert.equal(nextType.glassCalcStatus, 'Ready');
const nextTransom = nextGlassBuilderDraft({ transomGlass: null } as never, 'transomGlass', 'CLR_SB60_K4SG');
assert.equal(nextTransom.transomGlass, 'CLR_SB60_K4SG');
const incompleteTransom = calculatedLine('T/SD');
incompleteTransom.transomGlass = '';
assert.deepEqual(calculateGlassGeometry(incompleteTransom).incompleteDetails.map((issue) => issue.code), ['transom_glass_required']);
const completedTransom = nextGlassBuilderDraft(incompleteTransom, 'transomGlass', 'CLR_SB60_K4SG');
assert.equal(calculateGlassGeometry(completedTransom).status, 'Complete', 'the next draft clears the transom need immediately');
assert.equal(canCommitGlassCalculation('Glass Detail Needed', false), false, 'normal use cannot silently bypass progressive validation');
assert.equal(canCommitGlassCalculation('Blocked', true), true, 'the UI/domain blocker boundary, not progressive acceptance, remains responsible for blocked geometry');
console.log('J2B2 progressive editor contract: PASS');
