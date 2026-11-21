// Paid-provider acceptance. Isolated browser sessions; no production user history is read.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.MARKET_RADAR_TEST_URL||'http://127.0.0.1:3000';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
const checks=[],transcripts=[],pageErrors=[];
const verified=new Set();
mkdirSync('test-results',{recursive:true});
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>key!=='generatedAt').map(([key,v])=>[key,canonical(v)])):value;
const fmt=(value,unit='')=>value===null?'—':new Intl.NumberFormat('en-CH',{maximumFractionDigits:Number.isInteger(value)?0:2}).format(value)+(/percent|^%$/.test(unit)?'%':'');
const numericText=value=>value.replace(/[’']/g,''); // Browser and Node ICU use different Swiss separators.
async function check(name,fn){try{await fn();checks.push({name,status:'passed'});console.log('PASS '+name);}catch(error){checks.push({name,status:'failed',error:error.message});console.log('FAIL '+name+': '+error.message.slice(0,800));}save();}
function save(){writeFileSync('test-results/live-decision-consistency.json',JSON.stringify({base,checkedAt:new Date().toISOString(),checks,pageErrors},null,2));writeFileSync('test-results/live-decision-transcripts.json',JSON.stringify(transcripts,null,2));}
async function state(page){const r=await page.request.get(base+'/api/conversation');assert.equal(r.status(),200);return r.json();}
async function ask(page,message){
 await page.getByLabel('Ask the AI Analyst').fill(message);
 const waiting=page.waitForResponse(r=>r.url()===base+'/api/analyst'&&r.request().method()==='POST',{timeout:65000});
 await page.getByRole('button',{name:'Ask analyst',exact:true}).click();const r=await waiting;assert.equal(r.status(),200);
 const events=(await r.text()).trim().split('\n').map(JSON.parse);transcripts.push({message,events});save();
 await expect(page.locator('.analyst-working')).toHaveCount(0,{timeout:65000});
 const answer=events.find(e=>e.type==='answer')?.answer;assert.ok(answer,JSON.stringify(events.filter(e=>e.type==='error')));
 await expect(page.locator('.chat-error')).toHaveCount(0);
 return {answer,events};
}
async function verifyViews(page,answer,verifier){
 const saved=await state(page),byId=new Map(saved.results.map(r=>[r.id,r]));
 for(const f of answer.findings){for(const id of f.resultIds)assert.ok(byId.has(id));for(const id of f.evidenceIds)assert.ok(saved.evidence.some(e=>e.id===id));}
 for(const id of new Set([...answer.findings.flatMap(f=>f.resultIds),...answer.views.map(v=>v.resultId)])){
  if(verified.has(id))continue;const r=byId.get(id);assert.ok(r);
  const deterministic=await verifier.post(base+'/api/analytics',{headers:{origin:base},data:r.query});assert.equal(deterministic.status(),200);assert.deepEqual(canonical(r),canonical(await deterministic.json()));verified.add(id);
 }
 for(let i=0;i<answer.views.length;i++){
  const view=answer.views[i],r=byId.get(view.resultId);assert.ok(r);assert.ok(r.allowedViews.includes(view.type));
  const button=page.locator('.message-assistant').last().locator('.answer-views button').nth(i);
  await button.click();await expect(button).toHaveAttribute('aria-pressed','true');
  const canvas=page.locator('.analyst-canvas');await expect(canvas.locator('.result-header h2')).toHaveText(r.title);
  await canvas.getByRole('button',{name:'Data',exact:true}).click();const rows=canvas.locator('tbody tr');await expect(rows).toHaveCount(r.series.reduce((n,s)=>n+s.points.length,0));
  const headings=await canvas.locator('thead th').allTextContents();
  let row=0;for(const series of r.series)for(const p of series.points){
   const cells=rows.nth(row++).locator('td');assert.equal(await cells.nth(1).innerText(),series.label);assert.equal(numericText(await cells.nth(2).innerText()),numericText(fmt(p.value,series.unit)));
   for(const [heading,key] of [['Count','count'],['Denominator','denominator']])if(headings.includes(heading))assert.equal(numericText(await cells.nth(headings.indexOf(heading)).innerText()),numericText(fmt(p[key])));
  }
  await canvas.getByRole('button',{name:'Sources and coverage for this chart'}).click();await expect(page.locator('dialog[open]')).toBeVisible();
  assert.deepEqual(await page.locator('dialog[open] .source-link').evaluateAll(links=>links.map(a=>a.getAttribute('href'))),r.sources.map(s=>s.url));
  for(const source of r.sources)await expect(page.locator('dialog[open]')).toContainText(source.publisher);
  await page.getByRole('button',{name:'Close sources panel'}).click();
 }
 return saved;
}
try{
 const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage();page.on('pageerror',e=>pageErrors.push(e.message));
 const verifyContext=await browser.newContext();const verifier=verifyContext.request;
 await check('manual role and participant selectors',async()=>{
  await page.goto(base+'/opportunities');await expect(page.locator('.decision-panel')).toHaveCount(4);
  for(const role of ['itboard_csv_rolle_data-analyst','itboard_csv_rolle_scrum-master','itboard_csv_rolle_it-support']){
   await page.getByLabel('Role to investigate').selectOption(role);await expect(page.locator('.decision-panel')).toHaveCount(4);
   const r=await page.request.post(base+'/api/decision-brief',{headers:{origin:base},data:{kind:'opportunities',role}});assert.equal(r.status(),200);const brief=await r.json();
   await expect(page.locator('[data-panel=role] .result-header h2')).toHaveText(brief.panels[0].result.title);
  }
  await page.getByRole('link',{name:'Participant context',exact:true}).click();await expect(page.locator('.participant-metric')).toHaveCount(9);
  for(const [group,geography] of [['f','CH'],['b','CH-GE'],['s','CH-ZH'],['f','CH-BE']]){
   await page.getByLabel('Population group').selectOption(group);await page.getByLabel('Participant geography').selectOption(geography);await expect(page.locator('.participant-metric')).toHaveCount(3);
   const r=await page.request.post(base+'/api/decision-brief',{headers:{origin:base},data:{kind:'participants',group,geography}});assert.equal(r.status(),200);const brief=await r.json();
   for(const panel of brief.panels)await expect.poll(async()=>numericText(await page.locator(`[data-metric=${panel.metric}] strong`).innerText())).toBe(numericText(fmt(panel.result.series[0].points[0].value,panel.result.series[0].unit)));
  }
 });
 await check('live participant brief, exact tables and source links',async()=>{
  await page.goto(base+'/participants?group=s&geography=CH-ZH');await expect(page.locator('.participant-metric')).toHaveCount(3);await page.getByRole('button',{name:'Ask about this brief',exact:true}).click();
  const {answer}=await ask(page,'Explain the selected participant group in this canton, including the population, employed people and employment rate.');
  const saved=await verifyViews(page,answer,verifier);assert.deepEqual(saved.brief,{kind:'participants',group:'s',geography:'CH-ZH'});
 });
 await check('live group follow-up retains canton',async()=>{
  const {answer}=await ask(page,'And for recognized refugees with permit B in the same canton?');const saved=await verifyViews(page,answer,verifier);
  assert.deepEqual(saved.brief,{kind:'participants',group:'b',geography:'CH-ZH'});await expect(page.locator('.decision-context')).toContainText('Refugees with permit B');
  assert.ok(answer.views.some(v=>saved.results.find(r=>r.id===v.resultId)?.series.some(s=>s.sourceId==='sem_asyl_202610_6_23')));
 });
 await check('live canton follow-up retains group',async()=>{
  const {answer}=await ask(page,'What about Bern canton?');const saved=await verifyViews(page,answer,verifier);assert.deepEqual(saved.brief,{kind:'participants',group:'b',geography:'CH-BE'});
  assert.ok(answer.views.every(v=>saved.results.find(r=>r.id===v.resultId)?.query.geography==='CH-BE'));
  await page.reload();await expect(page.locator('.decision-context')).toContainText('Bern canton');await expect(page.locator('.decision-context')).toContainText('Refugees with permit B');
 });
 await check('unavailable participant trend stays a snapshot',async()=>{
  const {answer}=await ask(page,'How has this group’s employment rate changed over the last six months?');const saved=await verifyViews(page,answer,verifier);
  assert.match(JSON.stringify(answer),/snapshot|single|not available|cannot|no.*trend|not.*time.series/i);
  for(const view of answer.views){const result=saved.results.find(r=>r.id===view.resultId);if(result.series.some(s=>s.id.startsWith('sem_')))assert.ok(result.series.every(s=>s.points.length===1));}
 });
 await check('chart-only context survives reload',async()=>{
  await page.getByRole('button',{name:'Use chart only'}).click();await expect(page.locator('.decision-context')).toHaveCount(0);await page.reload();await expect(page.locator('.decision-context')).toHaveCount(0);assert.equal((await state(page)).brief,null);
 });
 await check('all participant groups keep separate denominators',async()=>{
  const {answer,events}=await ask(page,'Show all three participant groups in Bern separately. Explain their employment rates and denominators without merging the populations.');
  const saved=await verifyViews(page,answer,verifier);assert.deepEqual(saved.brief,{kind:'participants',group:'all',geography:'CH-BE'});
  const returned=events.filter(e=>e.type==='result').map(e=>e.result);
  for(const source of ['sem_asyl_202610_6_22','sem_asyl_202610_6_23','sem_asyl_202610_6_24'])assert.ok(returned.some(r=>r.sources.some(s=>s.id===source)));
 });
 const roleContext=await browser.newContext({viewport:{width:1440,height:1050}}),rolePage=await roleContext.newPage();rolePage.on('pageerror',e=>pageErrors.push(e.message));
 await check('live role brief and independent context panels',async()=>{
  await rolePage.goto(base+'/opportunities?role=itboard_csv_rolle_data-analyst');await expect(rolePage.locator('.decision-panel')).toHaveCount(4);await rolePage.getByRole('button',{name:'Ask about this brief',exact:true}).click();
  const {answer}=await ask(rolePage,'What can this brief tell us about Data Analyst opportunities for graduates? Distinguish role evidence from broader context.');const saved=await verifyViews(rolePage,answer,verifier);assert.equal(saved.brief.role,'itboard_csv_rolle_data-analyst');
 });
 await check('live role follow-up changes selected role',async()=>{
  const {answer}=await ask(rolePage,'What about IT Support instead?');const saved=await verifyViews(rolePage,answer,verifier);assert.equal(saved.brief.role,'itboard_csv_rolle_it-support');await expect(rolePage.locator('.decision-context')).toContainText('IT Support');
 });
 await check('live unavailable junior skill intersection',async()=>{
  const {answer}=await ask(rolePage,'For those IT Support jobs, how many junior positions ask for Python?');await verifyViews(rolePage,answer,verifier);
  assert.match(JSON.stringify(answer),/cross.tab|intersection|cannot|not available|not.*available|separate|unavailable/i);
 });
 await page.screenshot({path:'test-results/consistency-participants.png',fullPage:true});await rolePage.screenshot({path:'test-results/consistency-opportunities.png',fullPage:true});
 await check('no browser runtime errors',async()=>assert.deepEqual(pageErrors,[]));
 await context.close();await roleContext.close();await verifyContext.close();
}finally{save();await browser.close();}
if(checks.some(c=>c.status==='failed'))process.exitCode=1;
