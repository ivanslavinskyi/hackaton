import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnalystRunner, validateAnalystAnswer, analystTools, type ModelProvider, type ModelResponse, type ModelRequest } from '../src/lib/analyst';
import { ConversationStore } from '../src/lib/conversations';
import { queryMetrics } from '../src/lib/analytics';
import { getDataInventory } from '../src/lib/data-inventory';
import type { AnalystAnswer, ChatEvent } from '../src/lib/contracts';

const SESSION = 'c'.repeat(64);
const comparison = { seriesIds: ['itboard_monitor_python_open_ads', 'itboard_monitor_docker_open_ads'], mode: 'history' as const, measure: 'share' as const, geography: 'CH', start: '2026-10-01', end: '2026-11-15' };
const emptyAnswer = (): AnalystAnswer => ({ summary: 'The requested combination is not available in the verified data.', findings: [], limitations: ['Role and skill marginals cannot be cross-joined.'], actions: [], views: [], clarification: null });
function final(answer: AnalystAnswer): ModelResponse { return { output: [], output_text: JSON.stringify(answer), status: 'completed', outputTokens: 100 }; }
function tool(name: string, args: unknown, id = 'call_1'): ModelResponse {
  return { output: [{ type: 'function_call', call_id: id, name, arguments: JSON.stringify(args) }], status: 'completed', outputTokens: 60 };
}
function outputFor(request: ModelRequest) {
  return request.input.filter((item): item is {type:string;output:string} => !!item && typeof item === 'object' && (item as {type?:string}).type === 'function_call_output').map(item => JSON.parse(item.output));
}

test('real deterministic result goes through the tool loop and only referenced backend chart data is emitted', async () => {
  const store = new ConversationStore(':memory:');
  const events: ChatEvent[] = [];
  let rounds = 0;
  const provider: ModelProvider = { async create(request) {
    rounds++;
    assert.equal(request.store, false);
    assert.equal(request.parallel_tool_calls, false);
    if (rounds === 1) return tool('compare_metrics', comparison);
    const result = outputFor(request).at(-1);
    assert.equal(result.series[0].points.at(-1).count, 188);
    assert.equal(result.series[1].points.at(-1).count, 123);
    return final({ ...emptyAnswer(), summary: 'Python gained share while Docker lost share in this platform sample.',
      findings: [{ text: 'Counts and shares differ when the sample size changes.', resultIds: [result.id], evidenceIds: [] }],
      views: [{ resultId: result.id, type: 'line', title: 'Python and Docker' }] });
  } };
  try {
    const answer = await createAnalystRunner({ provider, store })(SESSION, 'Compare Python with Docker', null, event => events.push(event));
    assert.equal(rounds, 2);
    assert.equal(store.getTurns(SESSION).length, 2);
    assert.deepEqual(store.getScope(SESSION)?.seriesIds, comparison.seriesIds);
    assert.equal(events.at(-1)?.type, 'answer');
    const chart = events.find(event => event.type === 'result');
    assert.ok(chart?.type === 'result');
    assert.equal(chart.result.id, answer.views[0].resultId);
  } finally { store.close(); }
});

test('invalid tool parameters never become applied filters and produce a recoverable model-visible error', async () => {
  const store = new ConversationStore(':memory:');
  const initial = queryMetrics(comparison);
  store.ensureSession(SESSION); store.setScope(SESSION, initial.query);
  let rounds = 0;
  const provider: ModelProvider = { async create(request) {
    if (++rounds === 1) return tool('query_metrics', { ...comparison, seniority: 'junior', sql: 'SELECT * FROM observations' });
    assert.equal(outputFor(request).at(-1).error, 'INVALID_TOOL_ARGUMENTS');
    return final(emptyAnswer());
  } };
  try {
    await createAnalystRunner({ provider, store })(SESSION, 'And for junior Python developers?', null, () => {});
    assert.deepEqual(store.getScope(SESSION), initial.query);
    assert.equal(store.getResults(SESSION).length, 0);
  } finally { store.close(); }
});

test('no more than six tool calls execute even if a response requests more', async () => {
  const store = new ConversationStore(':memory:');
  let rounds = 0;
  const provider: ModelProvider = { async create(request) {
    if (++rounds === 1) return { output: Array.from({ length: 9 }, (_, i) => ({ type: 'function_call', call_id: `c${i}`, name: 'get_capabilities', arguments: '{}' })), status: 'completed' };
    const outputs = outputFor(request);
    assert.equal(outputs.filter(output => output.error === 'TOOL_BUDGET').length, 3);
    assert.deepEqual(request.tools, []);
    return final(emptyAnswer());
  } };
  try {
    await createAnalystRunner({ provider, store })(SESSION, 'What data do we have?', null, () => {});
    assert.equal(rounds, 2);
  } finally { store.close(); }
});

test('unknown citations, model-made links and unsupported charts cannot pass final validation', () => {
  const result = queryMetrics(comparison);
  const results = new Map([[result.id, result]]);
  assert.throws(() => validateAnalystAnswer({ ...emptyAnswer(), findings: [{ text: 'Invented fact', resultIds: ['fake-result'], evidenceIds: [] }] }, results, new Map()), /unverified result/);
  assert.throws(() => validateAnalystAnswer({ ...emptyAnswer(), actions: ['Visit https://unverified.example'] }, results, new Map()), /unchecked link/);
  assert.throws(() => validateAnalystAnswer({ ...emptyAnswer(), views: [{ resultId: 'fake-result', type: 'line', title: 'Invented chart' }] }, results, new Map()), /unsupported chart/);
});

test('a valid citation cannot launder a fabricated number, an uncited number, or an unsupported date', () => {
  const result = queryMetrics(comparison);
  const results = new Map([[result.id, result]]);
  const cited = (text: string): AnalystAnswer => ({ ...emptyAnswer(), findings: [{ text, resultIds: [result.id], evidenceIds: [] }] });
  assert.throws(() => validateAnalystAnswer(cited('Switzerland has999999999Pythonvacancies.'), results, new Map()), { code: 'UNSUPPORTED_NUMBER' });
  assert.throws(() => validateAnalystAnswer({ ...cited('Python is represented in this sample.'), summary: 'Python appears in 999,999,999 vacancies.' }, results, new Map()), { code: 'UNSUPPORTED_NUMBER' });
  assert.throws(() => validateAnalystAnswer({ ...emptyAnswer(), findings: [{ text: 'Python has 188 listings.', resultIds: [], evidenceIds: [] }] }, results, new Map()), { code: 'UNSUPPORTED_NUMBER' });
  assert.throws(() => validateAnalystAnswer(cited('The observation is from 2026-11-29.'), results, new Map()), { code: 'UNSUPPORTED_NUMBER' });
});

test('grounding accepts actual counts, rounded shares, decimal commas and dates from the cited result', () => {
  const result = queryMetrics(comparison);
  const answer: AnalystAnswer = {
    ...emptyAnswer(), summary: 'Python rose from 19.76% to 24.42% between 29 October and 15 November 2026.',
    findings: [{ text: 'On 2026-10-29 and 2026-11-15, Python had 115 and 188 listings, or 19,76% and 24,42% of samples of 582 and 770.', resultIds: [result.id], evidenceIds: [] }],
  };
  assert.deepEqual(validateAnalystAnswer(answer, new Map([[result.id, result]]), new Map()), answer);
});

test('catalog-only numbers require actual capability metadata and cannot borrow arbitrary result values', () => {
  const answer = { ...emptyAnswer(), summary: 'This selection has 168 series.', findings: [{ text: 'The catalogue contains 168 series.', resultIds: [], evidenceIds: [] }] };
  assert.deepEqual(validateAnalystAnswer(answer, new Map(), new Map(), { numbers: [168], texts: [] }), answer);
  assert.throws(() => validateAnalystAnswer(answer, new Map(), new Map(), { numbers: [167], texts: [] }), { code: 'UNSUPPORTED_NUMBER' });
});

test('quarter labels are grounded in observation periods, without accepting other quarters',()=>{
  const result=queryMetrics({seriesIds:['fso_jobstat_ch_vacancies_div_62_63'],mode:'snapshot'});
  const answer={...emptyAnswer(),summary:'In Q2 2026, BFS reported 3,920 estimated vacancies.',findings:[{text:'In Q2 2026, BFS reported 3,920 estimated vacancies.',resultIds:[result.id],evidenceIds:[]}]};
  assert.doesNotThrow(()=>validateAnalystAnswer(answer,new Map([[result.id,result]]),new Map()));
  assert.throws(()=>validateAnalystAnswer({...answer,summary:'In Q4 2026, BFS reported 3,920 vacancies.'},new Map([[result.id,result]]),new Map()),{code:'UNSUPPORTED_NUMBER'});
});

test('numeric source qualifications are grounded only in the cited result, not arbitrary or uncited figures',()=>{
  const result=queryMetrics({seriesIds:['seco_registered_vacancies_ch'],mode:'snapshot',measure:'reported'});
  assert.ok(result.limitations.some(text=>text.includes('October 2026 includes 154')));
  const known=new Map([[result.id,result]]);
  const text='The published total includes 154 near-border foreign vacancies.';
  const answer={...emptyAnswer(),summary:'SECO reports 40,462 registered vacancies at the end of October 2026.',findings:[{text,resultIds:[result.id],evidenceIds:[]}]};
  assert.doesNotThrow(()=>validateAnalystAnswer(answer,known,new Map()));
  assert.throws(()=>validateAnalystAnswer({...answer,findings:[{text:text.replace('154','155'),resultIds:[result.id],evidenceIds:[]}]},known,new Map()),{code:'UNSUPPORTED_NUMBER'});
  assert.throws(()=>validateAnalystAnswer({...emptyAnswer(),summary:text,findings:[{text,resultIds:[],evidenceIds:[]}]},known,new Map()),{code:'UNSUPPORTED_NUMBER'});
  const pythonResult=queryMetrics({seriesIds:[comparison.seriesIds[0]],mode:'snapshot',measure:'count'});
  const both=new Map([[result.id,result],[pythonResult.id,pythonResult]]);
  assert.throws(()=>validateAnalystAnswer({...emptyAnswer(),findings:[{text,resultIds:[pythonResult.id],evidenceIds:[]}]},both,new Map()),{code:'UNSUPPORTED_NUMBER'});
});

test('one invalid draft can be repaired within the same bounded turn and never emitted as an answer',async()=>{
  const store=new ConversationStore(':memory:');let round=0;const events:ChatEvent[]=[];
  const provider:ModelProvider={async create(request){
    if(++round===1)return tool('query_metrics',comparison);
    const result=outputFor(request)[0];
    if(round===2)return final({...emptyAnswer(),summary:'There are 999999999 listings.',findings:[{text:'There are 999999999 listings.',resultIds:[result.id],evidenceIds:[]}]});
    assert.deepEqual(request.tools,[]);
    return final({...emptyAnswer(),summary:'Python is present in this platform sample.',views:[{resultId:result.id,type:'line',title:'Python and Docker'}]});
  }};
  try{const answer=await createAnalystRunner({provider,store})(SESSION,'Compare these skills',null,e=>events.push(e));assert.equal(round,3);assert.equal(events.filter(e=>e.type==='answer').length,1);assert.ok(!answer.summary.includes('999'));}finally{store.close();}
});

test('whole-dataset inventory reaches the analyst with grounded coverage counts and real source IDs',async()=>{
  const store=new ConversationStore(':memory:');let rounds=0;
  const provider:ModelProvider={async create(request){
    if(++rounds===1)return tool('get_data_inventory',{});
    const inventory=outputFor(request).at(-1);
    assert.equal(inventory.counts.observations,getDataInventory().counts.observations);
    for(const family of ['itboard','eurostat','fso','seco','sem'])assert.ok(inventory.sources.some((s:{id:string})=>s.id.includes(family)));
    return final({...emptyAnswer(),summary:`The frozen dataset has ${inventory.counts.observations} observations across ${inventory.counts.sources} source datasets.`,limitations:inventory.limitations.slice(0,2)});
  }};
  try{const answer=await createAnalystRunner({provider,store})(SESSION,'What data do we have beyond ITBoard?',null,()=>{});assert.match(answer.summary,/source datasets/);assert.equal(rounds,2);}finally{store.close();}
});

test('official sources can be researched as separate views without merging their populations',async()=>{
  const store=new ConversationStore(':memory:');let round=0;
  const provider:ModelProvider={async create(request){
    round++;
    if(round===1)return tool('get_capabilities',{sourceId:'fso_jobstat_vacancies_2026q2',geography:'CH',limit:20});
    if(round===2){assert.ok(outputFor(request).at(-1).items.every((s:{sourceId:string})=>s.sourceId==='fso_jobstat_vacancies_2026q2'));return tool('query_metrics',{seriesIds:['fso_jobstat_ch_vacancies_div_62_63'],measure:'reported',geography:'CH'});}
    if(round===3)return tool('query_metrics',{seriesIds:['eurostat_ch_isoc_sk_oja1_ict'],measure:'reported',geography:'CH'});
    const results=outputFor(request).filter((o:{id?:string})=>o.id);
    assert.equal(results.length,2);assert.notEqual(results[0].sources[0].id,results[1].sources[0].id);
    return final({...emptyAnswer(),summary:'These sources provide complementary views with different populations.',findings:results.map((r:{id:string;title:string})=>({text:r.title,resultIds:[r.id],evidenceIds:[]})),views:results.map((r:{id:string;title:string})=>({resultId:r.id,title:r.title,type:'line' as const}))});
  }};
  try{const answer=await createAnalystRunner({provider,store})(SESSION,'Show BFS and Eurostat separately.',null,()=>{});assert.equal(answer.views.length,2);}finally{store.close();}
});

test('a stalled provider times out, records a safe failure and releases the session lock', async () => {
  const store = new ConversationStore(':memory:');
  const provider: ModelProvider = { create: () => new Promise(() => {}) };
  // Keep the process alive while AbortSignal.timeout (an unref timer) is being exercised.
  const timer = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(createAnalystRunner({ provider, store, timeoutMs: 20 })(SESSION, 'What data do we have?', null, () => {}), { code: 'ANALYST_TIMEOUT' });
    assert.equal(store.getTurns(SESSION).at(-1)?.error, 'ANALYST_TIMEOUT');
    const token = store.acquireLock(SESSION); store.releaseLock(SESSION, token);
  } finally { clearTimeout(timer); store.close(); }
});

test('twentieth follow-up can restore the first comparison from exact saved context', async () => {
  const store = new ConversationStore(':memory:');
  store.ensureSession(SESSION);
  const original = queryMetrics(comparison);
  const first = store.appendTurn(SESSION, 'user', 'Our original national Python and Docker comparison');
  store.putResult(SESSION, original);
  const firstAnswer = store.appendTurn(SESSION, 'assistant', 'Original comparison ready', { resultIds: [original.id] });
  for (let i = 1; i <= 19; i++) {
    store.appendTurn(SESSION, 'user', `Unrelated clarification ${i}`);
    store.appendTurn(SESSION, 'assistant', `Explanation ${i}`);
  }
  let rounds = 0;
  const provider: ModelProvider = { async create(request) {
    if (++rounds === 1) {
      assert.ok(JSON.stringify(request.input).includes(String(first.id)));
      return tool('get_conversation_context', { turnIds: [first.id, firstAnswer.id] });
    }
    const recalled = outputFor(request).at(-1);
    assert.equal(recalled.results[0].id, original.id);
    assert.equal(recalled.results[0].query.start, '2026-10-01');
    return final({ ...emptyAnswer(), summary: 'Restored the original national comparison.',
      findings: [{ text: 'These are the original observations and dates.', resultIds: [original.id], evidenceIds: [] }],
      views: [{ resultId: original.id, type: 'line', title: 'Original Python and Docker comparison' }] });
  } };
  try {
    const answer = await createAnalystRunner({ provider, store })(SESSION, 'Return to our first national comparison.', null, () => {});
    assert.equal(store.getTurns(SESSION).filter(turn => turn.role === 'user').length, 21);
    assert.equal(answer.views[0].resultId, original.id);
    assert.deepEqual(store.getScope(SESSION), original.query);
  } finally { store.close(); }
});

test('all model tools use strict closed object schemas with nullable optional parameters', () => {
  for (const definition of analystTools) {
    assert.equal(definition.strict, true);
    assert.equal(definition.parameters.additionalProperties, false);
    assert.deepEqual(new Set(definition.parameters.required as string[]), new Set(Object.keys(definition.parameters.properties as object)));
  }
});
