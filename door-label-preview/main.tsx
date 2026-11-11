import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DoorLabelDialog } from '../components/jobs/DoorLabelDialog';
import type { NativeJobAggregate } from '../lib/jobs/job-intake-types';
import { samples } from './samples';
import '../app/globals.css';

function Preview() {
  const [job, setJob] = useState<NativeJobAggregate>();
  return (
    <main className="mx-auto grid max-w-xl gap-5 p-6">
      <h1 className="text-2xl font-semibold">DoorGo Door Labels Preview</h1>
      <p>These sample jobs use fictional data.</p>
      <p>For a test sheet, choose Letter paper and 100% scale in your browser’s print dialog. Turn off headers and footers. For a label printer, select 4 × 6 paper.</p>
      <div className="grid gap-3">
        {samples.map(({ title, description, job }) => (
          <div className="grid justify-items-start gap-1" key={job.internalJobId}>
            <button className="app-button app-button-secondary" type="button" onClick={() => setJob(job)}>{title}</button>
            <p>{description}</p>
          </div>
        ))}
      </div>
      {job && <DoorLabelDialog job={job} onClose={() => setJob(undefined)} />}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
