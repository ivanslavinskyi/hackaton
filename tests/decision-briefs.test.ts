import test from 'node:test';
import assert from 'node:assert/strict';
import {getDecisionBrief,validateDecisionScope} from '../src/lib/decision-briefs';
import {getDecisionOptions,parseDecisionSearch,decisionHref,PARTICIPANT_GROUPS,type DecisionScope} from '../src/lib/decision-contracts';
import {getCatalog,queryMetrics} from '../src/lib/analytics';
import {ConversationStore} from '../src/lib/conversations';
import {createAnalystRunner,type ModelProvider,type ModelRequest} from '../src/lib/analyst';
import type {ChatEvent} from '../src/lib/contracts';

const options=getDecisionOptions(getCatalog()),session='d'.repeat(64);
test('every published role keeps junior, skill and industry panels independent and exactly reproducible',()=>{
  assert.equal(options.roles.length,35);
  const baseline=getDecisionBrief({kind:'opportunities'});
  for(const role of options.roles){
    const brief=getDecisionBrief({kind:'opportunities',role:role.id});
    assert.equal(brief.panels.length,4);assert.deepEqual(brief.panels[0].result.query.seriesIds,[role.id]);
    assert.deepEqual(brief.panels.slice(1).map(panel=>panel.result.id),baseline.panels.slice(1).map(panel=>panel.result.id));
    for(const panel of brief.panels){assert.equal(panel.result.status,'ok');assert.equal(panel.result.id,queryMetrics(panel.result.query).id);assert.ok(panel.result.allowedViews.includes(panel.view));assert.ok(panel.result.sources.every(source=>source.url.startsWith('https://')));}
  }
  assert.match(getDecisionBrief({kind:'opportunities',role:'itboard_csv_rolle_data-analyst'}).panels[0].note||'',/Small counts/);
  assert.match(getDecisionBrief({kind:'opportunities',role:'itboard_csv_rolle_scrum-master'}).panels[0].note||'',/Sparse/);
});
test('all SEM groups and geographies preserve separate population, numerator and denominator',()=>{
  assert.equal(options.geographies.length,27);
  for(const geography of options.geographies){
    const brief=getDecisionBrief({kind:'participants',geography});assert.equal(brief.panels.length,9);
    for(const group of Object.keys(PARTICIPANT_GROUPS) as (keyof typeof PARTICIPANT_GROUPS)[]){
      const panels=brief.panels.filter(panel=>panel.group===group);
      const value=(metric:string)=>panels.find(panel=>panel.metric===metric)!.result.series[0].points[0];
      const population=value('population'),employed=value('employed'),rate=value('rate');
      assert.equal(rate.end,'2026-10-31');assert.equal(rate.denominator,population.value);assert.equal(rate.count,employed.value);
      if(population.value&&rate.value!==null)assert.ok(Math.abs(rate.value-employed.value!/population.value*100)<0.011);
      for(const panel of panels){assert.equal(panel.result.sources.length,1);assert.equal(panel.result.sources[0].id,PARTICIPANT_GROUPS[group].sourceId);assert.equal(panel.result.query.geography,geography);assert.equal(panel.result.query.mode,'snapshot');assert.equal(panel.result.changes.length,0);assert.deepEqual(panel.result.series,queryMetrics(panel.result.query).series);}
      const single=getDecisionBrief({kind:'participants',geography,group});assert.deepEqual(single.panels.map(panel=>panel.result.id),panels.map(panel=>panel.result.id));
    }
  }
});
test('decision links and backend reject unknown dimensions and unavailable cross-tabs',()=>{
  for(const input of [{kind:'participants',role:'python'},{kind:'participants',geography:'itboard:region:zuerich'},{kind:'opportunities',group:'f'},{kind:'opportunities',geography:'CH-ZH'},{kind:'opportunities',role:'itboard_monitor_python_open_ads'},{kind:'participants',origin:'Ukraine'}])assert.throws(()=>validateDecisionScope(input as DecisionScope));
  for(const search of ['group=f&group=s','kind=opportunities','origin=Ukraine','start=2026-01-01'])assert.throws(()=>parseDecisionSearch('participants',search));
  const scope:DecisionScope={kind:'participants',group:'s',geography:'CH-BE'};assert.deepEqual(parseDecisionSearch('participants',new URL(decisionHref(scope),'https://example.test').search),scope);
});
function state(request:ModelRequest){return JSON.parse((request.input[0] as {content:string}).content.split('Application state:\n')[1]);}
test('AI retrieves the exact participant brief, inherits group on canton follow-up and preserves it across twenty questions',async()=>{
  const store=new ConversationStore(':memory:');let round=0,turn=0;
  const provider:ModelProvider={async create(request){
    round++;const active=state(request).decisionScope;
    if(round%2===1){turn++;assert.equal(active.group,'f');assert.equal(active.geography,turn<3?'CH-ZH':'CH-BE');
      return {status:'completed',output:[{type:'function_call',call_id:'brief_'+round,name:'get_decision_brief',arguments:JSON.stringify({...active,geography:turn===1?'CH-ZH':'CH-BE'})}]};}
    const outputs=request.input.filter((item):item is {type:string;output:string}=>!!item&&typeof item==='object'&&(item as {type?:string}).type==='function_call_output');
    const brief=JSON.parse(outputs.at(-1)!.output),rate=brief.panels.find((panel:{metric:string})=>panel.metric==='rate').result;
    assert.equal(brief.panels.length,3);assert.equal(rate.id,getDecisionBrief(brief.scope).panels.find(panel=>panel.metric==='rate')!.result.id);
    return {status:'completed',output:[],output_text:JSON.stringify({summary:'The selected population has its own published employment context.',findings:[{text:'The source measures registered employment across sectors, not programme placements.',resultIds:[rate.id],evidenceIds:[]}],limitations:[],actions:[],views:[{resultId:rate.id,type:'metric_cards',title:'Selected population context'}],clarification:null})};
  }};
  const events:ChatEvent[]=[],run=createAnalystRunner({store,provider});
  try{
    for(let index=0;index<21;index++)await run(session,index===0?'Explain this context.':index===1?'What about Bern?':'Explain the limitations.',null,event=>events.push(event),undefined,index===0?{kind:'participants',group:'f',geography:'CH-ZH'}:undefined);
    assert.equal(store.getTurns(session).filter(turn=>turn.role==='user').length,21);
    assert.deepEqual(store.getBriefScope(session),{kind:'participants',group:'f',geography:'CH-BE'});
    assert.equal(events.filter(event=>event.type==='brief').length,21);
    await assert.rejects(run(session,'Invalid chart context',{seriesIds:['missing-series']},()=>{},undefined,{kind:'participants',group:'s',geography:'CH'}));
    assert.deepEqual(store.getBriefScope(session),{kind:'participants',group:'f',geography:'CH-BE'},'Invalid chart context must not partially apply a new brief');
    store.ensureSession('e'.repeat(64));assert.equal(store.getBriefScope('e'.repeat(64)),null);
    store.setBriefScope(session,null);assert.equal(store.getBriefScope(session),null);
  }finally{store.close();}
});
