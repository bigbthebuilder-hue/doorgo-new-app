import { visibleJobIdentifier } from './job-intake-contract';
import type { NativeJobListItem } from './job-intake-types';

export function salespersonKey(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? '';
}

export function jobSalespeople(jobs: NativeJobListItem[]): string[] {
  const names = new Map<string, string>();
  for (const job of jobs) {
    const key = salespersonKey(job.salesperson);
    if (key && !names.has(key)) names.set(key, job.salesperson!.trim());
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

export function defaultJobSalesperson(jobs: NativeJobListItem[], displayName: string): string {
  return jobSalespeople(jobs).find(name => salespersonKey(name) === salespersonKey(displayName)) ?? '';
}

const salesOrderCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function organizedJobs(jobs: NativeJobListItem[], search: string, salesperson: string): NativeJobListItem[] {
  const query = search.trim().toLocaleLowerCase();
  return jobs.filter(job => query
    ? [visibleJobIdentifier(job), job.customer, job.siteAddress].some(value => value?.toLocaleLowerCase().includes(query))
    : !salesperson || salespersonKey(job.salesperson) === salespersonKey(salesperson))
    .sort((a, b) => {
      const group = Number(a.isComplete === true) - Number(b.isComplete === true);
      if (group) return group;
      const aOrder = a.bizTrackSalesOrder?.trim() ?? '';
      const bOrder = b.bizTrackSalesOrder?.trim() ?? '';
      return Number(Boolean(bOrder)) - Number(Boolean(aOrder))
        || salesOrderCollator.compare(bOrder, aOrder)
        || salesOrderCollator.compare(visibleJobIdentifier(b), visibleJobIdentifier(a))
        || a.internalJobId.localeCompare(b.internalJobId);
    });
}
