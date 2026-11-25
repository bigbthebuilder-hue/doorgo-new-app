import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
const output=mkdtempSync(join(tmpdir(),'doorgo-identification-contract-'));
try {
 const compiled=spawnSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'--target','es2022','--module','commonjs','--moduleResolution','node','--esModuleInterop','--outDir',output,'tests/label-review/samples.ts'],{stdio:'inherit'});assert.equal(compiled.status,0);
 const require=createRequire(import.meta.url);const {labelReviewCases}=require(join(output,'tests/label-review/samples.js'));
 const {prepareDoorLabels,code128}=require(join(output,'lib/jobs/door-label-contract.js'));
 for(const sample of labelReviewCases){const before=JSON.stringify(sample.job);const result=prepareDoorLabels(sample.job,sample.selection,sample.omitNotes);assert.equal(result.error,undefined);assert.equal(result.count,sample.line.qty);assert.equal(JSON.stringify(sample.job),before);assert.doesNotMatch(result.html,/<strong>/);assert.match(result.html,/@page\{size:4in 6in;margin:0\}/);assert.equal((result.html.match(/<article /g)||[]).length,sample.line.qty);}
 const base=labelReviewCases[0];const markers={...base.line,mode:'Exterior',material:'HIDDEN_MATERIAL',sill:'HIDDEN_SILL'};const result=prepareDoorLabels({...base.job,lines:[markers]},base.selection,false);assert.doesNotMatch(result.html,/HIDDEN_MATERIAL|HIDDEN_SILL|>Exterior<|Door type|Material<|Sill</);
 assert.equal(code128(' A ').modules,88);assert.equal(code128('café'),null);assert.notDeepEqual(code128('000123'),code128('0123'));
 const source=readFileSync('lib/jobs/door-label-contract.ts','utf8');assert.match(source,/doorSizeDisplay\(line, true\)/);assert.match(source,/individualDoorIds\?\.\[copy\]/);
 console.log('Identification label contract: 18 sample cases, no data mutation, quantity/ID/encoding guards passed. Browser layout still requires Chromium.');
} finally {rmSync(output,{recursive:true,force:true});}
