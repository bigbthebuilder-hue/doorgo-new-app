'use server';
import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { hasAtLeastView } from '@/lib/auth/access';
import { createJobIntakeRepository } from './job-intake-repository';
import { JobIntakeFailure } from './job-intake-types';
import { loadSavedJobPrintWithAccess, type SavedJobPrintKind } from './saved-job-print-contract';
import { createSupabaseWorkOrderRecipientDirectorySource, listWorkOrderRecipientsWithAccess } from './work-order-recipient-directory';
import type { WorkOrderRecipient } from './work-order-recipient-contract';

export async function loadSavedJobPrintAction(internalJobId: string, kind: SavedJobPrintKind) {
  try {
    const access = await getCurrentDoorGoAccess();
    const context = await loadSavedJobPrintWithAccess(access, internalJobId, kind, createJobIntakeRepository());
    let recipients: WorkOrderRecipient[] = [];
    let recipientDirectoryError: string | null = null;
    if (context.kind === 'work-order') {
      try { recipients = await listWorkOrderRecipientsWithAccess(access, createSupabaseWorkOrderRecipientDirectorySource()); }
      catch { recipientDirectoryError = 'DoorGo recipients are temporarily unavailable.'; }
    }
    return { ok: true as const, context, recipients, recipientDirectoryError, canViewCalendar: hasAtLeastView(access, 'calendar') };
  } catch (error) {
    return { ok: false as const, message: error instanceof JobIntakeFailure ? error.message : 'The saved document could not be loaded. Please try again.' };
  }
}
