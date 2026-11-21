import fs from 'node:fs';
import assert from 'node:assert/strict';
const base = process.env.MARKET_RADAR_TEST_URL || 'http://127.0.0.1:3000';
const path = `.runtime/live-ai-check-${new URL(base).port}.json`;
fs.mkdirSync('.runtime', {recursive:true});
const state = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path,'utf8')) : {cookie:'',checks:[]};
const message = process.argv[2] || 'How has Python changed in the available data? Show the last two snapshots, counts and share.';
const response = await fetch(base+'/api/analyst', {
  method:'POST', headers:{'content-type':'application/json',origin:base,...(state.cookie?{cookie:state.cookie}:{})},
  body:JSON.stringify({message,context:null}), signal:AbortSignal.timeout(65000)
});
const cookie = response.headers.get('set-cookie');
if(cookie) state.cookie=cookie.split(';')[0];
console.log('HTTP',response.status);
const events=[];
for (const line of (await response.text()).trim().split('\n')) {
  const event=JSON.parse(line);events.push(event);
  if(event.type==='result') console.log(JSON.stringify({type:'result',id:event.result.id,query:event.result.query,series:event.result.series.map(s=>({label:s.label,latest:s.points.at(-1)}))}));
  else console.log(JSON.stringify(event));
}
state.checks.push({message,events});fs.writeFileSync(path,JSON.stringify(state,null,2));
assert.equal(response.status,200);
assert.ok(events.some(e=>e.type==='answer'),'No validated answer');
