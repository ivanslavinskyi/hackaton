import test from 'node:test';
import assert from 'node:assert/strict';
import {getCatalog,queryMetrics} from '../src/lib/analytics';
import {querySchema} from '../src/lib/contracts';
import {canRankIndicators,compatibleIndicators,defaultIndicators,scopeQuery} from '../src/lib/explorer';

test('automatic scope selection queries every source and topic with compatible definitions',()=>{
  const catalog=getCatalog(),current=querySchema.parse({seriesIds:['itboard_monitor_python_open_ads'],topic:'skills',measure:'share'});
  for(const sourceId of new Set(catalog.map(c=>c.sourceId))){
    for(const topic of ['skills','roles','experience','context'] as const){
      const q=scopeQuery(catalog,current,topic,sourceId);
      const result=queryMetrics(q);
      assert.equal(result.status,'ok',`${sourceId} from ${topic}`);
      assert.equal(result.sources[0].id,sourceId);
      const selected=catalog.filter(c=>q.seriesIds?.includes(c.id));
      assert.ok(selected.every(c=>compatibleIndicators(selected[0],c)));
      const candidates=catalog.filter(c=>c.sourceId===sourceId&&c.geography===q.geography&&c.metric===selected[0].metric);
      if(canRankIndicators(candidates))assert.equal(queryMetrics({...q,seriesIds:[],mode:'ranking',metric:selected[0].metric}).status,'ok');
    }
  }
});

test('Roles defaults choose ordinary role listings and official groups, not remote-only subsets',()=>{
  const catalog=getCatalog();
  const roles=defaultIndicators(catalog.filter(c=>c.sourceId==='itboard_monitor_csv'&&c.topic==='roles'),'roles');
  assert.deepEqual(roles.map(c=>c.id),['itboard_csv_rolle_software-engineer','itboard_csv_rolle_it-support']);
  const official=defaultIndicators(catalog.filter(c=>c.metric==='occupation_share_of_ict_oja'),'roles');
  assert.equal(official.length,2);
  assert.ok(official.every(c=>c.metric==='occupation_share_of_ict_oja'));
});

test('unsafe rankings stay unavailable while compatible skill and occupational rankings work',()=>{
  const catalog=getCatalog();
  for(const id of ['fso_jobstat_vacancies_2026q2']){
    const rows=catalog.filter(c=>c.sourceId===id);
    const first=defaultIndicators(rows,'context')[0];
    assert.equal(canRankIndicators(rows.filter(c=>c.metric===first.metric)),false,id);
  }
  assert.equal(canRankIndicators(catalog.filter(c=>c.metric==='occupation_share_of_ict_oja')),true);
});
