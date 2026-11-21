import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnalystRunner,type ModelProvider,type ModelRequest,type ModelResponse} from '../src/lib/analyst';
import {getCatalog,queryMetrics,compareMetrics} from '../src/lib/analytics';
import {getDataInventory} from '../src/lib/data-inventory';
import {ConversationStore} from '../src/lib/conversations';
import type {AnalyticsResult,AnalystAnswer,CatalogItem,ChatEvent,QueryInput,ViewType} from '../src/lib/contracts';

const SESSION='d'.repeat(64);
const catalog=getCatalog();
const inventory=getDataInventory();
const sources=inventory.sources;
const scenarios=sources.map(source=>{
  const item=catalog.find(item=>item.id===source.sampleSeriesIds[0])!;
  const occupations=item.metric==='occupation_share_of_ict_oja';
  const mode=occupations?'ranking':item.observations===1?'snapshot':'history';
  const view:ViewType=occupations?'bar':mode==='snapshot'?'metric_cards':source.id.includes('oja3')||source.domain==='regional'?'table':'line';
  return {source,item,occupations,mode,view} as const;
});
function tool(name:string,args:unknown):ModelResponse {
  return {output:[{type:'function_call',call_id:'coverage_call',name,arguments:JSON.stringify(args)}],status:'completed',outputTokens:50};
}
function final(answer:AnalystAnswer):ModelResponse {
  return {output:[],output_text:JSON.stringify(answer),status:'completed',outputTokens:100};
}
function outputs(request:ModelRequest):any[] {
  return request.input.filter((item:any)=>item?.type==='function_call_output').map((item:any)=>JSON.parse(item.output));
}
function activeQuery(request:ModelRequest):QueryInput {
  const state=request.input.find((item:any)=>item?.role==='developer'&&typeof item.content==='string'&&item.content.startsWith('Application state:\n')) as {content:string};
  assert.ok(state,'The current manual or restored scope must reach the analyst');
  return JSON.parse(state.content.slice('Application state:\n'.length)).activeQuery;
}
function answerFor(result:AnalyticsResult,view:ViewType):AnalystAnswer {
  const series=result.series[0],latest=[...series.points].reverse().find(point=>point.value!==null)!;
  return {
    summary:'The selected source has a published observation for this indicator.',
    findings:[{text:`The reported value is ${latest.value} ${series.unit} for the period ending ${latest.end}.`,resultIds:[result.id],evidenceIds:[]}],
    limitations:result.limitations.slice(0,3),actions:[],
    views:[{resultId:result.id,type:view,title:'Published source evidence'}],clarification:null,
  };
}
function emittedResults(events:ChatEvent[]):AnalyticsResult[] {
  return events.filter((event):event is Extract<ChatEvent,{type:'result'}>=>event.type==='result').map(event=>event.result);
}

test('analyst source coverage matrix matches all approved datasets and all supported view types',()=>{
  assert.equal(sources.length,10);
  assert.deepEqual(new Set(sources.map(source=>source.id)),new Set(catalog.map(item=>item.sourceId)));
  assert.ok(sources.every(source=>source.sampleSeriesIds.length>0));
  assert.deepEqual(new Set(scenarios.map(scenario=>scenario.view)),new Set(['line','bar','table','metric_cards']));
});

for(const {source,item,occupations,mode,view} of scenarios) {
  test(`AI tool discovery, computation and cited view: ${source.id}`,async()=>{
    const input:QueryInput={seriesIds:occupations?[]:[item.id],sourceId:source.id,topic:item.topic,geography:item.geography,
      measure:'reported',mode,...(mode==='history'?{start:'2025-01-01'}:{})};
    const expected=queryMetrics(input);
    assert.equal(expected.status,'ok');
    assert.ok(expected.allowedViews.includes(view));
    const store=new ConversationStore(':memory:'),events:ChatEvent[]=[];
    const percentageOnly=item.unit==='percent';
    let round=0;
    const provider:ModelProvider={async create(request){
      round++;
      if(round===1)return tool('get_capabilities',{sourceId:source.id,geography:item.geography,ids:[item.id],limit:20});
      if(round===2){
        const discovered=outputs(request).at(-1);
        assert.equal(discovered.total,1);
        assert.equal(discovered.items[0].id,item.id);
        assert.equal(discovered.items[0].sourceId,source.id);
        assert.equal(discovered.items[0].topic,item.topic);
        return tool('query_metrics',percentageOnly?{...input,measure:'count'}:input);
      }
      if(percentageOnly&&round===3){
        assert.equal(outputs(request).at(-1).error,'UNSUPPORTED_MEASURE');
        assert.equal(emittedResults(events).length,0,'Rejected percentage-to-count conversion must not create a result');
        return tool('query_metrics',input);
      }
      const computed=outputs(request).at(-1);
      assert.equal(computed.id,expected.id);
      assert.deepEqual(computed.sources,expected.sources);
      assert.deepEqual(computed.changes,expected.changes);
      assert.equal(computed.sources[0].id,source.id);
      for(const series of computed.series){
        const original=expected.series.find(candidate=>candidate.id===series.id)!;
        assert.equal(series.sourceId,source.id);
        assert.equal(series.unit,original.unit);
        assert.deepEqual(series.points,original.points.map(({observationIds:_ids,...point})=>point));
        if(source.id.startsWith('eurostat_'))assert.ok(series.points.every((point:{count:number|null})=>point.count===null),'Eurostat percentages do not acquire invented vacancy counts');
      }
      return final(answerFor(expected,view));
    }};
    try{
      const answer=await createAnalystRunner({provider,store})(SESSION,`Explore the available data from ${source.publisher}.`,null,event=>events.push(event));
      assert.equal(round,percentageOnly?4:3);
      assert.equal(answer.views[0].type,view);
      assert.equal(answer.views[0].resultId,expected.id);
      assert.deepEqual(answer.findings[0].resultIds,[expected.id]);
      const saved=store.getResults(SESSION,[expected.id]);
      assert.equal(saved.length,1);
      assert.deepEqual(saved[0].series,expected.series);
      assert.deepEqual(saved[0].query,expected.query);
      assert.ok(saved[0].sources.every(reference=>reference.id===source.id&&reference.url.startsWith('https://')));
      assert.deepEqual(store.getScope(SESSION),expected.query);
      assert.ok(emittedResults(events).length>0);
      for(const result of emittedResults(events)){
        assert.deepEqual(result.series,expected.series,'The client receives exact engine values and observation IDs');
        assert.deepEqual(result.sources,expected.sources);
        assert.ok(result.allowedViews.includes(view));
      }
      assert.equal(events.filter(event=>event.type==='answer').length,1);
    }finally{store.close();}
  });
}

test('incompatible cross-source comparison is rejected and the analyst can recover with separate cited views',async()=>{
  const python='itboard_monitor_python_open_ads',bfs='fso_jobstat_ch_vacancies_div_62_63';
  const store=new ConversationStore(':memory:'),events:ChatEvent[]=[];let round=0;
  const provider:ModelProvider={async create(request){
    round++;
    if(round===1)return tool('get_capabilities',{ids:[python,bfs],geography:'CH'});
    if(round===2){assert.equal(outputs(request).at(-1).total,2);return tool('compare_metrics',{seriesIds:[python,bfs],geography:'CH'});}
    if(round===3){
      assert.equal(outputs(request).at(-1).error,'INCOMPARABLE_SERIES');
      assert.equal(emittedResults(events).length,0);
      return tool('query_metrics',{seriesIds:[python],geography:'CH',measure:'count',mode:'snapshot'});
    }
    if(round===4)return tool('query_metrics',{seriesIds:[bfs],geography:'CH',measure:'reported',mode:'snapshot'});
    const results=outputs(request).filter(output=>output.id) as AnalyticsResult[];
    assert.equal(results.length,2);
    assert.notEqual(results[0].sources[0].id,results[1].sources[0].id);
    return final({summary:'The sources describe different populations and are shown separately.',
      findings:results.map(result=>({text:'This view retains its own source, period and definition.',resultIds:[result.id],evidenceIds:[]})),
      limitations:['Do not add the platform sample and the industry vacancy estimate.'],actions:[],clarification:null,
      views:results.map(result=>({resultId:result.id,type:'metric_cards',title:'Separate source context'}))});
  }};
  try{
    const answer=await createAnalystRunner({provider,store})(SESSION,'Compare Python listings with BFS vacancies.',null,event=>events.push(event));
    assert.equal(round,5);
    assert.equal(answer.views.length,2);
    assert.equal(store.getResults(SESSION).length,2);
    assert.ok(emittedResults(events).every(result=>result.sources.length===1));
  }finally{store.close();}
});

test('manual Eurostat scope and dates survive a comparison, canonical topic migration and a follow-up view change',async()=>{
  const sourceId='eurostat_isoc_sk_oja2_ch_20261116';
  const first='eurostat_ch_isoc_sk_oja2_oc251',second='eurostat_ch_isoc_sk_oja2_oc351';
  const legacyManual:QueryInput={seriesIds:[first],sourceId,topic:'context',geography:'CH',measure:'reported',mode:'history',start:'2025-01-01',end:'2026-09-30'};
  const compared=compareMetrics({...legacyManual,seriesIds:[first,second]});
  const store=new ConversationStore(':memory:'),events:ChatEvent[]=[];let round=0;
  const provider:ModelProvider={async create(request){
    round++;
    if(round===1){
      const manual=activeQuery(request);
      assert.equal(manual.sourceId,sourceId);assert.equal(manual.geography,'CH');
      assert.equal(manual.start,legacyManual.start);assert.equal(manual.end,legacyManual.end);
      assert.deepEqual(manual.seriesIds,[first]);
      return tool('get_capabilities',{sourceId,topic:'roles',geography:'CH',ids:[first,second]});
    }
    if(round===2){
      const capabilities=outputs(request).at(-1);
      assert.equal(capabilities.total,2);
      assert.ok(capabilities.items.every((item:CatalogItem)=>item.topic==='roles'));
      return tool('compare_metrics',{...legacyManual,seriesIds:[first,second]});
    }
    if(round===3){
      const result=outputs(request).at(-1);
      assert.equal(result.query.topic,'roles');assert.equal(result.query.start,legacyManual.start);assert.equal(result.query.end,legacyManual.end);
      assert.deepEqual(result.changes,compared.changes);
      return final(answerFor(compared,'line'));
    }
    if(round===4){
      const restored=activeQuery(request);
      assert.deepEqual(restored,compared.query,'A follow-up receives the canonical successful comparison, including its dates');
      return tool('query_metrics',restored);
    }
    assert.equal(round,5);
    assert.equal(outputs(request).at(-1).id,compared.id);
    return final(answerFor(compared,'table'));
  }};
  try{
    const run=createAnalystRunner({provider,store});
    const firstAnswer=await run(SESSION,'Compare this occupational group with ICT technicians.',legacyManual,event=>events.push(event));
    assert.equal(firstAnswer.views[0].resultId,compared.id);
    assert.deepEqual(store.getScope(SESSION),compared.query);
    const followup=await run(SESSION,'Show the same comparison as a table.',null,event=>events.push(event));
    assert.equal(followup.views[0].type,'table');assert.equal(followup.views[0].resultId,compared.id);
    assert.equal(store.getTurns(SESSION).length,4);
    assert.deepEqual(store.getScope(SESSION),compared.query);
  }finally{store.close();}
});

test('the analyst cannot turn a participant snapshot into an unsupported line view even with a valid result citation',async()=>{
  const input:QueryInput={seriesIds:['sem_asyl_ch_f_employment_rate_18_64'],mode:'snapshot',measure:'reported',geography:'CH'};
  const result=queryMetrics(input),store=new ConversationStore(':memory:'),events:ChatEvent[]=[];
  assert.ok(!result.allowedViews.includes('line'));
  let round=0;
  const provider:ModelProvider={async create(request){
    round++;
    if(round===1)return tool('query_metrics',input);
    if(round===3)assert.deepEqual(request.tools,[],'A bounded repair cannot run additional tools');
    return final(answerFor(result,'line'));
  }};
  try{
    await assert.rejects(createAnalystRunner({provider,store})(SESSION,'Show this employment snapshot.',null,event=>events.push(event)),{code:'UNSUPPORTED_VIEW'});
    assert.equal(round,3);
    assert.equal(events.filter(event=>event.type==='answer').length,0);
    assert.ok(emittedResults(events).every(event=>!event.allowedViews.includes('line')));
    assert.equal(store.getResults(SESSION).length,1,'The valid numerical evidence remains available after answer rejection');
  }finally{store.close();}
});
