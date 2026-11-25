import {test,expect} from '@playwright/experimental-ct-react';
import {PDFDocument} from 'pdf-lib';
import {labelReviewCases} from '../label-review/samples';
for(const sample of labelReviewCases)test('identification layout: '+sample.name,async({page})=>{
  await page.emulateMedia({media:'print'});await page.setContent(sample.html!);
  await expect(page.locator('body')).toHaveAttribute('data-labels-ready','true');
  const articles=page.locator('article');
  if(!sample.name.startsWith('Extensive'))await expect(articles).toHaveCount(sample.line.qty);
  await expect(page.locator('strong')).toHaveCount(0);
  for(const article of await articles.all()) {
    expect(await article.evaluate(el=>{
      const s=el.querySelector('section')!;const f=el.querySelector('footer');const d=el.querySelector('.details')!;
      return s.scrollHeight<=s.clientHeight+1&&s.scrollWidth<=s.clientWidth+1&&(!f||d.getBoundingClientRect().bottom<=f.getBoundingClientRect().top+1);
    })).toBe(true);
    await expect(article.locator('p:empty')).toHaveCount(0);
  }
  if(sample.line.doorType)await expect(page.locator('.description').first()).toHaveCSS('font-weight','800');
  if(sample.line.doorId)await expect(page.locator('.door-id').first()).toHaveCSS('font-weight','800');
  await expect(page.locator('.spec')).toHaveCount(0);
  const pdf=await PDFDocument.load(await page.pdf({preferCSSPageSize:true,printBackground:false}));
  expect(pdf.getPageCount()).toBe(await articles.count());for(const sheet of pdf.getPages())expect(sheet.getSize()).toEqual({width:288,height:432});
});

test('size/swing and configuration/jamb share rows without manufacturing fields',async({page})=>{
  await page.setContent(labelReviewCases[1].html);
  await expect(page.locator('.size-swing')).toHaveText('3\'0" × 6\'8" · LH');
  await expect(page.locator('.configuration-jamb')).toHaveText('D · 6-9/16"');
  for(const omitted of ['Exterior','Fiberglass','STD','Description','Material','Sill','Door type','Jamb width','Configuration'])await expect(page.locator('article')).not.toContainText(omitted);
});

test('missing fields do not reserve rows and Slab Only omits retained jamb data',async({page})=>{
  await page.setContent(labelReviewCases.at(-1)!.html);
  for(const selector of ['.address','.door-id','.size-swing','.configuration-jamb','footer','.notes'])await expect(page.locator(selector)).toHaveCount(0);
  await page.setContent(labelReviewCases[8].html);await expect(page.locator('.slab-instructions')).toHaveText('SLAB ONLY · MTM');
  await expect(page.locator('article')).not.toContainText('4-9/16"');await expect(page.locator('article')).not.toContainText('LH');
});
