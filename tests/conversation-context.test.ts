import test from 'node:test';
import assert from 'node:assert/strict';
import {ConversationStore} from '../src/lib/conversations';
import {updateConversationContext} from '../src/lib/conversation-context';
import {getDecisionBrief} from '../src/lib/decision-briefs';

const id='1'.repeat(64),other='2'.repeat(64);
test('prepared briefs and explicit chart-only context persist without an AI call and remain session-scoped',()=>{
 const store=new ConversationStore(':memory:');
 try{
  const brief=getDecisionBrief({kind:'participants',group:'s',geography:'CH-ZH'}),context=brief.panels[2].result.query;
  const saved=updateConversationContext(store,id,{brief:brief.scope,context});
  assert.deepEqual(store.getBriefScope(id),brief.scope);assert.deepEqual(store.getScope(id),context);
  assert.equal(saved.result?.id,brief.panels[2].result.id);assert.equal(store.getTurns(id).length,0);
  store.ensureSession(other);assert.equal(store.getBriefScope(other),null);
  updateConversationContext(store,id,{brief:null});assert.equal(store.getBriefScope(id),null);assert.deepEqual(store.getScope(id),context);
 }finally{store.close();}
});
test('invalid handoffs cannot partially change the saved brief or chart',()=>{
 const store=new ConversationStore(':memory:');
 try{
  const brief=getDecisionBrief({kind:'opportunities'});updateConversationContext(store,id,{brief:brief.scope,context:brief.panels[0].result.query});
  for(const input of [{brief:{kind:'participants',group:'s'},context:{seriesIds:['missing-series']}},{brief:{kind:'participants',geography:'invalid'}},{brief:null,extra:'invalid'}])assert.throws(()=>updateConversationContext(store,id,input));
  assert.deepEqual(store.getBriefScope(id),brief.scope);assert.deepEqual(store.getScope(id),brief.panels[0].result.query);
 }finally{store.close();}
});
test('active AI holds its context lock until completion',()=>{
 const store=new ConversationStore(':memory:');
 try{
  const brief=getDecisionBrief({kind:'opportunities'});updateConversationContext(store,id,{brief:brief.scope});
  const lock=store.acquireLock(id);assert.throws(()=>updateConversationContext(store,id,{brief:null}),/already running/);
  assert.deepEqual(store.getBriefScope(id),brief.scope);store.releaseLock(id,lock);
  updateConversationContext(store,id,{brief:null});assert.equal(store.getBriefScope(id),null);
 }finally{store.close();}
});
