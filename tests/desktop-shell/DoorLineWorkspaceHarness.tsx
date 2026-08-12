export function DoorLineWorkspaceHarness() {
  const fields = ['Door Type', 'Configuration', 'Width', 'Height', 'Swing', 'Prep', 'Quantity', 'Jamb Width', 'Jamb Type', 'Hinge Type', 'Material', 'Sill', 'Weatherstrip', 'Custom Slab / RO', 'Door Thickness'];
  return <div className="app-workspace app-workspace-fluid"><section className="door-line-workbench grid min-w-0 gap-2"><div className="door-input-pane min-w-0 rounded-lg border p-2.5"><div className="grid gap-2 sm:grid-cols-3 2xl:grid-cols-4">{fields.map((field) => <label className="grid gap-1 text-sm font-semibold" key={field}>{field}<input aria-label={field} className="app-compact-input"/></label>)}</div></div><aside className="job-lines-pane min-w-0 rounded-lg border p-2.5"><h2>Job Lines</h2></aside></section></div>;
}
