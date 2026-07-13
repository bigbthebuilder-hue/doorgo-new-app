'use server';

import { confirmCheckpoint, removeCheckpoint, reviseCheckpoint } from './checkpoint-service';
import type {
  CheckpointActionResult,
  ConfirmCheckpointRequest,
  RemoveCheckpointRequest,
  ReviseCheckpointRequest,
} from './checkpoint-action-contract';

export async function confirmProductionFlowCheckpoint(request: ConfirmCheckpointRequest): Promise<CheckpointActionResult> { return confirmCheckpoint(request); }
export async function reviseProductionFlowCheckpoint(request: ReviseCheckpointRequest): Promise<CheckpointActionResult> { return reviseCheckpoint(request); }
export async function removeProductionFlowCheckpoint(request: RemoveCheckpointRequest): Promise<CheckpointActionResult> { return removeCheckpoint(request); }
