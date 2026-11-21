import assert from 'node:assert/strict';
const base=process.env.MARKET_RADAR_TEST_URL||'http://127.0.0.1:3000';
const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',origin:base,...headers},body:JSON.stringify(body)});
const health=await fetch(base+'/healthz'); assert.equal(health.status,200);
const initial=await (await fetch(base+'/api/bootstrap')).json();
assert.equal(initial.overview.listings,770);assert.equal(initial.overview.employers,197);
assert.equal(initial.catalog.length,595);
assert.ok(initial.catalog.every(c=>c.sourceId!=='thurgau_awa_rav_2026_10'));
assert.ok(initial.inventory.sources.every(s=>s.id!=='thurgau_awa_rav_2026_10'));
assert.equal(initial.inventory.counts.observations,3445);
assert.equal(initial.inventory.counts.sources,10);
assert.equal(initial.inventory.counts.nationalSeries,168);
assert.ok(initial.marketOverview.length>=5);
for(const panel of initial.marketOverview){assert.equal(panel.result.status,'ok');assert.ok(panel.result.sources.length);}
const query={seriesIds:['itboard_monitor_python_open_ads','itboard_monitor_docker_open_ads'],measure:'share'};
const valid=await post('/api/analytics',query);assert.equal(valid.status,200);const result=await valid.json();
assert.equal(result.series[0].points.at(-1).count,188);assert.equal(result.series[1].points.at(-1).count,123);
assert.ok(result.changes.find(x=>x.label==='Docker').absolute<0);
assert.equal((await post('/api/analytics',{...query,seniority:'junior'})).status,400);
assert.equal((await post('/api/analytics',query,{origin:'https://untrusted.example'})).status,403);
assert.equal((await post('/api/analyst',{message:'x'.repeat(18000)})).status,413);
const conversation=await fetch(base+'/api/conversation');assert.equal(conversation.status,200);
assert.match(conversation.headers.get('set-cookie')||'',/HttpOnly/i);
assert.equal((await conversation.json()).turns.length,0);
if(!initial.aiAvailable){
  const unavailable=await post('/api/analyst',{message:'How has Python changed?',context:null});assert.equal(unavailable.status,503);
  assert.equal((await unavailable.json()).error.code,'LLM_UNAVAILABLE');
  assert.equal((await post('/api/analytics',query)).status,200);
}
console.log('API smoke passed: verified data, deterministic comparison, parameter validation, origin protection and session cookie.'+(initial.aiAvailable?' Live AI is configured; the absent-key case was skipped.':' LLM-unavailable resilience also passed.'));
