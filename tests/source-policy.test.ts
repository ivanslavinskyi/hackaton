import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {getCapabilities,getCatalog,queryMetrics} from '../src/lib/analytics';
import {getDataDb} from '../src/lib/data';
import {getDataInventory} from '../src/lib/data-inventory';
import {ConversationStore} from '../src/lib/conversations';
import {createAnalystRunner,type ModelProvider} from '../src/lib/analyst';
import {SOURCE_POLICY_VERSION,isSourceEnabled} from '../src/lib/source-policy';
import type {AnalyticsResult,AnalystAnswer,Evidence} from '../src/lib/contracts';

const SOURCE='thurgau_awa_rav_2026_10';
const SERIES=['thurgau_rav_cross','thurgau_rav_noga62','thurgau_rav_occ36'];
const SESSION='f'.repeat(64);
const REMOVED_TEXT='ARCHIVED_REMOVED_ANALYSIS_874512';
const REMOVED_EVIDENCE_TEXT='ARCHIVED_REMOVED_SOURCE_EVIDENCE_987456';

test('removed source disappears from discovery, explicit queries and ranking while archive and other canton slices remain',()=>{
  const catalog=getCatalog(),inventory=getDataInventory();
  assert.equal(isSourceEnabled(SOURCE),false);
  assert.equal(inventory.sourcePolicyVersion,SOURCE_POLICY_VERSION);
  assert.deepEqual(inventory.counts,{observations:3445,nationalObservations:2015,series:595,nationalSeries:168,sources:10});
  assert.ok(!catalog.some(item=>item.sourceId===SOURCE));
  assert.ok(!inventory.sources.some(source=>source.id===SOURCE));
  assert.equal(getCapabilities({sourceId:SOURCE,geography:'all'}).total,0);
  assert.equal(getCapabilities({ids:SERIES,geography:'all'}).total,0);
  for(const id of SERIES)assert.throws(()=>queryMetrics({seriesIds:[id],geography:'CH-TG'}),{code:'SOURCE_UNAVAILABLE'});
  assert.throws(()=>queryMetrics({sourceId:SOURCE,topic:'context',mode:'ranking',geography:'CH-TG',metric:'registered_vacancies'}),{code:'SOURCE_UNAVAILABLE'});
  const remaining=catalog.filter(item=>item.geography==='CH-TG');
  assert.equal(remaining.length,10,'SECO and SEM still have valid Thurgau canton slices');
  for(const item of remaining){
    assert.ok(item.sourceId.startsWith('sem_')||item.sourceId==='seco_2026_10');
    assert.equal(queryMetrics({seriesIds:[item.id],geography:item.geography,mode:'snapshot'}).status,'ok');
  }
  const archive=getDataDb().prepare('SELECT COUNT(*) n,COUNT(DISTINCT series_id) series FROM observations WHERE source_id=?').get(SOURCE) as {n:number;series:number};
  assert.deepEqual({...archive},{n:154,series:3},'The immutable reviewed archive is retained for provenance');
});

function seededConversation(){
  const directory=mkdtempSync(path.join(tmpdir(),'market-radar-source-policy-'));
  const filename=path.join(directory,'conversation.sqlite');
  let store=new ConversationStore(filename);
  store.ensureSession(SESSION);
  const retained=queryMetrics({seriesIds:['itboard_monitor_python_open_ads'],mode:'snapshot',measure:'count'});
  store.putResult(SESSION,retained);
  store.setScope(SESSION,retained.query,'manual');
  const retainedUser=store.appendTurn(SESSION,'user','Keep the earlier national Python question.');
  const retainedAnswer=store.appendTurn(SESSION,'assistant','Retained national Python result.',{resultIds:[retained.id]});
  store.close();
  const removed:AnalyticsResult={...retained,id:'result_aaaaaaaaaaaaaaaaaaaa',title:'Archived removed source',
    query:{...retained.query,seriesIds:[SERIES[1]],sourceId:SOURCE,topic:'context',geography:'CH-TG'},
    series:[{...retained.series[0],id:SERIES[1],sourceId:SOURCE,geography:'CH-TG',label:'Archived source',
      points:[{...retained.series[0].points[0],value:874512,count:874512}]}],
    sources:[{...retained.sources[0],id:SOURCE,title:'Archived source'}]};
  const removedEvidence:Evidence={id:`dataset_${SOURCE}`,title:'Archived source description',summary:REMOVED_EVIDENCE_TEXT,
    limitations:'Archived context',period:'2026',url:'https://example.invalid/archived-source',locator:'Saved source metadata'};
  const original:AnalystAnswer={summary:REMOVED_TEXT,findings:[{text:REMOVED_TEXT,resultIds:[removed.id],evidenceIds:[]}],
    limitations:[],actions:[],views:[{resultId:removed.id,type:'table',title:'Archived source view'}],clarification:null};
  const originalEvidence:AnalystAnswer={...original,summary:REMOVED_EVIDENCE_TEXT,
    findings:[{text:REMOVED_EVIDENCE_TEXT,resultIds:[],evidenceIds:[removedEvidence.id]}],views:[]};
  // Seed an actual older on-disk conversation, bypassing today's write policy.
  const raw=new DatabaseSync(filename),now=new Date().toISOString();
  raw.prepare('INSERT INTO conversation_results(session_id,result_id,created_at,result_json) VALUES(?,?,?,?)').run(SESSION,removed.id,Date.now(),JSON.stringify(removed));
  raw.prepare('INSERT INTO conversation_evidence(session_id,evidence_id,evidence_json) VALUES(?,?,?)').run(SESSION,removedEvidence.id,JSON.stringify(removedEvidence));
  const insert=raw.prepare('INSERT INTO turns(session_id,role,content,created_at,answer_json,result_ids_json,error) VALUES(?,?,?,?,?,?,NULL)');
  const oldAnswer=Number(insert.run(SESSION,'assistant',REMOVED_TEXT,now,JSON.stringify(original),JSON.stringify([removed.id])).lastInsertRowid);
  const oldEvidenceAnswer=Number(insert.run(SESSION,'assistant',REMOVED_EVIDENCE_TEXT,now,JSON.stringify(originalEvidence),'[]').lastInsertRowid);
  raw.prepare('UPDATE conversations SET scope_json=? WHERE id=?').run(JSON.stringify(removed.query),SESSION);
  raw.prepare('INSERT INTO scope_events(session_id,created_at,origin,scope_json) VALUES(?,?,?,?)').run(SESSION,now,'manual',JSON.stringify(removed.query));
  raw.close();store=new ConversationStore(filename);
  return {store,filename,removed,removedEvidence,retained,retainedUser,retainedAnswer,oldAnswer,oldEvidenceAnswer,
    cleanup(){store.close();assert.equal(path.dirname(directory),tmpdir());assert.ok(path.basename(directory).startsWith('market-radar-source-policy-'));rmSync(directory,{recursive:true,force:true});}};
}

test('stored removed results, source evidence and scopes are hidden without deleting unrelated or original history',()=>{
  const fixture=seededConversation(),{store}=fixture;
  try{
    assert.equal(store.getScope(SESSION),null);
    assert.deepEqual(store.getResults(SESSION,[fixture.removed.id]),[]);
    assert.deepEqual(store.getResults(SESSION).map(result=>result.id),[fixture.retained.id]);
    assert.deepEqual(store.getEvidence(SESSION),[]);
    const turns=store.getTurns(SESSION);
    assert.equal(turns.find(turn=>turn.id===fixture.retainedUser.id)?.content,fixture.retainedUser.content);
    assert.deepEqual(turns.find(turn=>turn.id===fixture.retainedAnswer.id)?.resultIds,[fixture.retained.id]);
    for(const id of [fixture.oldAnswer,fixture.oldEvidenceAnswer]){
      const turn=turns.find(turn=>turn.id===id)!;
      assert.equal(turn.error,'SOURCE_REMOVED');assert.deepEqual(turn.resultIds,[]);assert.equal(turn.answer,undefined);
    }
    const recalled=store.inspectContext(SESSION,{turnIds:[fixture.oldAnswer,fixture.oldEvidenceAnswer]});
    assert.deepEqual(recalled.results,[]);
    assert.equal(recalled.activeScope,null);
    assert.ok(recalled.scopeEvents.every(event=>event.query.sourceId!==SOURCE));
    assert.doesNotMatch(JSON.stringify(recalled),/874512|987456|thurgau_awa_rav/);
    assert.throws(()=>store.putResult(SESSION,fixture.removed),{code:'SOURCE_REMOVED'});
    assert.throws(()=>store.setScope(SESSION,fixture.removed.query),{code:'SOURCE_REMOVED'});
    assert.throws(()=>store.putEvidence(SESSION,[fixture.removedEvidence]),{code:'SOURCE_REMOVED'});
    assert.throws(()=>store.appendTurn(SESSION,'assistant','Reuse removed source',{resultIds:[fixture.removed.id]}),{code:'UNKNOWN_RESULT'});
    const raw=new DatabaseSync(fixture.filename,{readOnly:true});
    try{
      assert.equal((raw.prepare('SELECT content FROM turns WHERE id=?').get(fixture.oldAnswer) as {content:string}).content,REMOVED_TEXT);
      assert.equal((raw.prepare('SELECT COUNT(*) n FROM conversation_results WHERE result_id=?').get(fixture.removed.id) as {n:number}).n,1);
    }finally{raw.close();}
  }finally{fixture.cleanup();}
});

test('AI state and exact context recall cannot reintroduce removed source data from an old conversation',async()=>{
  const fixture=seededConversation();let round=0;
  const provider:ModelProvider={async create(request){
    round++;
    assert.doesNotMatch(JSON.stringify(request.input),/874512|987456|thurgau_awa_rav/);
    if(round===1){
      assert.match(JSON.stringify(request.input),/Retained national Python result/);
      return {output:[{type:'function_call',call_id:'old_context',name:'get_conversation_context',arguments:JSON.stringify({turnIds:[fixture.oldAnswer,fixture.oldEvidenceAnswer]})}],status:'completed',outputTokens:20};
    }
    const answer:AnalystAnswer={summary:'That earlier source is no longer available. We can explore the current catalog instead.',findings:[],limitations:[],actions:[],views:[],clarification:null};
    return {output:[],output_text:JSON.stringify(answer),status:'completed',outputTokens:60};
  }};
  try{
    await createAnalystRunner({provider,store:fixture.store})(SESSION,'Restore the earlier regional analysis.',null,()=>{});
    assert.equal(round,2);
    assert.equal(fixture.store.getTurns(SESSION).filter(turn=>turn.error==='SOURCE_REMOVED').length,2);
    assert.deepEqual(fixture.store.getResults(SESSION,[fixture.retained.id])[0].series,fixture.retained.series);
  }finally{fixture.cleanup();}
});
