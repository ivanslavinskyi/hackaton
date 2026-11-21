// Optional, billable integration audit. Uses isolated anonymous conversations.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=(process.env.MARKET_RADAR_TEST_URL||'http://127.0.0.1:3000').replace(/\/$/,'');
const selectedSource=process.argv[2];
const data=await(await fetch(base+'/api/bootstrap')).json();
assert.equal(data.aiAvailable,true,'Configure the server API key before a live audit.');
mkdirSync('.runtime',{recursive:true});
const cases=data.inventory.sources.map((source,index)=>{
  const rows=data.catalog.filter(c=>c.sourceId===source.id);
  const national=rows.filter(c=>c.geography==='CH'),available=national.length?national:rows;
  const item=available.find(c=>c.id==='itboard_monitor_python_open_ads')||available.find(c=>c.id.endsWith('_oc251'))
    ||available.find(c=>c.id.endsWith('div_62_63'))||available.find(c=>c.metric==='registry_employment_rate')||available[0];
  const view=['line','bar','table','metric_cards'][index%4];
  const message=`Use the available analytics tools to examine "${item.label}" from ${source.title} (${source.publisher}), geography ${item.geography}. Show ${view==='metric_cards'?'metric cards':view==='line'?'a trend line':view==='bar'?'a bar chart':'a data table'}. Explain the latest available value, its reporting period and its main limitation. Keep this source separate from other populations.`;
  return {sourceId:source.id,itemId:item.id,geography:item.geography,view,message};
}).filter(item=>!selectedSource||item.sourceId===selectedSource);
assert.ok(cases.length,'The requested source is not in the verified inventory.');
let nextStart=0;
async function ask(item,cookie='',context=null){
  const now=Date.now(),start=Math.max(now,nextStart);nextStart=start+6500;
  if(start>now)await new Promise(resolve=>setTimeout(resolve,start-now));
  const response=await fetch(base+'/api/analyst',{method:'POST',headers:{'content-type':'application/json',origin:base,...(cookie?{cookie}:{})},body:JSON.stringify({message:item.message,context}),signal:AbortSignal.timeout(65000)});
  const text=await response.text(),events=text.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const answer=events.find(e=>e.type==='answer')?.answer,results=events.filter(e=>e.type==='result').map(e=>e.result);
  const evidenceIds=new Set(answer?.findings.flatMap(f=>f.resultIds).concat(answer?.views.map(v=>v.resultId))||[]);
  const cited=results.filter(r=>evidenceIds.has(r.id));
  const ok=response.ok&&Boolean(answer)&&cited.some(r=>r.sources.some(s=>s.id===item.sourceId));
  const run={...item,ok,http:response.status,answer,results,errors:events.filter(e=>e.type==='error'),cookie:response.headers.get('set-cookie')?.split(';')[0]||cookie};
  console.log(JSON.stringify({source:item.sourceId,ok,http:run.http,resultSources:[...new Set(cited.flatMap(r=>r.sources.map(s=>s.id)))],views:answer?.views.map(v=>v.type),errors:run.errors}));
  return run;
}
const runs=[];let cursor=0;
async function worker(){while(cursor<cases.length){const item=cases[cursor++];try{runs.push(await ask(item));}catch(error){runs.push({...item,ok:false,error:String(error)});console.log(JSON.stringify({source:item.sourceId,ok:false,error:String(error)}));}}}
await Promise.all([worker(),worker()]);
const python=runs.find(r=>r.sourceId==='itboard_monitor_csv'&&r.ok);
if(python){
  const context=python.results.find(r=>r.series.some(s=>s.id==='itboard_monitor_python_open_ads'))?.query||null;
  const follow=await ask({sourceId:'itboard_monitor_csv',message:'Compare with Docker. Keep the same geography and explain counts versus shares. Show a line chart.',kind:'follow-up'},python.cookie,context);
  follow.ok=follow.ok&&follow.results.some(r=>r.series.some(s=>s.id==='itboard_monitor_python_open_ads')&&r.series.some(s=>s.id==='itboard_monitor_docker_open_ads'));
  runs.push(follow);
}
// Test transcripts stay local; never print or commit cookies.
const report=runs.map(({cookie,...run})=>run);
const reportPath=`.runtime/live-ai-coverage${selectedSource?'-'+selectedSource:''}.json`;
writeFileSync(reportPath,JSON.stringify({checkedAt:new Date().toISOString(),base,runs:report},null,2));
console.log(JSON.stringify({passed:runs.filter(r=>r.ok).length,total:runs.length,report:reportPath}));
assert.ok(runs.every(r=>r.ok),'One or more source scenarios failed; inspect the local report.');
