'use client';

import { useId, type InputHTMLAttributes } from 'react';

type DimensionInputProps = {
  different?: boolean;
  label: string;
  required?: boolean;
  value: string;
  error?: string;
  onValue: (value: string) => void;
  inputLabel?: string;
  onBlur?: InputHTMLAttributes<HTMLInputElement>['onBlur'];
  onKeyDown?: InputHTMLAttributes<HTMLInputElement>['onKeyDown'];
};

export function DimensionInput({ different, label, required = false, value, error, onValue, inputLabel, onBlur, onKeyDown }: DimensionInputProps) {
  const helpId = useId();
  return <label className="grid gap-1 text-sm font-semibold">
    {label}{required ? ' *' : ''}
    <span className="relative block">
      <input data-comparison-different={different || undefined} aria-invalid={Boolean(error)} aria-describedby={helpId}
        aria-label={inputLabel ?? `${label}, inches`} inputMode="decimal" placeholder="54 or 54 1/2"
        className="min-h-9 w-full rounded-md border border-slate-300 bg-white px-2 pr-9 font-mono text-sm dark:border-slate-600 dark:bg-slate-950"
        onChange={(event) => onValue(event.target.value)} onBlur={onBlur} onKeyDown={onKeyDown} value={value}/>
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-base font-bold">&quot;</span>
    </span>
    <span id={helpId} className={error ? 'text-xs text-rose-700 dark:text-rose-300' : 'text-xs font-normal text-slate-500'}>
      {error ?? 'Inches: 54, 54 1/2, 54-1/2, or 54.5'}
    </span>
  </label>;
}
