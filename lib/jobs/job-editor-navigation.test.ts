import assert from 'node:assert/strict';
import {canonicalJobEditorHref,DEFAULT_JOB_EDITOR_RETURN_TARGET,jobEditorHref,jobEditorPostSaveNavigation,safeJobEditorReturnTarget} from './job-editor-navigation';

assert.equal(safeJobEditorReturnTarget('/calendar'),'/calendar');
assert.equal(safeJobEditorReturnTarget('/calendar?week=2026-09-07'),'/calendar?week=2026-09-07');
assert.equal(safeJobEditorReturnTarget('/jobs'),'/jobs');
assert.equal(safeJobEditorReturnTarget(undefined),DEFAULT_JOB_EDITOR_RETURN_TARGET);
assert.equal(safeJobEditorReturnTarget('https://example.com'),'/jobs');
assert.equal(safeJobEditorReturnTarget('//example.com'),'/jobs');
assert.equal(safeJobEditorReturnTarget('/calendar?week=bad'),'/jobs');
assert.equal(safeJobEditorReturnTarget('/calendar?week=2026-09-07&next=https://example.com'),'/jobs');
assert.equal(safeJobEditorReturnTarget(['/calendar','https://example.com']),'/calendar');
assert.equal(jobEditorHref('job/id','/calendar?week=2026-09-07'),'/jobs/job%2Fid/edit?returnTo=%2Fcalendar%3Fweek%3D2026-09-07');
assert.equal(jobEditorHref('job-id','https://example.com'),'/jobs/job-id/edit?returnTo=%2Fjobs');
const calendarWeek='/calendar?week=2026-09-07' as const;
assert.equal(jobEditorPostSaveNavigation({exitAfterSave:false,hadJobBeforeSave:true,internalJobId:'job-id',returnTo:calendarWeek}),null,'Calendar Save stays on the current Job URL, preserving its returnTo query');
assert.equal(calendarWeek,'/calendar?week=2026-09-07','standalone Exit after Save retains the exact validated Calendar week');
assert.deepEqual(jobEditorPostSaveNavigation({exitAfterSave:true,hadJobBeforeSave:true,internalJobId:'job-id',returnTo:calendarWeek}),{method:'push',href:calendarWeek},'Calendar Save and Exit returns to the exact Calendar week');
assert.deepEqual(jobEditorPostSaveNavigation({exitAfterSave:true,hadJobBeforeSave:true,internalJobId:'job-id',returnTo:'/jobs'}),{method:'push',href:'/jobs'},'Jobs Save and Exit retains the Jobs destination');
assert.equal(jobEditorPostSaveNavigation({exitAfterSave:false,hadJobBeforeSave:true,internalJobId:'job-id',returnTo:'/jobs'}),null,'Jobs Save stays on the existing Job before standalone Exit returns to Jobs');
assert.deepEqual(jobEditorPostSaveNavigation({exitAfterSave:false,hadJobBeforeSave:false,internalJobId:'job/id',returnTo:'/jobs'}),{method:'replace',href:'/jobs/job%2Fid/edit'},'first save canonicalizes the new Job URL');
assert.equal(canonicalJobEditorHref('job-id',calendarWeek),'/jobs/job-id/edit?returnTo=%2Fcalendar%3Fweek%3D2026-09-07','a first-save rewrite preserves a non-default validated origin');

console.log('Job editor return navigation contract: PASS');
