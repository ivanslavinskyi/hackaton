// Optional paid-provider check. Uses isolated browser conversations and the server's key.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.MARKET_RADAR_TEST_URL||'http://127.0.0.1:3000';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
const checks=[];mkdirSync('test-results',{recursive:true});
async function send(page,action){
 const waiting=page.waitForResponse(response=>response.url()===base+'/api/analyst'&&response.request().method()==='POST',{timeout:65000});
 await action();const response=await waiting;assert.equal(response.status(),200);const events=(await response.text()).trim().split('\n').map(JSON.parse);
 assert.ok(events.some(event=>event.type==='answer'),JSON.stringify(events.filter(event=>event.type==='error')));
 await expect(page.locator('.analyst-working')).toHaveCount(0,{timeout:65000});await expect(page.locator('.chat-error')).toHaveCount(0);
 assert.ok(events.some(event=>event.type==='result'));await expect(page.locator('.finding-citations button').first()).toBeVisible();
 return events;
}
try{
 for(const kind of ['opportunities','participants']){
  const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage();
  const path=kind==='opportunities'?'/opportunities?role=itboard_csv_rolle_it-support':'/participants?group=f&geography=CH-ZH';
  await page.goto(base+path);await expect(page.getByRole('button',{name:'Ask about this brief',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Ask about this brief',exact:true}).click();
  const events=await send(page,()=>page.getByRole('button',{name:'Ask analyst',exact:true}).click());
  assert.ok(events.some(event=>event.type==='brief'&&event.scope.kind===kind),'The model should retrieve the complete selected decision brief');
  const state=await(await page.request.get(base+'/api/conversation')).json();assert.equal(state.brief.kind,kind);
  checks.push({kind,resultIds:[...new Set(events.filter(event=>event.type==='result').map(event=>event.result.id))],status:'passed'});
  if(kind==='participants'){
    const followup=await send(page,()=>page.getByRole('button',{name:'What about Bern canton?',exact:true}).click());
    const saved=await(await page.request.get(base+'/api/conversation')).json();assert.deepEqual(saved.brief,{kind:'participants',group:'f',geography:'CH-BE'});
    assert.ok(followup.some(event=>event.type==='result'&&event.result.query.geography==='CH-BE'));
    await page.reload();await expect(page.locator('.decision-context')).toContainText('Permit F');await expect(page.locator('.decision-context')).toContainText('Bern canton');await expect(page.locator('.message-assistant')).toHaveCount(2);
    checks.push({kind:'participant canton follow-up and reload',status:'passed'});
  }
  await page.screenshot({path:`test-results/live-${kind}.png`,fullPage:true});await context.close();
 }
 writeFileSync('test-results/live-decision-report.json',JSON.stringify({base,status:'passed',checks},null,2));console.log(JSON.stringify({base,status:'passed',checks}));
}finally{await browser.close();}
