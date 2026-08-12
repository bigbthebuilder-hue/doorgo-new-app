import { useState } from 'react';
import { DoorLineWorkspace } from '@/components/jobs/DoorLineWorkspace';
import type { DoorLineInput } from '@/lib/jobs/job-intake-types';

export function DoorLineWorkspaceHarness() {
  const [lines, setLines] = useState<DoorLineInput[]>(Array.from({ length: 8 }, (_, index) => ({
    lineId: `line-${index}`, lineIndex: index + 1, lineStatus: 'Active', mode: 'Exterior',
    doorType: 'Madison', config: 'D', width: `2'8"`, height: `6'8"`, hand: 'LH', prep: 'D', qty: 1,
    jambWidth: '4-9/16', jambType: 'Primed', hingeType: 'REG', material: 'fiberglass',
    sill: 'Bronze', weatherstrip: 'Bronze', customSlab: 'No', doorThickness: '1-3/4',
  })));
  return <div className="app-workspace app-workspace-fluid"><DoorLineWorkspace canEdit lifecycleStage="Draft" lines={lines} onChange={setLines}/></div>;
}
