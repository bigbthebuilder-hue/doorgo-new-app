import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module,{createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);const original=Module._load;const previousTs=require.extensions['.ts'];
let calls=0;let allowed=false;
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
Module._load=function(name,parent,main){
  if(name==='@/lib/production-bookings/calendar-production-actions')return {loadCalendarWindow:async request=>{calls++;assert.ok(request.weeks<=16);return allowed?{ok:true,board:{days:[],weekGroups:[],needsAttentionCards:[]}}:{ok:false};}};
  if(name==='@/lib/production-board/date-utils'){const actual=original.call(this,path.resolve('lib/production-board/date-utils.ts'),parent,main);return {...actual,getCurrentDateInTimeZone:()=> '2026-11-11'};}
  return original.call(this,name.startsWith('@/')?path.resolve(name.slice(2)):name,parent,main);
};
try {
  const {GET}=require('../app/api/calendar/window/route.ts');
  const request=(start,end)=>({nextUrl:new URL('http://localhost/api/calendar/window?'+new URLSearchParams({start,end}))});
  for(const [start,end] of [['bad','2026-11-16'],['2026-02-30','2026-03-09'],['2026-11-10','2026-11-16'],['2026-11-09','2027-03-08'],['2020-01-06','2020-01-13']])assert.equal((await GET(request(start,end))).status,400);
  assert.equal(calls,0,'invalid ranges must not execute reads');
  const denied=await GET(request('2026-11-09','2026-11-16'));assert.equal(denied.status,503);assert.match(denied.headers.get('cache-control'),/no-store/);
  allowed=true;const response=await GET(request('2026-11-09','2026-12-07'));assert.equal(response.status,200);assert.ok((await response.json()).board);assert.equal(calls,2);
  console.log('Calendar refresh route bounds, no-cache and failed authorization/read tests passed (mocked reader)');
} finally {Module._load=original;if(previousTs)require.extensions['.ts']=previousTs;else delete require.extensions['.ts'];}
