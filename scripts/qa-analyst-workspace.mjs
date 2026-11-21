import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';

// UI contract test: real deterministic analytics, simulated AI NDJSON only.
// Does not call an LLM and does not reuse the user's browser or conversation.
const base=(process.env.MARKET_RADAR_TEST_URL||'http://127.0.0.1:3000').replace(/\/$/,'');
const launch=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
 ?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}
 :{channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'};
mkdirSync('test-results',{recursive:true});
const browser=await chromium.launch({...launch,headless:true});
const checks=[],observations=[];
try {
 const page=await browser.newPage({viewport:{width:1500,height:1050}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 let latest=null,turnId=10000;
 const turns=[],results=new Map(),evidence=new Map(),requests=[];
 // Enable only the browser UI fixture; the analyst endpoint is intercepted below.
 // No server key is needed or read for this deterministic interface test.
 await page.route(base+'/api/bootstrap',async route=>{const response=await route.fetch();const body=await response.json();await route.fulfill({response,json:{...body,aiAvailable:true}});});
 await page.route(base+'/api/conversation**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({turns,results:[...results.values()],evidence:[...evidence.values()],scope:null})}));
 await page.route(base+'/api/analyst',async route=>{
  const input=route.request().postDataJSON();requests.push(input);
  assert.ok(latest,'Expected a real backend result before the UI fixture');
  assert.deepEqual(input.context,latest.query,'Manual view context must reach the AI endpoint unchanged');
  const r=latest;results.set(r.id,r);
  const source=r.sources[0],ev={id:'ui_source_'+source.id,title:source.title,summary:source.coverage,limitations:'UI test fixture; no LLM was called.',period:r.series[0].points.at(-1)?.end||'',url:source.url,locator:'Original source'};
  evidence.set(ev.id,ev);
  const answer={summary:`UI contract check for ${source.publisher}. This simulated response displays real backend values.`,findings:[{text:source.coverage,resultIds:[r.id],evidenceIds:[ev.id]}],limitations:r.limitations.slice(0,2),actions:['Review the original source before making a programme decision.'],views:r.allowedViews.map(type=>({resultId:r.id,type,title:`UI ${type} · ${source.id}`})),clarification:null};
  const createdAt=new Date().toISOString();
  turns.push({id:++turnId,role:'user',content:input.message,createdAt,resultIds:[]});
  turns.push({id:++turnId,role:'assistant',content:answer.summary,createdAt,answer,resultIds:[r.id]});
  await route.fulfill({status:200,contentType:'application/x-ndjson',body:[{type:'status',message:'UI fixture: displaying verified backend data'},{type:'result',result:r},{type:'evidence',evidence:[ev]},{type:'answer',answer,turnId}].map(x=>JSON.stringify(x)).join('\n')+'\n'});
 });
 await page.goto(base);
 await page.getByRole('heading',{name:'The market, from more than one angle.'}).waitFor();
 const data=await(await page.request.get(base+'/api/bootstrap')).json();
 const sourceCount=data.inventory.sources.length;
 assert.equal(sourceCount,10);
 assert.ok(!data.inventory.sources.some(s=>s.id==='thurgau_awa_rav_2026_10'));
 assert.ok(!data.catalog.some(s=>s.sourceId==='thurgau_awa_rav_2026_10'));
 assert.ok(data.catalog.some(s=>s.geography==='CH-TG'&&s.sourceId.startsWith('sem_')),'Other sources may still describe Thurgau canton');
 const act=async fn=>{
  const response=page.waitForResponse(r=>r.url()===base+'/api/analytics'&&r.request().method()==='POST');
  await fn();const r=await response,result=await r.json();
  assert.equal(r.status(),200,JSON.stringify(result.error));
  await expect(page.locator('.chart-loading-bar')).toHaveCount(0);
  return result;
 };
 const send=async()=>{
  await page.getByRole('button',{name:'Ask about this view',exact:true}).click();
  const before=requests.length;
  await page.getByRole('button',{name:'Ask analyst',exact:true}).click();
  await expect(page.locator('.message-assistant')).toHaveCount(turns.filter(t=>t.role==='assistant').length||1);
  await expect(page.getByRole('button',{name:'Ask analyst',exact:true})).toBeVisible();
  assert.equal(requests.length,before+1);
  await expect(page.locator('.analyst-canvas .result-header h2')).toHaveText(latest.title);
  await expect(page.locator('.chat-error')).toHaveCount(0);
 };
 const checkView=async(type,sourceId)=>{
  await act(()=>page.getByRole('button',{name:`UI ${type} · ${sourceId}`,exact:true}).last().click());
  const canvas=page.locator('.analyst-canvas');
  if(type==='line')await expect(canvas.locator('.recharts-line')).not.toHaveCount(0);
  if(type==='bar')await expect(canvas.locator('.recharts-bar')).not.toHaveCount(0);
  if(type==='table'){
   await expect(canvas.locator('.data-table tbody tr')).toHaveCount(latest.series.reduce((n,s)=>n+s.points.length,0));
   const last=latest.series.at(-1).points.at(-1);
   const formatted=await page.evaluate(value=>new Intl.NumberFormat('en-CH',{maximumFractionDigits:Number.isInteger(value)?0:2}).format(value),last.value);
   await expect(canvas.locator('.data-table tbody tr').last()).toContainText(formatted);
  }
  if(type==='metric_cards')await expect(canvas.locator('.metric-cards-view .latest-item')).toHaveCount(Math.min(4,latest.series.length));
  await expect(page.locator('.message-assistant').last().locator('.answer-views button.active')).toHaveCount(1);
  await expect(page.getByRole('button',{name:`UI ${type} · ${sourceId}`,exact:true}).last()).toHaveAttribute('aria-pressed','true');
 };
 await page.getByRole('button',{name:'Explore the market',exact:true}).click();
 for(const source of data.inventory.sources){
  latest=await act(()=>page.getByLabel('Source',{exact:true}).selectOption(source.id));
  assert.ok(latest.series.every(s=>s.sourceId===source.id));
  await send();
  for(const type of latest.allowedViews)await checkView(type,source.id);
  const answer=page.locator('.message-assistant').last();
  await page.locator('.analyst-canvas').getByRole('button',{name:'Data',exact:true}).click();
  await expect(answer.locator('.answer-views button.active')).toHaveCount(1);
  await expect(answer.getByRole('button',{name:`UI table · ${source.id}`,exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(answer.locator('.finding-citations a')).toHaveAttribute('href',latest.sources[0].url);
  await page.getByRole('button',{name:'Sources and coverage for this chart',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Sources & coverage',exact:true})).toBeVisible();
  await expect(page.locator('.sources-drawer .source-link').first()).toHaveAttribute('href',latest.sources[0].url);
  await page.getByRole('button',{name:'Close sources panel',exact:true}).click();
  await act(()=>answer.getByRole('button',{name:'View evidence',exact:true}).click());
  await expect(page.locator('.analyst-canvas .result-header h2')).toHaveText(latest.title);
  if(source.id.startsWith('fso_')){
   await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
   await page.screenshot({path:'test-results/analyst-bfs-ui-contract.png',fullPage:true,animations:'disabled'});
  }
  await page.getByRole('button',{name:'Explore this view',exact:true}).click();
  await expect(page.getByLabel('Source',{exact:true})).toHaveValue(source.id);
  await expect(page.getByLabel('Geography',{exact:true})).toHaveValue(latest.query.geography);
  await expect(page.getByLabel('Choose indicator',{exact:true})).toHaveValue(latest.query.seriesIds[0]);
  checks.push({source:source.id,views:latest.allowedViews,geography:latest.query.geography,measure:latest.query.measure});
 }
 // Overview -> explorer -> analyst preserves its exact query.
 await page.getByRole('button',{name:'Market overview',exact:true}).click();
 latest=await act(()=>page.locator('.source-signal').filter({hasText:'BFS'}).getByRole('button',{name:'Explore this indicator',exact:true}).click());
 await send();
 // Library -> explorer -> analyst uses the saved reported-value selection.
 await page.getByRole('button',{name:'Data library',exact:true}).click();
 const item=data.catalog.find(c=>c.sourceId.startsWith('sem_')&&c.geography==='CH'&&c.metric==='registry_employment_rate');
 await page.getByLabel('Search all indicators').fill(item.label);
 latest=await act(()=>page.locator('.library-table tbody tr').first().getByRole('button').click());
 await send();
 assert.equal(requests.at(-1).context.measure,'reported');
 await expect(page.locator('.analyst-canvas .scope-chips')).toContainText('Reported values');
 assert.deepEqual(errors,[]);
 const report={kind:'UI contract test; simulated AI transport, real deterministic analytics',base,sources:checks,viewChecks:checks.reduce((n,c)=>n+c.views.length,0),contextChecks:requests.length,observations,pageErrors:errors};
 writeFileSync('test-results/analyst-workspace-ui-report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}finally{await browser.close();}
