// Compare the running production and local apps without sending requests to the LLM.
// On Windows, use `node --use-system-ca scripts/check-production.mjs`.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';

const production=new URL(process.env.MARKET_RADAR_PRODUCTION_URL||'https://hackatonprojekt.net').origin;
const local=new URL(process.env.MARKET_RADAR_LOCAL_URL||'http://127.0.0.1:3000').origin;
assert.equal(new URL(production).protocol,'https:','Production checks require verified HTTPS.');
assert.notEqual(production,local,'Production and local addresses must be different.');
mkdirSync('.runtime',{recursive:true});
const sessionFile='.runtime/production-check-sessions.json';
const reportFile='.runtime/production-check.json';
const sessions=existsSync(sessionFile)?JSON.parse(readFileSync(sessionFile,'utf8')):{};
const report={checkedAt:new Date().toISOString(),production,local,status:'running',checks:[],queries:[]};
let phase='initialization';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
  ?Object.fromEntries(Object.entries(value).filter(([key])=>key!=='generatedAt').map(([key,entry])=>[key,canonical(entry)])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function saveSessions(){writeFileSync(sessionFile,JSON.stringify(sessions,null,2),{mode:0o600});}
function recordCookie(origin,response){
  const header=response.headers.get('set-cookie');
  if(!header)return;
  const match=header.match(/(?:^|,\s*)market_radar_session=([a-f0-9]{64})(?:;|$)/);
  if(!match)return;
  assert.match(header,/;\s*HttpOnly(?:;|$)/i,'Session cookie must be HTTP-only.');
  assert.match(header,/;\s*SameSite=Lax(?:;|$)/i,'Session cookie must use SameSite=Lax.');
  if(origin===production)assert.match(header,/;\s*Secure(?:;|$)/i,'Production cookie must be Secure.');
  sessions[origin]={...sessions[origin],cookie:`market_radar_session=${match[1]}`};
  saveSessions();
}
async function request(origin,path,{method='GET',body,headers={},status=200}={}){
  const cookie=sessions[origin]?.cookie;
  const response=await fetch(origin+path,{method,redirect:'manual',signal:AbortSignal.timeout(30000),
    headers:{...(cookie?{cookie}:{}),...(body!==undefined?{'content-type':'application/json',origin}:{}),...headers},
    ...(body!==undefined?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,status,`${method} ${origin}${path}: expected ${status}, received ${response.status}`);
  recordCookie(origin,response);
  return response;
}
async function json(origin,path,options){return(await request(origin,path,options)).json();}
function equal(actual,expected,label){assert.deepEqual(canonical(actual),canonical(expected),label);}

try {
  phase='health and session cookies';
  const health={};
  for(const origin of [local,production]){
    health[origin]=await json(origin,'/healthz');
    assert.equal(health[origin].status,'ok');assert.equal(health[origin].series,595);
    assert.equal(health[origin].ai,'configured','AI key must be configured on both hosts.');
    const response=await request(origin,'/api/conversation');
    assert.ok(sessions[origin]?.cookie,'A session cookie was issued.');
    await response.json();
  }
  equal(health[production],health[local],'Health parity');
  report.checks.push({name:phase,status:'passed',productionCookie:['HttpOnly','Secure','SameSite=Lax']});

  phase='bootstrap and data parity';
  const localData=await json(local,'/api/bootstrap'),prodData=await json(production,'/api/bootstrap');
  assert.equal(prodData.catalog.length,595);
  assert.deepEqual(prodData.inventory.counts,{observations:3445,nationalObservations:2015,series:595,nationalSeries:168,sources:10});
  assert.equal(prodData.inventory.sourcePolicyVersion,'2026-11-21.1');
  assert.equal(prodData.inventory.sources.length,10);assert.equal(prodData.marketOverview.length,6);
  assert.ok(prodData.catalog.every(item=>item.sourceId!=='thurgau_awa_rav_2026_10'));
  assert.ok(prodData.inventory.sources.every(source=>source.id!=='thurgau_awa_rav_2026_10'));
  for(const field of ['catalog','inventory','marketOverview','initialResult','overview','release','model','aiAvailable']){
    equal(prodData[field],localData[field],`Bootstrap ${field} parity`);
  }
  assert.equal(prodData.aiAvailable,true);
  report.checks.push({name:phase,status:'passed',counts:prodData.inventory.counts,sourcePolicyVersion:prodData.inventory.sourcePolicyVersion,catalogSha256:digest(prodData.catalog),overviewPanels:6});

  phase='representative queries across every active source';
  const queries=prodData.inventory.sources.map(source=>{
    const rows=prodData.catalog.filter(item=>item.sourceId===source.id);
    const item=source.sampleSeriesIds.map(id=>rows.find(row=>row.id===id)).find(Boolean)||rows.find(row=>row.geography==='CH')||rows[0];
    return {label:source.id,query:{seriesIds:[item.id],sourceId:item.sourceId,topic:item.topic,geography:item.geography,mode:'history',measure:'reported'}};
  });
  queries.push({label:'python_docker_comparison',query:{seriesIds:['itboard_monitor_python_open_ads','itboard_monitor_docker_open_ads'],geography:'CH',measure:'share',mode:'history',start:'2026-10-01',end:'2026-11-15'}});
  for(const {label,query} of queries){
    const expected=await json(local,'/api/analytics',{method:'POST',body:query});
    const actual=await json(production,'/api/analytics',{method:'POST',body:query});
    assert.equal(actual.status,'ok',label);
    // Compare the entire result: query, ID, values, changes, source metadata,
    // limitations and allowed views. Only generation timestamps are omitted.
    equal(actual,expected,`${label}: exact analytics result parity`);
    report.queries.push({label,status:'passed',resultId:actual.id,sources:actual.sources.map(source=>source.id),series:actual.series.length,sha256:digest(actual)});
    for(const origin of [local,production])sessions[origin]={...sessions[origin],lastQuery:query,lastResultId:actual.id};
    saveSessions();
  }
  report.checks.push({name:phase,status:'passed',queries:queries.length});

  phase='saved query and result retrieval';
  for(const origin of [local,production]){
    const saved=await json(origin,`/api/conversation?resultId=${sessions[origin].lastResultId}`);
    assert.equal(saved.results.length,1);assert.equal(saved.results[0].id,sessions[origin].lastResultId);
    const expected=await json(origin,'/api/analytics',{method:'POST',body:sessions[origin].lastQuery});
    equal(saved.results[0],expected,`${origin}: stored result matches deterministic query`);
    equal(saved.scope,expected.query,`${origin}: manual query scope persisted`);
  }
  report.checks.push({name:phase,status:'passed'});

  phase='request protections';
  const valid=queries.at(-1).query;
  await request(production,'/api/analytics',{method:'POST',body:valid,headers:{origin:'https://untrusted.example'},status:403});
  await request(production,'/api/analytics',{method:'POST',body:{...valid,sql:'SELECT 1'},status:400});
  await request(production,'/api/analytics',{method:'POST',body:{seriesIds:['thurgau_rav_noga62'],geography:'CH-TG'},status:400});
  report.checks.push({name:phase,status:'passed',crossOrigin:403,invalidParameters:400,removedSource:400});

  phase='public assets and sensitive file isolation';
  const html=await(await request(production,'/')).text();
  assert.match(html,/Market Radar/);
  const styles=[...new Set([...html.matchAll(/<link\b[^>]*href="([^"]+\.css(?:\?[^"]*)?)"/g)].map(match=>match[1]))];
  assert.ok(styles.length,'The page references a CSS asset.');
  for(const href of styles){
    const url=new URL(href,production);assert.equal(url.origin,production);
    const css=await request(production,url.pathname+url.search);
    assert.match(css.headers.get('content-type')||'',/text\/css/i);assert.ok((await css.text()).length>100);
  }
  const logo=await request(production,'/powercoders-logo.svg');
  assert.match(logo.headers.get('content-type')||'',/image\/svg\+xml/i);assert.match(await logo.text(),/<svg\b/);
  for(const path of ['/.env.local','/data/market-radar.sqlite','/AGENTS.md','/srv.txt']){
    const missing=await request(production,path,{status:404});await missing.arrayBuffer();
  }
  report.checks.push({name:phase,status:'passed',html:200,cssAssets:styles.length,logo:200,privatePaths:404});
  report.status='passed';
} catch(error) {
  report.status='failed';
  // Assertion details may contain full data. The report records only phase and
  // error identity, never cookies, credentials, response bodies or full diffs.
  report.failure={phase,name:error?.name||'Error',code:error?.code||null};
  console.error(`Production check failed during: ${phase} (${report.failure.name}${report.failure.code?`, ${report.failure.code}`:''}).`);
  process.exitCode=1;
} finally {
  writeFileSync(reportFile,JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.status,production,checks:report.checks.length,queries:report.queries.length,report:reportFile}));
}
