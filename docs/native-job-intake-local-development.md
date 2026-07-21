# Native Job Intake J1 local development

J1/J2 persists complete local job aggregates to `.local-data/native-job-intake-j1.json`. J2 reads existing J1 header-only records as aggregates with no lines, then stores the header plus active/archived lines in one revision-checked atomic write. The adapter is fail-closed and is available only when `DOORGO_LOCAL_INTAKE_ENABLED=true` in a non-production runtime. Do not put credentials in this setting.

To clear disposable J1 data, stop the development server and delete only `.local-data/native-job-intake-j1.json`. The directory is repository-locally excluded from Git.

J1 has no hosted intake adapter or fallback. Hosted `dg_jobs` and `dg_job_lines` remain untouched, and saving a local Draft creates no production booking, fulfillment record, or Calendar record.
