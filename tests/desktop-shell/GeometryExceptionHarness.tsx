import { useState } from 'react';
import { initialBuilderDraft } from '@/components/jobs/GlassUnitBuilder';
import { DoorLineWorkspace } from '@/components/jobs/DoorLineWorkspace';
import { defaultDoorLine } from '@/lib/jobs/door-line-contract';
import { applyManualGeometryOverride } from '@/lib/jobs/glass-geometry-contract';
import type { DoorLineInput } from '@/lib/jobs/job-intake-types';

export function GeometryExceptionHarness({ kind = 'warning' }: { kind?: 'warning' | 'normal' | 'blocked' | 'historical' }) {
  const [lines, setLines] = useState<DoorLineInput[]>(() => {
    const line: DoorLineInput = initialBuilderDraft({ ...defaultDoorLine('Exterior'), lineId: '11111111-1111-4111-8111-111111111111', config: 'SD', roWidth: kind === 'blocked' ? '12' : '60', roHeight: kind === 'normal' ? '' : '84', sidelightType: 'Glass', sidelightGlass: 'CLR_SB60_K4SG' });
    if (kind === 'historical') line.glassOverride = applyManualGeometryOverride({ line, acceptedValues: { headerWidth: '999' }, reason: 'Historical approval', accessLevel: 'use', actorUserId: 'fixture', actorDisplayName: 'Fixture Approver', appliedAt: '2026-09-28T12:00:00Z' });
    return [line];
  });
  return <><DoorLineWorkspace canEdit lifecycleStage="Draft" lines={lines} onChange={setLines}/><output hidden data-testid="saved-exceptions">{JSON.stringify(lines)}</output></>;
}
