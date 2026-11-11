import { useEffect, useRef, useState } from 'react';
import { MAX_LABEL_BATCH, prepareDoorLabels, type LabelSelection } from '@/lib/jobs/door-label-contract';
import type { NativeJobAggregate } from '@/lib/jobs/job-intake-types';

export function DoorLabelDialog({ job, onClose }: { job: NativeJobAggregate; onClose: () => void }) {
  const lines = job.lines.filter((line) => line.lineStatus === 'Active');
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [selection, setSelection] = useState<LabelSelection>(() => Object.fromEntries(
    lines.map((line) => [line.lineId, { selected: true, quantity: String(line.qty), doorIds: [] }]),
  ));
  const [omitNotes, setOmitNotes] = useState(false);
  const [checked, setChecked] = useState<{ html: string; overflow: boolean }>();
  const preview = prepareDoorLabels(job, selection, omitNotes);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  function update(id: string, change: Partial<LabelSelection[string]>) {
    setSelection((previous) => ({ ...previous, [id]: { ...previous[id], ...change } }));
  }

  function selectAll(selected: boolean) {
    setSelection((previous) => Object.fromEntries(
      Object.entries(previous).map(([id, line]) => [id, { ...line, selected }]),
    ));
  }

  const overflow = Boolean(preview.html && checked?.html === preview.html && checked.overflow);
  const ready = Boolean(preview.html && checked?.html === preview.html && !overflow);
  return (
    <dialog aria-labelledby="door-label-title" className="m-auto max-h-[90vh] w-[min(95vw,58rem)] overflow-auto rounded-xl bg-white p-4 text-slate-900 shadow-xl backdrop:bg-black/50" onCancel={onClose} ref={dialog}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold" id="door-label-title">Door Labels</h2>
        <button className="app-button app-button-secondary" onClick={onClose} type="button">Close</button>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-2">
          {lines.length > 0 ? <div className="flex gap-2">
            <button className="app-button app-button-secondary" onClick={() => selectAll(true)} type="button">Select all</button>
            <button className="app-button app-button-secondary" onClick={() => selectAll(false)} type="button">Clear selection</button>
          </div> : <p>No active door lines.</p>}
          {lines.map((line) => {
            const current = selection[line.lineId];
            const quantity = Number(current.quantity);
            return <fieldset className="grid gap-2 rounded border border-slate-300 p-2" key={line.lineId}>
              <legend>Line {line.lineIndex} · {line.config} · {line.width} × {line.height}</legend>
              <div className="flex items-center gap-3">
                <label><input checked={current.selected} onChange={(event) => update(line.lineId, { selected: event.target.checked })} type="checkbox"/> Include</label>
                <label>Quantity <input className="w-20 rounded border px-1" disabled={!current.selected} min={1} max={MAX_LABEL_BATCH} onChange={(event) => update(line.lineId, { quantity: event.target.value })} type="number" value={current.quantity}/></label>
              </div>
              {current.selected && Number.isInteger(quantity) && quantity > 0 && quantity <= MAX_LABEL_BATCH ? <details>
                <summary className="cursor-pointer">Optional Door ID overrides</summary>
                <div className="mt-2 grid gap-1">
                  {Array.from({ length: quantity }, (_, index) => <label className="flex items-center gap-2" key={index}>
                    Label {index + 1}<input className="min-w-0 rounded border px-1" onChange={(event) => {
                      const doorIds = [...current.doorIds];
                      doorIds[index] = event.target.value;
                      update(line.lineId, { doorIds });
                    }} placeholder={line.doorId || undefined} value={current.doorIds[index] ?? ''}/>
                  </label>)}
                </div>
              </details> : null}
            </fieldset>;
          })}
          <label><input checked={omitNotes} onChange={(event) => setOmitNotes(event.target.checked)} type="checkbox"/> Omit line notes from this batch</label>
          {preview.error ? <p role="status">{preview.error}</p> : null}
          {overflow ? <p role="alert">At least one label exceeds the available space. Review the preview. You can omit notes from this batch, shorten the text, or deselect the affected line.</p> : null}
          <button className="app-button app-button-primary justify-self-start" disabled={!ready} onClick={() => frame.current?.contentWindow?.print()} type="button">
            {preview.count ? 'Print ' + preview.count + (preview.count === 1 ? ' label' : ' labels') : 'Print labels'}
          </button>
        </div>
        {preview.html ? <iframe key={preview.html} className="h-[min(68vh,38rem)] min-h-64 w-full rounded border border-slate-300" onLoad={() => {
          const pages = frame.current?.contentDocument?.querySelectorAll('article');
          if (!pages?.length) return;
          setChecked({ html: preview.html!, overflow: Array.from(pages).some((page) => page.scrollHeight > page.clientHeight) });
        }} ref={frame} srcDoc={preview.html} title="4 × 6 door label preview"/> : null}
      </div>
    </dialog>
  );
}
