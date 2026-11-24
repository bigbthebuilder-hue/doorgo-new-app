import { test, expect } from '@playwright/experimental-ct-react';
import { StandaloneGlassCalculator } from '../../components/jobs/StandaloneGlassCalculator';
import { SlabSizingHarness } from './SlabSizingHarness';
import { defaultDoorLine } from '../../lib/jobs/door-line-contract';
import { GLASS_CONFIGS } from '../../lib/jobs/glass-geometry-contract';
import { parseGlassUnitConfiguration, totalSidelightCount } from '../../lib/jobs/glass-unit-composition-contract';

for(const config of [...GLASS_CONFIGS,'TTT/SDDS','T/SSSDSS','SSDS','SDSS','D','DD']) test('intake selector and default: '+config, async({mount,page})=>{
  await page.setViewportSize({width:1600,height:1000});
  const component=await mount(<SlabSizingHarness initializeGlass line={{...defaultDoorLine('Exterior'),lineId:'fixture',config,roWidth:'100',roHeight:'95',sidelightType:'Glass',transomGlassTypeCode:'CLEAR',sidelightGlass:'CLEAR'}}/>);
  await component.getByRole('button',{name:'Edit',exact:true}).click();
  const selector=component.getByRole('combobox',{name:'Unit T-bar Size',exact:true});
  const parsed=parseGlassUnitConfiguration(config);expect(parsed.ok).toBe(true);if(!parsed.ok)return;
  const sides=totalSidelightCount(parsed.value);
  if(sides||parsed.value.hasTransom)await expect(selector).toHaveValue(parsed.value.hasTransom&&parsed.value.door==='D'&&!sides?'1.5':'2.25');
  else await expect(selector).toHaveCount(0);
});

test('standalone defaults follow topology; manual size survives topology changes',async({mount,page})=>{
  await page.setViewportSize({width:1600,height:1000});
  const component=await mount(<StandaloneGlassCalculator/>);
  const selector=component.getByRole('combobox',{name:'Unit T-bar Size',exact:true});
  await expect(selector).toHaveCount(0);
  await component.getByRole('combobox',{name:'Configuration',exact:true}).selectOption('With Glass');
  await expect(selector).toHaveValue('2.25');
  await component.getByRole('button',{name:'Add transom',exact:true}).click();
  await component.getByRole('button',{name:'Remove left sidelight',exact:true}).click();
  await expect(selector).toHaveValue('1.5');
  await component.getByRole('button',{name:'Double Door',exact:true}).click();
  await expect(selector).toHaveValue('2.25');
  await component.getByRole('button',{name:'Single Door',exact:true}).click();
  await expect(selector).toHaveValue('1.5');
  await component.getByRole('button',{name:'Add left sidelight',exact:true}).click();
  await expect(selector).toHaveValue('2.25');
  await component.getByRole('textbox',{name:'RO Width (inches)',exact:true}).fill('60');
  await component.getByRole('textbox',{name:'RO Width (inches)',exact:true}).blur();
  await component.getByRole('textbox',{name:'RO Height (inches)',exact:true}).fill('95');
  await component.getByRole('textbox',{name:'RO Height (inches)',exact:true}).blur();
  await selector.selectOption('1.5');
  await expect(selector).toHaveValue('1.5');
  await component.getByRole('button',{name:'Double Door',exact:true}).click();
  await expect(selector).toHaveValue('1.5');
});

test('saved explicit light size is protected through intake update, reopen and duplicate',async({mount,page})=>{
  await page.setViewportSize({width:1600,height:1000});
  const component=await mount(<SlabSizingHarness line={{...defaultDoorLine('Exterior'),lineId:'fixture',config:'T/D',roWidth:'38',roHeight:'95',transomTBarSize:'2.25',transomGlassTypeCode:'CLEAR'}}/>);
  await component.getByRole('button',{name:'Edit',exact:true}).click();
  const selector=component.getByRole('combobox',{name:'Unit T-bar Size',exact:true});
  await expect(selector).toHaveValue('2.25');
  await selector.selectOption('1.5');
  await component.getByRole('button',{name:'Update Door',exact:true}).click();
  await component.getByRole('button',{name:'Edit',exact:true}).click();
  await expect(selector).toHaveValue('1.5');
  await component.getByRole('button',{name:'Cancel Edit',exact:true}).click();
  await component.getByRole('button',{name:'Duplicate',exact:true}).click();
  const saved=JSON.parse(await component.getByTestId('saved-sizing').textContent()??'[]');
  expect(saved).toHaveLength(2);
  for(const line of saved)expect(line.unitTBarControl).toEqual({source:'manual',size:'1.5'});
});
