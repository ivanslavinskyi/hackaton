// Real backend; no paid AI calls. Context changes must survive reload before sending a question.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.MARKET_RADAR_TEST_URL||'http://127.0.0.1:3002';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
const checks=[];
try{
 const context=await browser.newContext(),page=await context.newPage();
 const state=async()=>{const response=await page.request.get(base+'/api/conversation');assert.equal(response.status(),200);return response.json();};
 await page.goto(base+'/participants?group=s&geography=CH-ZH');await expect(page.locator('.participant-metric')).toHaveCount(3);
 await page.getByRole('button',{name:'Ask about this brief',exact:true}).click();await expect(page).toHaveURL(/\/analyst\?/);
 await expect(page.locator('.decision-context')).toContainText('Status S');await page.reload();await expect(page.locator('.decision-context')).toContainText('Zürich canton');
 assert.deepEqual((await state()).brief,{kind:'participants',group:'s',geography:'CH-ZH'});assert.equal((await state()).turns.length,0);checks.push('Prepared brief survives reload before the first AI question');
 await page.getByRole('button',{name:'Use chart only'}).click();await expect(page.locator('.decision-context')).toHaveCount(0);assert.equal((await state()).brief,null);
 await page.reload();await expect(page.locator('.analyst-canvas .result-header h2')).toContainText(/employment/i);assert.equal((await state()).brief,null);await expect(page.locator('.decision-context')).toHaveCount(0);checks.push('Chart-only context persists through reload');
 await page.goto(base+'/opportunities?role=itboard_csv_rolle_data-analyst');await expect(page.locator('.decision-panel')).toHaveCount(4);await page.getByRole('button',{name:'Ask about this brief',exact:true}).click();await expect(page).toHaveURL(/\/analyst\?/);assert.equal((await state()).brief.role,'itboard_csv_rolle_data-analyst');
 await page.getByRole('link',{name:'Graduate opportunities',exact:true}).click();await expect(page.locator('.decision-panel')).toHaveCount(4);await page.locator('[data-panel=junior]').getByRole('button',{name:'Explore this evidence'}).click();await expect(page).toHaveURL(/\/explore\?/);assert.equal((await state()).brief,null);await page.reload();await expect(page.locator('.result-header h2')).toHaveText('Junior-tagged listings');assert.equal((await state()).brief,null);checks.push('Manual evidence handoff replaces prior decision context');
 const r=await page.request.patch(base+'/api/conversation',{headers:{origin:base},data:{brief:{kind:'participants',group:'f',geography:'CH-BE'}}});assert.equal(r.status(),200);
 await page.getByRole('button',{name:'Ask about this view',exact:true}).click();await expect(page).toHaveURL(/\/analyst\?/);await page.reload();await expect(page.locator('.decision-context')).toContainText('Permit F');
 const current=await state();await page.request.post(base+'/api/analytics',{headers:{origin:base,'X-Radar-Context':'chart'},data:{...current.scope,measure:'count'}});assert.equal((await state()).brief,null);checks.push('Manual query clears the saved brief');
 const before=await state();const invalid=await page.request.patch(base+'/api/conversation',{headers:{origin:base},data:{brief:{kind:'participants',group:'s'},context:{seriesIds:['missing-series']}}});assert.equal(invalid.status(),400);assert.deepEqual((await state()).brief,before.brief);assert.deepEqual((await state()).scope,before.scope);
 assert.equal((await page.request.patch(base+'/api/conversation',{headers:{origin:'https://untrusted.example'},data:{brief:null}})).status(),403);checks.push('Invalid and cross-origin context changes are rejected');
 await expect(page.locator('.workspace-person strong')).toHaveText('Powercoders');await expect(page.locator('.workspace-person span')).toHaveText('Workspace');await context.close();
 mkdirSync('test-results',{recursive:true});writeFileSync('test-results/context-persistence.json',JSON.stringify({base,status:'passed',checks},null,2));console.log(JSON.stringify({base,status:'passed',checks}));
}finally{await browser.close();}
