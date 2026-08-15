'use client';

import { useState } from 'react';
import { ContextBottomBar } from '@/components/app-shell/ContextBottomBar';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import { Workspace, WorkspaceSurface } from '@/components/app-shell/Workspace';
import { LegacyJobImportShell } from '@/components/jobs/LegacyJobImportShell';

export function LegacyImportShellHarness() {
  const [editorActive, setEditorActive] = useState(false);

  return <LegacyJobImportShell editorActive={editorActive} navigation={[]}>
    {editorActive ? <>
      <ContextTopBar title="JOB-0065" secondary="Imported legacy job" controls={<div className="app-job-context-fields"><label className="app-job-context-field"><span>Customer</span><input readOnly value="Legacy Customer"/></label></div>}/>
      <Workspace className="job-editor-workspace" width="fluid">
        <WorkspaceSurface className="job-editor-surface">
          <div className="door-line-workbench">
            <section className="door-input-pane"><h2>Door Input</h2><div style={{ minHeight: '1100px' }}>Imported editor fields</div></section>
            <aside className="job-lines-pane"><h2>Job Lines</h2></aside>
          </div>
        </WorkspaceSurface>
      </Workspace>
      <ContextBottomBar label="Job actions" status="Imported review" actions={<button>Save as Native Job</button>}/>
    </> : <>
      <ContextTopBar backHref="/jobs" backLabel="Jobs" title="Import Legacy Job" secondary="Review before saving as a native job"/>
      <div className="app-workspace max-w-6xl">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p>Reviewing or cancelling creates no native job.</p>
          <button onClick={() => setEditorActive(true)}>Accept fixture</button>
          <div style={{ minHeight: '1100px' }}>Upload review content</div>
        </section>
      </div>
    </>}
  </LegacyJobImportShell>;
}
