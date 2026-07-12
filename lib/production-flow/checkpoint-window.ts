import { PRODUCTION_FLOW_BASELINE_DATE } from '../production-board/flow-constants';

export function selectCheckpointAwareCalculationStart(params: {
  boardStart: string;
  checkpointAnchorDate: string | null;
}): string {
  if (params.checkpointAnchorDate) {
    return params.checkpointAnchorDate;
  }

  return params.boardStart >= PRODUCTION_FLOW_BASELINE_DATE
    ? PRODUCTION_FLOW_BASELINE_DATE
    : params.boardStart;
}
