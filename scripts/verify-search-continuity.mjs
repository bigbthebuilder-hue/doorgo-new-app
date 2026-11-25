import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const output=mkdtempSync(join(tmpdir(),'doorgo-search-'));
try {
  for(const args of [[resolve('node_modules/typescript/bin/tsc'),'--target','es2022','--module','commonjs','--moduleResolution','node','--esModuleInterop','--outDir',output,'lib/search/retained-results.test.ts'],[join(output,'retained-results.test.js')]]) {
    const result=spawnSync(process.execPath,args,{stdio:'inherit'});if(result.status!==0)throw new Error('Search continuity unit checks failed');
  }
} finally {rmSync(output,{recursive:true,force:true});}
