import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';

// Run against a separate local test server. No AI requests or existing browser state.
const base=(process.env.MARKET_RADAR_TEST_URL||'http://127.0.0.1:3002').replace(/\/$/,'');
const launch=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}
  :{channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'};
mkdirSync('test-results',{recursive:true});
const browser=await chromium.launch({...launch,headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);
 await page.getByRole('heading',{name:'The market, from more than one angle.'}).waitFor();
 const data=await(await page.request.get(base+'/api/bootstrap')).json();
 const sourceCount=data.inventory.sources.length;
 assert.equal(sourceCount,10);
 assert.ok(!data.inventory.sources.some(s=>s.id==='thurgau_awa_rav_2026_10'));
 assert.ok(!data.catalog.some(s=>s.sourceId==='thurgau_awa_rav_2026_10'));
 assert.ok(data.catalog.some(s=>s.geography==='CH-TG'&&s.sourceId.startsWith('sem_')),'Other sources may still describe Thurgau canton');
 const source=page.getByLabel('Source',{exact:true});
 const choose=page.getByLabel('Choose indicator',{exact:true});
 const view=page.getByLabel('View',{exact:true});
 const action=async(fn,expected=200)=>{
  const response=page.waitForResponse(r=>r.url()===base+'/api/analytics'&&r.request().method()==='POST');
  await fn();const r=await response,result=await r.json();
  assert.equal(r.status(),expected,JSON.stringify(result.error));
  await expect(source).toBeEnabled();
  return result;
 };
 const selectedTopic=()=>page.getByRole('tab',{selected:true}).textContent();
 await page.getByRole('button',{name:'Explore the market',exact:true}).click();
 await expect(source).toBeVisible();
 await action(()=>page.getByRole('tab',{name:'Skills',exact:true}).click());
 assert.equal(await source.locator('option').count(),sourceCount);
 assert.equal(await source.locator('optgroup[label="For Skills"] option').count(),1);
 assert.equal(await source.locator('optgroup[label="Other data — switches topic"] option').count(),sourceCount-1);
 await expect(page.locator('.explorer-coverage')).toContainText('only verified numeric source for named-skill trends');
 await page.screenshot({path:'test-results/explorer-sources-after.png',fullPage:true,animations:'disabled'});

 let checkedViews=0;
 for(const s of data.inventory.sources){
  await action(()=>page.getByRole('tab',{name:'Skills',exact:true}).click());
  const result=await action(()=>source.selectOption(s.id));
  assert.ok(result.series.length>0,s.id+' returns data');
  assert.ok(result.series.every(series=>series.sourceId===s.id));
  assert.equal(await source.inputValue(),s.id);
  const expectedTopic=s.id==='itboard_monitor_csv'?'Skills':s.id.includes('oja2')?'Roles':'Market context';
  assert.equal(await selectedTopic(),expectedTopic);
  const modes=await view.locator('option').evaluateAll(xs=>xs.map(x=>x.value));
  if(s.id.startsWith('fso_'))assert.ok(!modes.includes('ranking'));
  for(const mode of modes){await action(()=>view.selectOption(mode));checkedViews++;}
  assert.equal(await page.locator('.notice-error').count(),0);
 }
 console.log(`All ${sourceCount} source transitions and ${checkedViews} offered views passed.`);

 await action(()=>page.getByRole('tab',{name:'Roles',exact:true}).click());
 const roles=await action(()=>source.selectOption('itboard_monitor_csv'));
 assert.deepEqual(roles.query.seriesIds,['itboard_csv_rolle_software-engineer','itboard_csv_rolle_it-support']);
 assert.equal(await choose.locator('option').count(),70);
 await page.screenshot({path:'test-results/explorer-roles-after.png',fullPage:true,animations:'disabled'});
 await action(()=>source.selectOption('eurostat_isoc_sk_oja2_ch_20261116'));
 assert.equal(await selectedTopic(),'Roles');
 assert.equal(await choose.locator('option').count(),7);
 await action(()=>view.selectOption('ranking'));
 await action(()=>view.selectOption('history'));

 await action(()=>source.selectOption('sem_asyl_202610_6_22'));
 for(const id of ['sem_asyl_ch_f_employed_people_18_64','sem_asyl_ch_f_employment_rate_18_64']){
  const result=await action(()=>choose.selectOption(id));
  assert.equal(result.series[0].id,id);
 }
 await expect(page.locator('.measure-field button.selected')).toHaveText('Rate');

 // A failed request must not switch controls away from the chart still displayed.
 const before={source:await source.inputValue(),topic:await selectedTopic(),title:await page.locator('.result-header h2').first().textContent(),indicator:await choose.inputValue()};
 await page.route(base+'/api/analytics',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Simulated temporary outage'}})}));
 await action(()=>source.selectOption('fso_jobstat_vacancies_2026q2'),503);
 await expect(page.locator('.notice-error')).toContainText('Simulated temporary outage');
 assert.equal(await source.inputValue(),before.source);
 assert.equal(await selectedTopic(),before.topic);
 assert.equal(await page.locator('.result-header h2').first().textContent(),before.title);
 assert.equal(await choose.inputValue(),before.indicator);
 await page.unroute(base+'/api/analytics');
 await action(()=>source.selectOption('itboard_monitor_csv'));

 await page.getByRole('button',{name:'Data library',exact:true}).click();
 const angular=data.catalog.find(c=>c.metric==='share_of_platform_ads'&&c.topic==='skills'&&c.geography==='CH');
 await page.getByLabel('Search all indicators').fill(angular.label);
 await action(()=>page.locator('.library-table tbody tr').first().getByRole('button').click());
 await expect(page.locator('.measure-field button.selected')).toHaveText('Share');
 await action(()=>page.locator('.measure-field').getByRole('button',{name:'Count',exact:true}).click());
 await expect(page.locator('.measure-field button.selected')).toHaveText('Count');

 await page.getByRole('button',{name:'Data library',exact:true}).click();
 await page.getByLabel('Library coverage').selectOption('all');
 await page.getByLabel('Library topic').selectOption('regional');
 const regional=data.inventory.sources.find(s=>s.id.startsWith('fribourg'));
 await page.locator('.library-source-card').filter({hasText:regional.title}).click();
 await page.getByLabel('Library coverage').selectOption('CH');
 await expect(page.getByRole('heading',{name:'168 available indicators',exact:true})).toBeVisible();
 assert.equal(await page.getByLabel('Library topic').inputValue(),'all');
 assert.equal(await page.locator('.library-source-card.selected').count(),0);

 await page.getByRole('button',{name:'Explore the market',exact:true}).click();
 await action(()=>page.getByRole('tab',{name:'Skills',exact:true}).click());
 await page.setViewportSize({width:390,height:844});
 await expect(page.locator('.measure-field button.selected')).toHaveText('Share');
 await page.evaluate(async()=>{scrollTo({top:0,behavior:'instant'});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
 const dimensions=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
 assert.ok(dimensions.scroll<=dimensions.viewport,JSON.stringify(dimensions));
 await page.screenshot({path:'test-results/explorer-mobile-after.png',fullPage:true,animations:'disabled'});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'passed',sources:sourceCount,checkedViews,roles:70,eurostatOccupations:7,failureRecovery:'passed',mobile:dimensions,pageErrors:errors}));
}finally{await browser.close();}
