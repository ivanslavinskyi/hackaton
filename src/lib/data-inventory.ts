import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DATA_RELEASE, getCatalog, queryMetrics, searchEvidence } from './analytics';
import { getDataDb } from './data';
import { SOURCE_POLICY_VERSION } from './source-policy';
import type { DataInventory, DataSourceInventory, MarketOverviewPanel, QueryInput } from './contracts';

type SourceRow = { source_id:string; title:string; publisher:string; url:string; published_at:string|null; retrieved_at:string|null; license:string; limitations:string; data_family:string; coverage_label:string|null; reviewed_on:string|null; attribution:string|null; terms_url:string|null };
type CountRow = { source_id:string; n:number; national:number; first:string; last:string };
type ReviewRow = { source_id:string; use_mode:string; attribution:string; reviewed_on:string };
type ReleaseManifest = { version:string; checked_on:string; getuhired_public_qa?:{status?:string;independent_review?:{release_decision?:{quarantine_reason?:string}}} };
const unique = <T>(values:T[]) => [...new Set(values)];
function array(value:string):string[] { try {const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed.filter((x):x is string=>typeof x==='string'):[];}catch{return [];} }

const suggested:Record<string,string[]>={
  itboard_monitor_csv:['itboard_monitor_python_open_ads','itboard_monitor_docker_open_ads','itboard_csv_rolle_it-support'],
  fso_jobstat_vacancies_2026q2:['fso_jobstat_ch_vacancies_div_62_63','fso_jobstat_ch_vacancies_div_58_63','fso_jobstat_ch_vacancies_div_5_96'],
  eurostat_isoc_sk_oja2_ch_20261116:['eurostat_ch_isoc_sk_oja2_oc251','eurostat_ch_isoc_sk_oja2_oc351'],
  seco_2026_10:['seco_registered_vacancies_ch'],
  sem_asyl_202610_6_22:['sem_asyl_ch_f_employment_rate_18_64'],
  sem_asyl_202610_6_23:['sem_asyl_ch_b_employment_rate_18_64'],
  sem_asyl_202610_6_24:['sem_asyl_ch_s_employment_rate_18_64'],
};

/** Inventory is derived from the same reviewed serving database used by every query. */
export function getDataInventory():DataInventory {
  const db=getDataDb(), catalog=getCatalog();
  const manifest=JSON.parse(readFileSync(resolve(process.env.MARKET_RADAR_DATA_DIR||resolve(process.cwd(),'data'),'manifest.json'),'utf8')) as ReleaseManifest;
  if(manifest.version!==DATA_RELEASE)throw new Error('The serving data manifest and application release differ.');
  const sources=db.prepare(`SELECT s.*,c.coverage_label,r.reviewed_on,r.attribution,r.terms_url FROM sources s JOIN source_review r USING(source_id)
    LEFT JOIN national_coverage c USING(source_id) WHERE r.use_mode='numeric' ORDER BY s.source_id`).all() as unknown as SourceRow[];
  const counts=db.prepare(`SELECT source_id,COUNT(*) n,SUM(CASE WHEN geography='CH' THEN 1 ELSE 0 END) national,
    MIN(period_start) first,MAX(period_end) last FROM observations WHERE value IS NOT NULL AND usage_scope='swiss_core' GROUP BY source_id`).all() as unknown as CountRow[];
  const inventory:DataSourceInventory[]=sources.flatMap(source=>{
    const items=catalog.filter(s=>s.sourceId===source.source_id), count=counts.find(c=>c.source_id===source.source_id);
    if(!items.length||!count)return [];
    const national=items.filter(s=>s.geography==='CH');
    const preferred=(suggested[source.source_id]||[]).filter(id=>items.some(s=>s.id===id));
    const sampleSeriesIds=preferred.length?preferred:(national.length?national:items).slice(0,3).map(s=>s.id);
    const domain:DataSourceInventory['domain']=!national.length?'regional':source.data_family==='sem_asylstatistik'?'participants':source.data_family==='itboard'?'skills':'demand';
    return [{id:source.source_id,title:source.title,publisher:source.publisher,url:source.url,
      publishedAt:source.published_at,retrievedAt:source.retrieved_at,reviewedOn:source.reviewed_on,attribution:source.attribution,termsUrl:source.terms_url,coverage:source.coverage_label||`${unique(items.map(s=>s.geography)).join(', ')} · published regional extract`,license:source.license,
      family:source.data_family,domain,seriesCount:items.length,nationalSeriesCount:national.length,
      observations:Number(count.n),nationalObservations:Number(count.national),first:count.first,last:count.last,
      geographies:unique(items.map(s=>s.geography)).sort(),metrics:unique(items.map(s=>s.metric)).sort(),sampleSeriesIds,
      limitations:unique([...array(source.limitations),...items.flatMap(s=>s.limitations)]).slice(0,10)}];
  });
  const excludedSources:DataInventory['excludedSources']=(db.prepare("SELECT source_id,use_mode,attribution,reviewed_on FROM source_review WHERE use_mode!='numeric'").all() as unknown as ReviewRow[]).map(row=>({
    id:row.source_id,name:row.source_id==='hslu_2025_alt'?'HSLU AI Job Report 2025':row.source_id==='hslu_2026'?'HSLU AI Job Report 2026':row.source_id,
    status:row.use_mode==='selected_facts'?'Selected evidence only':'Not available for numeric analysis',reason:row.attribution,
  }));
  if(manifest.getuhired_public_qa)excludedSources.push({id:'getuhired',name:'Get U Hired',status:'Research only — excluded from numeric tools',
    reason:manifest.getuhired_public_qa.independent_review?.release_decision?.quarantine_reason||'Skill periods and denominators could not be verified; source methodology requires clarification.'});
  return {release:DATA_RELEASE,sourcePolicyVersion:SOURCE_POLICY_VERSION,checkedOn:manifest.checked_on,frozen:true,
    counts:{observations:inventory.reduce((n,s)=>n+s.observations,0),nationalObservations:inventory.reduce((n,s)=>n+s.nationalObservations,0),series:catalog.length,nationalSeries:catalog.filter(s=>s.geography==='CH').length,sources:inventory.length},
    sources:inventory,evidence:searchEvidence(''),excludedSources,
    limitations:[
      'A frozen reviewed extract, not a live feed. Review dates, retrieval dates and observation periods are different.',
      'Source counts refer to separate data tables or releases, not distinct publishers. Repeated and derived measures are not distinct jobs or people.',
      'Observation counts include reported values and derived shares or published-cell aggregates; they are not independent observations or a total of jobs.',
      'Shared schema does not make populations comparable. Do not add vacancy counts across sources, overlapping tags or periods.',
      'National scope does not imply exhaustive Swiss coverage. Regional extracts remain explicitly regional.',
      'Verification checks published aggregates and source definitions; it does not independently audit individual job advertisements or registers.',
      'No verified role × named skill × time or junior × named skill intersection is available. No programme outcome or causal training-effect estimate is available.',
      'HSLU evidence contains selected published findings only; the policy notice is dated and provisional, not a live legal status check.',
    ]};
}

/** Separate views preserve each source's own population, measure, period and citations. */
export function getMarketOverview():MarketOverviewPanel[] {
  const definitions:{id:string;title:string;description:string;query:QueryInput}[]=[
    {id:'skills',title:'Skills in the ITBoard sample',description:'Named technologies in active platform ads. The denominator changes between snapshots.',query:{seriesIds:['itboard_monitor_python_open_ads','itboard_monitor_docker_open_ads'],measure:'share'}},
    {id:'industry',title:'Vacancies in IT & information services',description:'BFS JOBSTAT establishment survey, by employer industry. This is not a count of IT occupations.',query:{seriesIds:['fso_jobstat_ch_vacancies_div_62_63'],measure:'reported',start:'2021-01-01'}},
    {id:'occupations',title:'The occupational mix of ICT ads',description:'Eurostat shares within ICT online ads. Each observation covers four overlapping quarters.',query:{seriesIds:['eurostat_ch_isoc_sk_oja2_oc251','eurostat_ch_isoc_sk_oja2_oc351'],measure:'reported'}},
    {id:'ict-change',title:'ICT advertisements: annual change',description:'Eurostat quarterly year-on-year change, not a share or a count of vacancies.',query:{seriesIds:['eurostat_ch_isoc_sk_oja3_ict'],measure:'reported'}},
    {id:'registered-vacancies',title:'Vacancies registered with RAV',description:'SECO national registrations across all occupations, including reported cross-border positions.',query:{seriesIds:['seco_registered_vacancies_ch'],measure:'reported',start:'2025-01-01'}},
    {id:'participants',title:'Permit F: employment context',description:'SEM registered employment rate for permit F residents aged 18–64, across all sectors. B and S populations are available separately in the data library.',query:{seriesIds:['sem_asyl_ch_f_employment_rate_18_64'],measure:'reported',mode:'snapshot'}},
  ];
  return definitions.map(({query,...panel})=>({...panel,result:queryMetrics(query)}));
}
