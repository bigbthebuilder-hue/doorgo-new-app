import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const output=mkdtempSync(join(tmpdir(),'doorgo-tbar-'));
function run(args) {const result=spawnSync(process.execPath,args,{stdio:'inherit'});if(result.status!==0)throw new Error('T-bar regression failed');}
try {
  run([resolve('node_modules/typescript/bin/tsc'),'--pretty','false','--target','es2022','--module','commonjs','--moduleResolution','node','--esModuleInterop','--outDir',output,
    'lib/jobs/unit-tbar-contract.test.ts','lib/jobs/glass-geometry-contract.test.ts','lib/jobs/glass-door-setup-reconciliation.test.ts','lib/jobs/hosted-job-intake-repository.test.ts','lib/jobs/inline-glass-contract.test.ts']);
  for(const name of ['unit-tbar-contract','glass-geometry-contract','glass-door-setup-reconciliation','hosted-job-intake-repository','inline-glass-contract'])run([join(output,'jobs',name+'.test.js')]);
} finally {rmSync(output,{recursive:true,force:true});}
