import test from 'node:test';
import assert from 'node:assert/strict';
import { AnalyticsError, compareMetrics, getCapabilities, getCatalog, getOverview, queryMetrics, searchEvidence } from '../src/lib/analytics';

const python='itboard_monitor_python_open_ads';
const docker='itboard_monitor_docker_open_ads';

test('frozen Python/Docker comparison uses verified counts, denominators and percentage points',()=>{
  const result=compareMetrics({seriesIds:[python,docker],measure:'share',start:'2026-10-01',end:'2026-11-30'});
  assert.equal(result.status,'ok');
  assert.deepEqual(result.series[0].points.map(p=>p.count),[115,188]);
  assert.deepEqual(result.series[1].points.map(p=>p.count),[99,123]);
  assert.deepEqual(result.series[0].points.map(p=>p.denominator),[582,770]);
  assert.ok(Math.abs(result.series[0].points[1].value!-188/770*100)<1e-10);
  assert.ok(result.changes[1].absolute<0);
  assert.equal(result.changes[1].unit,'percentage_points');
  assert.equal(result.changes[0].toDate,'2026-11-15');
  assert.ok(result.sources[0].url.includes('november-2026'));
  assert.ok(result.series[0].points.every(p=>p.observationIds.length===2));
});

test('manual and AI callers receive stable result identifiers for the same validated query',()=>{
  const a=queryMetrics({seriesIds:[python],measure:'share'});
  const b=queryMetrics({seriesIds:[python],measure:'share'});
  assert.equal(a.id,b.id);
  assert.deepEqual(a.series,b.series);
});

test('catalog is broad, excludes restricted sources, and does not invent skill names',()=>{
  const catalog=getCatalog();
  assert.ok(catalog.length>500);
  assert.equal(catalog.filter(s=>s.geography==='CH').length,168);
  assert.ok(catalog.every(s=>!s.sourceId.startsWith('getuhired')));
  const skills=getCapabilities({topic:'skills',geography:'CH',limit:40});
  assert.ok(skills.items.some(s=>s.label==='Python'));
  assert.ok(!skills.items.some(s=>['ICT','ML / AI','Security'].includes(s.label)));
  assert.equal(getCapabilities({search:'Python',geography:'itboard:region:zuerich'}).items[0].geography,'itboard:region:zuerich');
  const several=getCapabilities({search:'Compare Python and Docker demand',topic:'skills'}).items;
  assert.ok(several.some(s=>s.id===python)&&several.some(s=>s.id===docker));
  assert.equal(getCapabilities({search:'SQL',topic:'skills'}).total,0,'SQL must not silently become MySQL');
});

test('missing role-months remain explicit null gaps, never fabricated zeros',()=>{
  const result=queryMetrics({seriesIds:['itboard_csv_rolle_data-analyst']});
  const march=result.series[0].points.find(p=>p.date.startsWith('2026-03'));
  assert.ok(march);
  assert.equal(march.value,null);
  assert.deepEqual(march.observationIds,[]);
  assert.equal(result.series[0].points.at(-1)?.count,4);
});

test('official occupation shares are discoverable and rankable under Roles without becoming counts',()=>{
  const sourceId='eurostat_isoc_sk_oja2_ch_20261116';
  const available=getCapabilities({topic:'roles',sourceId,limit:40});
  assert.equal(available.total,7);
  assert.ok(available.items.every(item=>item.topic==='roles'&&item.metric==='occupation_share_of_ict_oja'));
  const ranked=queryMetrics({mode:'ranking',topic:'roles',sourceId,measure:'reported'});
  assert.equal(ranked.status,'ok');
  assert.equal(ranked.series.length,7);
  assert.ok(ranked.series.every(series=>series.sourceId===sourceId&&series.unit==='percent'));
  assert.throws(()=>queryMetrics({mode:'ranking',topic:'roles',sourceId,measure:'count'}),{code:'UNSUPPORTED_MEASURE'});
  const defaultRanking=queryMetrics({mode:'ranking',topic:'roles',measure:'count'});
  assert.ok(defaultRanking.series.length>0);
  assert.ok(defaultRanking.series.every(series=>series.sourceId==='itboard_monitor_csv'));
});

test('saved Eurostat Market context queries migrate narrowly to Roles and preserve their evidence',()=>{
  const sourceId='eurostat_isoc_sk_oja2_ch_20261116',seriesIds=['eurostat_ch_isoc_sk_oja2_oc251'];
  const current=queryMetrics({seriesIds,sourceId,topic:'roles',measure:'reported'});
  const saved=queryMetrics({seriesIds,sourceId,topic:'context',measure:'reported'});
  assert.equal(saved.query.topic,'roles');
  assert.equal(saved.id,current.id);
  assert.deepEqual(saved.series,current.series);
  const ranking=queryMetrics({mode:'ranking',topic:'context',sourceId,measure:'reported'});
  assert.equal(ranking.query.topic,'roles');
  assert.equal(ranking.series.length,7);
  const metricRanking=queryMetrics({mode:'ranking',topic:'context',metric:'occupation_share_of_ict_oja',measure:'reported'});
  assert.equal(metricRanking.query.topic,'roles');
  assert.equal(metricRanking.series.length,7);
  assert.throws(()=>queryMetrics({seriesIds,topic:'skills'}),{code:'INVALID_QUERY'});
  assert.throws(()=>queryMetrics({seriesIds:[python],topic:'context'}),{code:'INVALID_QUERY'});
  assert.throws(()=>queryMetrics({seriesIds:[...seriesIds,python],topic:'context'}),{code:'INVALID_QUERY'});
});

test('unknown pre-June experience is not interpreted as zero juniors',()=>{
  const result=queryMetrics({seriesIds:['itboard_csv_erfahrung_junior'],measure:'share'});
  assert.equal(result.series[0].points[0].value,null);
  assert.equal(result.series[0].points.at(-1)?.count,67);
  assert.ok(Math.abs(result.series[0].points.at(-1)!.value!-67/770*100)<1e-10);
});

test('sparse official monthly extracts retain calendar gaps instead of connecting observations',()=>{
  const result=queryMetrics({seriesIds:['seco_registered_vacancies_ag'],geography:'CH-AG'});
  assert.equal(result.series[0].points.length,13);
  assert.equal(result.series[0].points.filter(p=>p.value!==null).length,3);
  assert.equal(result.series[0].points.find(p=>p.date==='2026-01-01')?.value,null);
});

test('query validation rejects unavailable intersections, SQL and malformed dates',()=>{
  assert.throws(()=>queryMetrics({seriesIds:[python],seniority:'junior'} as never),/Unrecognized key/);
  assert.throws(()=>queryMetrics({seriesIds:[python],sql:'DROP TABLE observations'} as never),/Unrecognized key/);
  assert.throws(()=>queryMetrics({seriesIds:[python],start:'2026-02-30'}),/valid calendar/);
  assert.throws(()=>queryMetrics({seriesIds:[python],start:'2026-11-01',end:'2026-01-01'}),/start date/);
  assert.throws(()=>queryMetrics({seriesIds:['missing']}),{code:'UNKNOWN_SERIES'});
  try { queryMetrics({seriesIds:['missing']}); } catch (error) { assert.equal((error as AnalyticsError).status,400); }
});

test('sources, geography and percentage denominator incompatibility prevent misleading comparisons',()=>{
  assert.throws(()=>queryMetrics({seriesIds:[python],geography:'CH-ZH'}),{code:'GEOGRAPHY_MISMATCH'});
  assert.throws(()=>compareMetrics({seriesIds:[python,'fso_jobstat_ch_vacancies_div_62_63']}),{code:'INCOMPARABLE_SERIES'});
  assert.throws(()=>queryMetrics({seriesIds:['eurostat_ch_isoc_sk_oja1_ict'],measure:'count'}),{code:'UNSUPPORTED_MEASURE'});
});

test('ranking uses common dates, concrete skills and deterministic percentage-point change',()=>{
  const result=queryMetrics({mode:'ranking',topic:'skills',measure:'share',rankingBy:'change',limit:20,start:'2026-10-01',end:'2026-11-30'});
  assert.equal(result.series.length,20);
  assert.ok(result.series.every(s=>s.points.length===2));
  assert.ok(result.series.every(s=>!['ICT','ML / AI','Security'].includes(s.label)));
  const deltas=result.changes.map(c=>c.absolute);
  assert.ok(deltas.every((d,i)=>i===0||d<=deltas[i-1]));
});

test('official rolling-window periods and source definitions survive normalization',()=>{
  const result=queryMetrics({seriesIds:['eurostat_ch_isoc_sk_oja1_ict'],start:'2026-01-01'});
  const latest=result.series[0].points.at(-1)!;
  assert.equal(latest.date,'2025-10-01');
  assert.equal(latest.end,'2026-09-30');
  assert.ok(result.limitations.some(s=>s.includes('overlap')));
});

test('percentage growth is never relabelled as a share, while published shares remain usable',()=>{
  const yoy='eurostat_ch_isoc_sk_oja3_ict';
  assert.equal(getCatalog().find(s=>s.id===yoy)?.canShare,false);
  assert.throws(()=>queryMetrics({seriesIds:[yoy],measure:'share'}),{code:'UNSUPPORTED_MEASURE'});
  const change=queryMetrics({seriesIds:[yoy],measure:'reported'});
  assert.equal(change.series[0].points.at(-1)?.value,34.6);
  assert.equal(change.query.measure,'reported');
  const share='eurostat_ch_isoc_sk_oja1_ict';
  assert.equal(getCatalog().find(s=>s.id===share)?.canShare,true);
  assert.equal(queryMetrics({seriesIds:[share],measure:'share'}).series[0].points.at(-1)?.value,10.5);
});

test('long histories are bounded visibly and empty windows are explicit',()=>{
  const seco=getCatalog().find(s=>s.sourceId==='seco_2026_10'&&s.geography==='CH')!;
  const result=queryMetrics({seriesIds:[seco.id]});
  assert.equal(result.truncated,true);
  assert.ok(result.series[0].points.length<=200);
  const empty=queryMetrics({seriesIds:[python],start:'2027-01-01'});
  assert.equal(empty.status,'empty');
});

test('overview and approved evidence use actual serving database rows',()=>{
  assert.deepEqual(getOverview(),{listings:770,employers:197,juniors:67,asOf:'2026-11-15'});
  const evidence=searchEvidence('Python Data Analyst');
  assert.ok(evidence.some(e=>e.id==='hslu_python_data_analyst'&&e.summary.includes('234')));
  assert.ok(searchEvidence('policy reporting')[0].limitations.includes('current legal status is not verified'));
  assert.throws(()=>searchEvidence('x'.repeat(2001)),AnalyticsError);
});
