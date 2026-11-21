import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.MARKET_RADAR_TEST_URL||'http://127.0.0.1:3002';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
mkdirSync('test-results',{recursive:true});
const errors=[],checks=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}});page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/opportunities');await expect(page.locator('.decision-panel')).toHaveCount(4);
 await expect(page.locator('.country-label')).toHaveCount(0);await expect(page).toHaveTitle('Graduate opportunities | Market Radar');
 await expect(page.getByLabel('Role to investigate').locator('option')).toHaveCount(35);
 await page.getByLabel('Role to investigate').selectOption('itboard_csv_rolle_data-analyst');await expect(page.locator('[data-panel=role] .decision-note')).toContainText('Small counts');
 await expect(page).toHaveURL(/role=itboard_csv_rolle_data-analyst/);
 await expect(page.locator('[data-panel=junior]')).toContainText('across all roles');
 await page.reload();await expect(page.getByLabel('Role to investigate')).toHaveValue('itboard_csv_rolle_data-analyst');await expect(page.locator('.decision-panel')).toHaveCount(4);
 await expect(page.locator('[data-panel=skills] .recharts-bar-rectangle')).toHaveCount(8);
 await page.screenshot({path:'test-results/opportunities-desktop.png',fullPage:true});
 await page.locator('[data-panel=role]').getByRole('button',{name:'Explore this evidence'}).click();await expect(page).toHaveURL(/\/explore\?/);await expect(page.locator('.result-header h2')).toHaveText('Data Analyst');
 checks.push('role selection, small-count limits, reload and exact Explorer handoff');
 await page.getByRole('link',{name:'Participant context',exact:true}).click();await expect(page.locator('.participant-group')).toHaveCount(3);await expect(page.locator('.participant-metric')).toHaveCount(9);
 await expect(page.getByLabel('Participant geography').locator('option')).toHaveCount(27);
 await page.getByLabel('Population group').selectOption('s');await page.getByLabel('Participant geography').selectOption('CH-ZH');
 await expect(page.locator('.participant-group')).toHaveCount(1);await expect(page.locator('.participant-group h2')).toHaveText('Status S');await expect(page.locator('.participant-group .eyebrow')).toContainText('Zürich canton');
 const original=page.url();await page.getByLabel('Participant geography').selectOption('CH-BE');await expect(page).toHaveURL(/CH-BE/);await page.goBack();await expect(page).toHaveURL(original);await expect(page.locator('.participant-group .eyebrow')).toContainText('Zürich canton');
 await page.reload();await expect(page.locator('.participant-metric')).toHaveCount(3);
 const response=await page.request.post(base+'/api/decision-brief',{data:{kind:'participants',group:'s',geography:'CH-ZH'},headers:{origin:base}});assert.equal(response.status(),200);const brief=await response.json();
 for(const panel of brief.panels){const value=panel.result.series[0].points[0].value;const shown=await page.locator(`[data-metric=${panel.metric}] strong`).innerText();const numeric=Number(shown.replace(/[^\d.]/g,''));assert.ok(Math.abs(value-numeric)<0.011);}
 checks.push('all SEM groups, available cantons, exact backend values and browser history');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/participants-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
 await page.goto(base+'/participants?geography=itboard%3Aregion%3Azuerich');await expect(page.locator('.notice-error')).toContainText('could not be opened');await page.getByRole('link',{name:'Reset filters'}).click();await expect(page.locator('.participant-group')).toHaveCount(3);
 checks.push('mobile layout and unsupported geography recovery');
 // Real backend brief, simulated model transport; no paid requests in this suite.
 const context=await browser.newContext({viewport:{width:1440,height:1050}}),chat=await context.newPage();chat.on('pageerror',error=>errors.push(error.message));let posted=null,scope=null,turns=[],saved=[];
 await chat.route(base+'/api/bootstrap',async route=>{const r=await route.fetch();await route.fulfill({response:r,json:{...await r.json(),aiAvailable:true}});});
 await chat.route(base+'/api/conversation',route=>route.fulfill({json:{turns,results:saved,scope:saved.find(result=>result.series[0].unit==='percent')?.query||null,brief:scope,evidence:[]}}));
 await chat.route(base+'/api/analyst',async route=>{
  posted=route.request().postDataJSON();scope=posted.brief;saved=brief.panels.map(panel=>panel.result);const rate=saved.find(result=>result.series[0].unit==='percent');
  const answer={summary:'Decision brief fixture: the selected population and geography are preserved.',findings:[{text:'These are separate administrative population measures.',resultIds:[rate.id],evidenceIds:[]}],limitations:brief.limitations,actions:[],views:[{resultId:rate.id,type:'metric_cards',title:'Published participant context'}],clarification:null};
  turns=[{id:1,role:'user',content:posted.message,resultIds:[],createdAt:new Date().toISOString()},{id:2,role:'assistant',content:answer.summary,answer,resultIds:[rate.id],createdAt:new Date().toISOString()}];
  await route.fulfill({contentType:'application/x-ndjson',body:[{type:'brief',scope},...saved.map(result=>({type:'result',result})),{type:'answer',answer,turnId:2}].map(JSON.stringify).join('\n')+'\n'});
 });
 await chat.goto(base+'/participants?group=s&geography=CH-ZH');await expect(chat.locator('.participant-group')).toHaveCount(1);await chat.getByRole('button',{name:'Ask about this brief',exact:true}).click();await expect(chat).toHaveURL(/\/analyst\?/);await expect(chat.locator('.decision-context')).toContainText('Status S');await expect(chat.locator('.decision-context')).toContainText('Zürich canton');
 await chat.getByRole('button',{name:'Ask analyst',exact:true}).click();await expect(chat.locator('.answer-summary')).toContainText('Decision brief fixture');assert.deepEqual(posted.brief,brief.scope);
 await chat.getByRole('link',{name:'Data library',exact:true}).click();await chat.getByRole('link',{name:'AI Analyst',exact:true}).click();await expect(chat.locator('.decision-context')).toContainText('Status S');await chat.reload();await expect(chat.locator('.answer-summary')).toContainText('Decision brief fixture');await expect(chat.locator('.decision-context')).toContainText('Zürich canton');
 await chat.getByRole('button',{name:'Use chart only'}).click();await expect(chat.locator('.decision-context')).toHaveCount(0);await context.close();checks.push('typed AI brief context, source result, navigation, reload and explicit clearing');
 assert.deepEqual(errors,[]);const report={status:'passed',base,checks,pageErrors:errors};writeFileSync('test-results/decision-workspaces-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
