import test from 'node:test';
import assert from 'node:assert/strict';
import { getCatalog, queryMetrics } from '../src/lib/analytics';
import { analysisHref, parseAnalysisSearch, queryIdentity, libraryHref, parseLibrarySearch, workspaceMode } from '../src/lib/workspace-routing';

test('shared analytical links preserve every public filter and chart view',()=>{
  const query={seriesIds:['itboard_monitor_python_open_ads','itboard_monitor_docker_open_ads'],sourceId:'itboard_monitor_csv',topic:'skills' as const,geography:'CH',start:'2026-10-01',end:'2026-11-15',mode:'history' as const,measure:'share' as const};
  for(const mode of ['explore','analyst'] as const){
    const url=new URL(analysisHref(mode,query,'table'),'https://example.test');
    const parsed=parseAnalysisSearch(url.search);assert.ok(parsed.ok);assert.ok(parsed.value.query);
    assert.equal(workspaceMode(url.pathname),mode);assert.equal(queryIdentity(parsed.value.query),queryIdentity(query));assert.equal(parsed.value.view,'table');
    assert.equal(queryMetrics(parsed.value.query).id,queryMetrics(query).id);
  }
});
test('all approved indicator identifiers round-trip without changing geography or meaning',()=>{
  for(const item of getCatalog()){
    const query={seriesIds:[item.id],sourceId:item.sourceId,topic:item.topic,geography:item.geography,measure:'reported' as const};
    const parsed=parseAnalysisSearch(new URL(analysisHref('explore',query),'https://example.test').search);
    assert.ok(parsed.ok,item.id);assert.ok(parsed.value.query);assert.equal(queryIdentity(parsed.value.query),queryIdentity(query));
  }
});
test('bare analytical routes do not silently prescribe filters over saved context',()=>{
  assert.deepEqual(parseAnalysisSearch(''),{ok:true,value:{query:null}});
});
test('malformed links cannot invent filters, expose chat content or bypass query bounds',()=>{
  for(const search of ['series=python&sql=SELECT+1','message=private','conversation=secret','series=x&measure=count&measure=share','series=x&series=x','series=x&view=pie','series=x&start=2026-02-30','series=x&start=2026-12-01&end=2026-01-01','series=','view=line','mode=ranking&limit=1000','series='+('x'.repeat(4100))])assert.equal(parseAnalysisSearch(search).ok,false,search.slice(0,80));
});
test('ranking links retain their scope and ordering without requiring explicit IDs',()=>{
  const query={mode:'ranking' as const,topic:'skills' as const,sourceId:'itboard_monitor_csv',metric:'platform_tagged_open_ads',rankingBy:'change' as const,measure:'share' as const,limit:5};
  const parsed=parseAnalysisSearch(new URL(analysisHref('explore',query,'bar'),'https://example.test').search);
  assert.ok(parsed.ok);assert.ok(parsed.value.query);assert.equal(queryIdentity(parsed.value.query),queryIdentity(query));
});
test('library URLs preserve search, regional scope, source and expanded rows',()=>{
  const filters={q:'C++ & Python',source:'sem_asyl_202610_6_22',topic:'participants' as const,coverage:'all' as const,page:3};
  assert.deepEqual(parseLibrarySearch(new URL(libraryHref(filters),'https://example.test').search),{ok:true,value:filters});
  assert.equal(libraryHref(),'/library');
  for(const search of ['coverage=Zurich','page=-1','page=1.5','page=1001','q=a&q=b','query=hidden','q='+('a'.repeat(201))])assert.equal(parseLibrarySearch(search).ok,false);
});
