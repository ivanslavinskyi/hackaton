import test from 'node:test';
import assert from 'node:assert/strict';
import {getCapabilities,getCatalog,queryMetrics} from '../src/lib/analytics';
import {getDataInventory,getMarketOverview} from '../src/lib/data-inventory';

test('inventory reconciles the actual serving release and separates national from regional coverage',()=>{
  const data=getDataInventory();
  assert.deepEqual(data.counts,{observations:3445,nationalObservations:2015,series:595,nationalSeries:168,sources:10});
  assert.equal(data.sources.reduce((n,s)=>n+s.seriesCount,0),data.counts.series);
  assert.equal(data.sources.filter(s=>s.domain==='regional').length,1);
  assert.ok(data.sources.filter(s=>s.domain==='regional').every(s=>s.nationalObservations===0&&!s.geographies.includes('CH')));
  assert.ok(data.sources.every(s=>s.url.startsWith('https:')&&s.retrievedAt&&s.first<=s.last));
  assert.equal(data.frozen,true);
});

test('every published series is reachable using the same validated query engine',()=>{
  for(const item of getCatalog()){
    const result=queryMetrics({seriesIds:[item.id],geography:item.geography,sourceId:item.sourceId,measure:'reported',mode:'snapshot'});
    assert.equal(result.status,'ok',item.id);
    assert.equal(result.series[0].sourceId,item.sourceId);
    assert.equal(result.sources[0].id,item.sourceId);
    assert.ok(result.series[0].points.some(p=>p.observationIds.length>0&&p.value!==null));
  }
});

test('source discovery and source launch samples stay inside approved scope',()=>{
  const inventory=getDataInventory();
  for(const source of inventory.sources){
    const found=getCapabilities({sourceId:source.id,geography:'all',limit:40});
    assert.equal(found.total,source.seriesCount);
    assert.ok(found.items.every(item=>item.sourceId===source.id));
    assert.ok(source.sampleSeriesIds.every(id=>getCatalog().some(item=>item.id===id&&item.sourceId===source.id)));
  }
  assert.equal(getCapabilities({sourceId:'getuhired',geography:'all'}).total,0);
  assert.ok(inventory.excludedSources.some(s=>s.id==='getuhired'));
  assert.equal(inventory.evidence.length,3);
  assert.ok(inventory.evidence.some(e=>e.status?.includes('provisional')));
});

test('a region total uses its documented national denominator without changing a regional skill denominator',()=>{
  const total=queryMetrics({seriesIds:['itboard_csv_region_zuerich'],geography:'itboard:region:zuerich',measure:'share'});
  const latest=total.series[0].points.at(-1)!;
  assert.equal(latest.count,381);assert.equal(latest.denominator,770);
  assert.ok(Math.abs(latest.value!-381/770*100)<1e-10);
  assert.ok(total.limitations.some(s=>s.includes('national counted ITBoard total')));
  const item=getCatalog().find(s=>s.geography==='itboard:region:zuerich'&&s.skillId==='python'&&s.canShare);
  // The fixture uses namespaced skill IDs; discover by label when needed.
  const skill=item||getCatalog().find(s=>s.geography==='itboard:region:zuerich'&&s.label==='Python'&&s.canShare)!;
  const regionalSkill=queryMetrics({seriesIds:[skill.id],geography:skill.geography,measure:'share'});
  assert.equal(regionalSkill.series[0].points.at(-1)!.denominator,381);
});

test('overview spans independent source families without combining populations or manufacturing figures',()=>{
  const panels=getMarketOverview();
  assert.equal(panels.length,6);
  assert.equal(new Set(panels.map(p=>p.result.sources[0].publisher)).size,5);
  for(const panel of panels){
    assert.equal(panel.result.status,'ok');
    assert.equal(panel.result.sources.length,1);
    assert.deepEqual(panel.result.series,queryMetrics(panel.result.query).series);
    assert.equal(panel.result.truncated,false);
  }
  assert.equal(panels.find(p=>p.id==='participants')!.result.query.mode,'snapshot');
  assert.equal(panels.find(p=>p.id==='ict-change')!.result.query.measure,'reported');
});
