import { useState } from 'react';
import { DoorLineWorkspace } from '@/components/jobs/DoorLineWorkspace';
import { defaultDoorLine } from '@/lib/jobs/door-line-contract';
import type { DoorLineInput } from '@/lib/jobs/job-intake-types';

export function InlineGlassHarness({ manyLines = false }: { manyLines?: boolean }) {
  const [lines, setLines] = useState<DoorLineInput[]>([{
    ...defaultDoorLine('Exterior'), lineId: '11111111-1111-4111-8111-111111111111', lineStatus: 'Active', lineIndex: 1,
    config: 'T/DS', doorType: 'Original SKU', construction: 'low-profile-quarter-sill', roWidth: '54', roHeight: '95',
    transomTBarSize: '1.5', sidelightType: 'Glass', sidelightGlass: 'CLR_SB60_K4SG', transomGlassTypeCode: 'CLEAR',
  }, ...(manyLines ? Array.from({ length: 24 }, (_, index): DoorLineInput => ({ ...defaultDoorLine('Exterior'), lineId: 'fixture-' + index, lineIndex: index + 2, lineStatus: index === 23 ? 'Archived' : 'Active', doorType: 'Saved line ' + (index + 2) })) : [])]);
  return <div className="app-shell-main" data-scroll-owner="workspace" style={{ height: '100vh' }}><div className="app-workspace job-editor-workspace"><div className="job-editor-surface"><div/><div/><div className="mt-3"><DoorLineWorkspace canEdit lifecycleStage="Draft" lines={lines} onChange={setLines}/></div><div/><footer><button type="button">Save</button><button type="button">Save and Exit</button></footer></div><output hidden data-testid="saved-lines">{JSON.stringify(lines)}</output></div></div>;
}
