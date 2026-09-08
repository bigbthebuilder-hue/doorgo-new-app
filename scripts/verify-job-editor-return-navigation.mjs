import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync('app/jobs/[internalJobId]/edit/page.tsx','utf8');
const form=fs.readFileSync('components/jobs/JobHeaderForm.tsx','utf8');
const calendar=fs.readFileSync('components/CalendarWorkspace.tsx','utf8');
const contract=fs.readFileSync('lib/jobs/job-editor-navigation.ts','utf8');

assert.match(page,/safeJobEditorReturnTarget\(\(await searchParams\)\.returnTo\)/);
assert.match(page,/returnTo=\{returnTo\}/);
assert.match(form,/returnTo = ['"]\/jobs['"]/);
assert.match(form,/function leave\(\) \{\s*requestNavigation\(returnTo\);\s*\}/,'standalone Exit and Save and Exit must share the validated return target');
assert.match(form,/jobEditorPostSaveNavigation\(\{exitAfterSave,hadJobBeforeSave:Boolean\(job\),internalJobId:saved\.internalJobId,returnTo\}\)/);
assert.match(form,/if\(navigation\)router\[navigation\.method\]\(navigation\.href\)/);
assert.match(calendar,/function jobHref[\s\S]*jobEditorHref\(internalJobId, `\/calendar\?week=\$\{calendarWeek\}`\)/);
assert.equal((calendar.match(/href=\{jobHref\(/g)??[]).length,3,'every Calendar Open Job entry point uses the return-aware link');
assert.match(contract,/^const CALENDAR_RETURN_TARGET = \/\^\\\/calendar/m);
assert.doesNotMatch(contract,/new URL|startsWith/,'return targets must use an explicit allowlist, not broad URL parsing');

console.log('Job editor return navigation static verification: PASS');
