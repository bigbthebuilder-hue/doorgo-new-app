import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertConfirmedJobActiveLineInvariant, calculateJ2AShopHours, normalizeDoorLineInput } from './door-line-contract';
import { geometryChanged } from './glass-geometry-contract';
import { formatDoorGoReference, isUuid, normalizeJobHeaderInput } from './job-intake-contract';
import {
  JobIntakeFailure,
  type CreateJobHeaderCommand,
  type DoorLineInput,
  type JobIntakeRepository,
  type NativeDoorLine,
  type NativeJobAggregate,
  type NativeJobHeader,
} from './job-intake-types';

type CreateReceipt = { internalJobId: string; fingerprint: string };
type LocalJobStore = {
  schemaVersion: 2;
  nextDoorGoReferenceNumber: number;
  jobs: NativeJobAggregate[];
  createCommands: Record<string, CreateReceipt>;
};

type LocalRepositoryOptions = {
  filePath?: string;
  enabled?: boolean;
  runtime?: string;
  now?: () => Date;
  uuid?: () => string;
};

const writeQueues = new Map<string, Promise<void>>();

function localStorePath(): string {
  return path.join(process.cwd(), '.local-data', 'native-job-intake-j1.json');
}

function assertLocalIntakeAllowed(enabled: boolean, runtime: string): void {
  if (!enabled || runtime === 'production') {
    throw new JobIntakeFailure('local_intake_disabled', 'Local Job Intake is disabled. Set DOORGO_LOCAL_INTAKE_ENABLED=true in a non-production environment.');
  }
}

export function isLocalJobIntakeAvailable(
  enabled = process.env.DOORGO_LOCAL_INTAKE_ENABLED === 'true',
  runtime = process.env.NODE_ENV ?? 'development',
): boolean {
  return enabled && runtime !== 'production';
}

function emptyStore(): LocalJobStore {
  return { schemaVersion: 2, nextDoorGoReferenceNumber: 1, jobs: [], createCommands: {} };
}

function compatibleAggregate(job: NativeJobHeader & { lines?: unknown }): NativeJobAggregate {
  return { ...job, lines: Array.isArray(job.lines) ? job.lines as NativeDoorLine[] : [] };
}

function parseStore(raw: string): LocalJobStore {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid local intake data.');
  const value = parsed as {
    schemaVersion?: unknown;
    nextDoorGoReferenceNumber?: unknown;
    jobs?: unknown;
    createCommands?: unknown;
  };
  if (
    (value.schemaVersion !== 1 && value.schemaVersion !== 2) ||
    !Number.isSafeInteger(value.nextDoorGoReferenceNumber) ||
    Number(value.nextDoorGoReferenceNumber) < 1 ||
    !Array.isArray(value.jobs) ||
    !value.createCommands || typeof value.createCommands !== 'object'
  ) throw new Error('Invalid local intake data.');
  return {
    schemaVersion: 2,
    nextDoorGoReferenceNumber: Number(value.nextDoorGoReferenceNumber),
    jobs: (value.jobs as NativeJobHeader[]).map(compatibleAggregate),
    createCommands: value.createCommands as Record<string, CreateReceipt>,
  };
}

async function readStore(filePath: string): Promise<LocalJobStore> {
  try { return parseStore(await readFile(filePath, 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore();
    throw error;
  }
}

async function atomicWriteStore(filePath: string, store: LocalJobStore): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await rename(temporaryPath, filePath);
}

async function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  writeQueues.set(key, queued);
  await previous;
  try { return await operation(); }
  finally {
    release();
    if (writeQueues.get(key) === queued) writeQueues.delete(key);
  }
}

function fingerprint(command: CreateJobHeaderCommand): string {
  return createHash('sha256').update(JSON.stringify({ input: command.input, lines: command.lines ?? [], defaultSalesperson: command.defaultSalesperson })).digest('hex');
}

function sameSalesOrder(left: string | null, right: string | null): boolean {
  return left !== null && right !== null && left.toLocaleUpperCase() === right.toLocaleUpperCase();
}

function ensureSalesOrderUnique(jobs: NativeJobAggregate[], salesOrder: string | null, exceptId?: string): void {
  if (jobs.some((job) => job.internalJobId !== exceptId && sameSalesOrder(job.bizTrackSalesOrder, salesOrder))) {
    throw new JobIntakeFailure('duplicate_biztrack_sales_order', 'That BizTrack Sales Order is already attached to another job.', { bizTrackSalesOrder: 'BizTrack Sales Order values must be unique.' });
  }
}

function normalizeAggregateLines(inputLines: DoorLineInput[], existing: NativeDoorLine[], actorUserId: string, timestamp: string, uuid: () => string): NativeDoorLine[] {
  const existingById = new Map(existing.map((line) => [line.lineId, line]));
  const submittedIds = inputLines.map((line) => typeof line.lineId === 'string' ? line.lineId : '').filter(Boolean);
  if (new Set(submittedIds).size !== submittedIds.length) {
    throw new JobIntakeFailure('validation_failed', 'A door line was submitted more than once. Reload and review the job.');
  }
  if (existing.some((line) => !submittedIds.includes(line.lineId))) {
    throw new JobIntakeFailure('validation_failed', 'Door lines cannot be permanently deleted. Archive the line instead.');
  }

  const prepared = inputLines.map((input, inputIndex) => {
    const submittedLineId = typeof input.lineId === 'string' ? input.lineId : '';
    const prior = submittedLineId ? existingById.get(submittedLineId) : undefined;
    if (submittedLineId && !prior && !isUuid(submittedLineId)) throw new JobIntakeFailure('validation_failed', 'A new door line must have a valid UUID identity.');
    if (prior?.lineStatus === 'Merged' && input.lineStatus !== 'Merged') {
      throw new JobIntakeFailure('validation_failed', 'A merged-away door line is retained for audit and cannot be restored.');
    }
    const normalizedInput = (!prior || geometryChanged(prior, input)) && input.glassOverride
      ? { ...input, glassOverride: null }
      : input;
    const normalized = normalizeDoorLineInput(normalizedInput);
    if (normalized.ok === false) {
      throw new JobIntakeFailure('validation_failed', `Door line ${inputIndex + 1}: ${normalized.message}`, Object.fromEntries(Object.entries(normalized.fieldErrors).map(([key, value]) => [`lines.${inputIndex}.${key}`, value])));
    }
    const lineStatus = input.lineStatus === 'Archived' || input.lineStatus === 'Merged' ? input.lineStatus : 'Active';
    return {
      ...normalized.value,
      lineId: prior?.lineId ?? (submittedLineId || uuid()),
      lineIndex: inputIndex + 1,
      lineStatus,
      createdAt: prior?.createdAt ?? timestamp,
      createdByUserId: prior?.createdByUserId ?? actorUserId,
      updatedAt: timestamp,
      updatedByUserId: actorUserId,
    } satisfies NativeDoorLine;
  });
  return prepared;
}

function applyCalculatedShopHours(header: ReturnType<typeof normalizeJobHeaderInput> & { ok: true }, lines: NativeDoorLine[]) {
  if (header.value.shopHoursSource === 'Manual' && header.value.shopHours !== null) return header.value;
  const estimate = calculateJ2AShopHours(lines);
  return { ...header.value, shopHours: estimate.shopHours, shopHoursSource: estimate.shopHoursSource };
}

export function createLocalJobIntakeRepository(options: LocalRepositoryOptions = {}): JobIntakeRepository {
  const filePath = options.filePath ?? localStorePath();
  const enabled = options.enabled ?? process.env.DOORGO_LOCAL_INTAKE_ENABLED === 'true';
  const runtime = options.runtime ?? process.env.NODE_ENV ?? 'development';
  const now = options.now ?? (() => new Date());
  const uuid = options.uuid ?? randomUUID;
  const allowed = () => assertLocalIntakeAllowed(enabled, runtime);

  return {
    async list() {
      allowed();
      const store = await readStore(filePath);
      return [...store.jobs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async findById(internalJobId) {
      allowed();
      const store = await readStore(filePath);
      return store.jobs.find((job) => job.internalJobId === internalJobId) ?? null;
    },
    async create(command) {
      allowed();
      return serialized(filePath, async () => {
        const store = await readStore(filePath);
        const commandFingerprint = fingerprint(command);
        const receipt = store.createCommands[command.commandId];
        if (receipt) {
          if (receipt.fingerprint !== commandFingerprint) throw new JobIntakeFailure('idempotency_conflict', 'This create request was already used with different job details.');
          const prior = store.jobs.find((job) => job.internalJobId === receipt.internalJobId);
          if (!prior) throw new Error('Local create receipt refers to a missing job.');
          return prior;
        }
        const normalized = normalizeJobHeaderInput(command.input, command.defaultSalesperson);
        if (normalized.ok === false) throw new JobIntakeFailure('validation_failed', normalized.message, normalized.fieldErrors);
        ensureSalesOrderUnique(store.jobs, normalized.value.bizTrackSalesOrder);
        const timestamp = now().toISOString();
        const internalJobId = uuid();
        const lifecycleStage = command.input.lifecycleStage === 'Confirmed Job' ? 'Confirmed Job' : 'Draft';
        assertConfirmedJobActiveLineInvariant(lifecycleStage, command.lines ?? []);
        const lines = normalizeAggregateLines(command.lines ?? [], [], command.actorUserId, timestamp, uuid);
        assertConfirmedJobActiveLineInvariant(lifecycleStage, lines);
        const header = applyCalculatedShopHours(normalized, lines);
        const job: NativeJobAggregate = {
          internalJobId, doorGoReference: formatDoorGoReference(store.nextDoorGoReferenceNumber),
          ...header, lifecycleStage, lines, createdAt: timestamp, updatedAt: timestamp,
          revision: 1, createdByUserId: command.actorUserId, updatedByUserId: command.actorUserId,
        };
        store.nextDoorGoReferenceNumber += 1;
        store.jobs.push(job);
        store.createCommands[command.commandId] = { internalJobId, fingerprint: commandFingerprint };
        await atomicWriteStore(filePath, store);
        return job;
      });
    },
    async update(command) {
      allowed();
      return serialized(filePath, async () => {
        const store = await readStore(filePath);
        const index = store.jobs.findIndex((job) => job.internalJobId === command.internalJobId);
        if (index < 0) throw new JobIntakeFailure('not_found', 'The requested job was not found.');
        const existing = store.jobs[index];
        if (existing.revision !== command.expectedRevision) throw new JobIntakeFailure('stale_revision', 'This job changed after you opened it. Reload and review the latest version before saving.');
        const normalized = normalizeJobHeaderInput(command.input);
        if (normalized.ok === false) throw new JobIntakeFailure('validation_failed', normalized.message, normalized.fieldErrors);
        ensureSalesOrderUnique(store.jobs, normalized.value.bizTrackSalesOrder, existing.internalJobId);
        const timestamp = now().toISOString();
        const lifecycleStage = command.input.lifecycleStage === 'Confirmed Job' ? 'Confirmed Job' : 'Draft';
        assertConfirmedJobActiveLineInvariant(lifecycleStage, command.lines ?? existing.lines);
        const lines = command.lines === undefined ? existing.lines : normalizeAggregateLines(command.lines, existing.lines, command.actorUserId, timestamp, uuid);
        assertConfirmedJobActiveLineInvariant(lifecycleStage, lines);
        const header = applyCalculatedShopHours(normalized, lines);
        const updated: NativeJobAggregate = {
          ...existing, ...header, lines,
          internalJobId: existing.internalJobId, doorGoReference: existing.doorGoReference,
          lifecycleStage, createdAt: existing.createdAt, createdByUserId: existing.createdByUserId,
          updatedAt: timestamp, updatedByUserId: command.actorUserId, revision: existing.revision + 1,
        };
        store.jobs[index] = updated;
        await atomicWriteStore(filePath, store);
        return updated;
      });
    },
  };
}
