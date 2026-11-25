import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {PDFDocument} from 'pdf-lib';

const destination=resolve(process.argv[2] || 'output/pdf');mkdirSync(destination,{recursive:true});
const output=mkdtempSync(join(tmpdir(),'doorgo-identification-review-'));
let browser;
try {
  const compiled=spawnSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'--target','es2022','--module','commonjs','--moduleResolution','node','--esModuleInterop','--outDir',output,'tests/label-review/samples.ts'],{stdio:'inherit'});
  assert.equal(compiled.status,0,'Sample compilation failed');
  const require=createRequire(import.meta.url);
  const {labelReviewCases}=require(join(output,'tests/label-review/samples.js'));
  browser=await chromium.launch({headless:process.env.DOOR_LABEL_HEADED!=='1',...(process.env.DOOR_LABEL_BROWSER?{executablePath:process.env.DOOR_LABEL_BROWSER}:{})});
  const page=await browser.newPage();await page.emulateMedia({media:'print'});
  const combined=await PDFDocument.create();const manifest=[];
  for(const sample of labelReviewCases) {
    // Observe the final pre-continuation geometry without changing the layout.
    const html=sample.html.replace('const units = Array.from', `document.body.dataset.reviewOverflow = JSON.stringify({available:original.querySelector('section').clientHeight,used:original.querySelector('section').scrollHeight,rows:Array.from(original.querySelectorAll('header,.details>p,footer'),el=>({row:el.className||el.tagName,height:el.getBoundingClientRect().height,font:getComputedStyle(el).fontSize,marginTop:getComputedStyle(el).marginTop,marginBottom:getComputedStyle(el).marginBottom}))}); const units = Array.from`);
    await page.setContent(html,{waitUntil:'load'});
    await page.waitForFunction(()=>document.body.dataset.labelsReady==='true' || document.body.dataset.layoutError==='true');
    assert.equal(await page.locator('body').getAttribute('data-layout-error'),null,sample.name+': layout error');
    const checks=await page.locator('article').evaluateAll(articles=>articles.map(article=>{
      const section=article.querySelector('section'), details=article.querySelector('.details'), footer=article.querySelector('footer');
      const rect=article.getBoundingClientRect();
      return {width:rect.width,height:rect.height,overflow:section.scrollHeight>section.clientHeight+1||section.scrollWidth>section.clientWidth+1,
        separated:!footer||details.getBoundingClientRect().bottom<=footer.getBoundingClientRect().top+1,
        descriptionBold:[...article.querySelectorAll('.description')].every(el=>Number(getComputedStyle(el).fontWeight)>=700&&parseFloat(getComputedStyle(el).fontSize)>=20*96/72-0.001),
        idBold:[...article.querySelectorAll('.door-id')].every(el=>Number(getComputedStyle(el).fontWeight)>=700&&parseFloat(getComputedStyle(el).fontSize)>=28*96/72-0.001),
        text:article.textContent};
    }));
    for(const check of checks){assert.ok(Math.abs(check.width-384)<=0.02,sample.name+': browser width');assert.ok(Math.abs(check.height-576)<=0.02,sample.name+': browser height');assert.equal(check.overflow,false,sample.name);assert.equal(check.separated,true,sample.name);assert.equal(check.descriptionBold,true,sample.name);assert.equal(check.idBold,true,sample.name);}
    const count=checks.length;
    if(count!==sample.line.qty&&!sample.name.startsWith('Extensive'))console.log('Pre-continuation geometry: '+await page.locator('body').getAttribute('data-review-overflow'));
    if(!sample.name.startsWith('Extensive'))assert.equal(count,sample.line.qty,sample.name+': unexpected continuation');
    else assert.ok(count>1,'Extensive notes must remain complete on intentional continuation pages');
    assert.equal((await page.locator('.notes span').allTextContents()).join(''),sample.omitNotes?'':sample.line.notes,sample.name+': notes preserved');
    assert.equal((await page.locator('.description span').allTextContents()).join(''),sample.line.doorType.repeat(sample.line.qty),sample.name+': full description');
    const expectedIds=Array.from({length:sample.line.qty},(_,i)=>sample.line.individualDoorIds?.[i]||sample.line.doorId||'').join('');
    assert.equal((await page.locator('.door-id span').allTextContents()).join(''),expectedIds,sample.name+': copy IDs');
    for(const article of await page.locator('article').all()) {
      assert.deepEqual(await article.locator('.barcode-value').allTextContents(),[sample.line.productCode,sample.line.doorSlabSku].filter(Boolean),sample.name+': complete barcodes');
      assert.equal(await article.locator('strong').count(),0,'Unnecessary field headings');
    }
    const pdf=await PDFDocument.load(await page.pdf({preferCSSPageSize:true,printBackground:false}));
    assert.equal(pdf.getPageCount(),count,sample.name+': PDF page boundaries');
    for(const sheet of pdf.getPages())assert.deepEqual(sheet.getSize(),{width:288,height:432},sample.name+': 4 x 6 media box');
    const start=combined.getPageCount()+1;for(const sheet of await combined.copyPages(pdf,pdf.getPageIndices()))combined.addPage(sheet);
    manifest.push({salesOrder:sample.job.bizTrackSalesOrder,sample:sample.name,startPage:start,pages:count});
    console.log(sample.name+': '+count+' page(s), verified 4 x 6');
  }
  const file=join(destination,'DoorGo_Identification_Label_Review.pdf');writeFileSync(file,await combined.save());
  writeFileSync(join(destination,'DoorGo_Identification_Label_Review_Index.txt'),manifest.map(item=>`SO ${item.salesOrder} | Pages ${item.startPage}-${item.startPage+item.pages-1} | ${item.sample}`).join('\r\n'));
  writeFileSync(join(destination,'DoorGo_Identification_Label_Checks.json'),JSON.stringify({samples:manifest,pages:combined.getPageCount(),dimensionsInches:[4,6]},null,2));
  console.log('REVIEW PDF GENERATED: '+file);
} finally {await browser?.close();rmSync(output,{recursive:true,force:true});}
