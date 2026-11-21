'use client';

import {useEffect,useState} from 'react';
import {Check,ChevronDown,Info,Layers3,LoaderCircle,Plus,Search,X} from 'lucide-react';
import type {CatalogItem,QueryInput,QuerySpec} from '@/lib/contracts';
import {canRankIndicators,compatibleIndicators,defaultIndicators,scopeQuery,type ExplorerTopic} from '@/lib/explorer';
import {Button} from './ui/button';
import {geographyLabel} from './result-view';

const TOPICS:{id:ExplorerTopic;label:string}[]=[{id:'skills',label:'Skills'},{id:'roles',label:'Roles'},{id:'experience',label:'Experience'},{id:'context',label:'Market context'}];
const TOPIC_NOTES:Record<ExplorerTopic,string>={
  skills:'ITBoard is the only verified numeric source for named-skill trends in this release. Other sources describe demand, occupations or participant context.',
  roles:'ITBoard tracks individual role tags; Eurostat reports broader occupational groups. Select a source to explore its definitions separately.',
  experience:'Experience-level tags are available only in the ITBoard sample. They cannot be combined with a specific skill or role.',
  context:'Vacancies, online advertisements and participant employment describe different populations. Explore each source separately.',
};

export function sourceLabel(item:CatalogItem) {
  if(item.sourceId.startsWith('eurostat_isoc_sk_oja1'))return 'Eurostat · ICT share';
  if(item.sourceId.startsWith('eurostat_isoc_sk_oja2'))return 'Eurostat · ICT occupations';
  if(item.sourceId.startsWith('eurostat_isoc_sk_oja3'))return 'Eurostat · ICT annual change';
  if(item.sourceId.startsWith('fso_'))return 'BFS · Job vacancies';
  if(item.sourceId==='seco_2026_10')return 'SECO · Registered vacancies';
  if(item.sourceId.includes('6_22'))return 'SEM · Permit F';
  if(item.sourceId.includes('6_23'))return 'SEM · Refugees with permit B';
  if(item.sourceId.includes('6_24'))return 'SEM · Status S';
  if(item.sourceId.startsWith('fribourg'))return 'Fribourg · Regional vacancies';
  return item.sourceName;
}

export function ExplorerControls({catalog,query,topic,busy,onQuery,onLibrary}:{catalog:CatalogItem[];query:QuerySpec;topic:ExplorerTopic;busy:boolean;onQuery:(q:QueryInput)=>Promise<void>;onLibrary:()=>void}) {
  const [search,setSearch]=useState(''),[pickerOpen,setPickerOpen]=useState(false);
  const [start,setStart]=useState(query.start||''),[end,setEnd]=useState(query.end||'');
  useEffect(()=>{setStart(query.start||'');setEnd(query.end||'');},[query.start,query.end]);
  const topicItems=catalog.filter(c=>c.topic===topic);
  const selected=query.seriesIds.map(id=>catalog.find(c=>c.id===id)).filter((c):c is CatalogItem=>!!c);
  const sourceId=query.sourceId||selected[0]?.sourceId||topicItems[0]?.sourceId||'';
  const sources=[...new Map(catalog.map(c=>[c.sourceId,c])).values()];
  const topicSources=new Set(topicItems.map(c=>c.sourceId));
  const sourceItems=topicItems.filter(c=>c.sourceId===sourceId);
  const geographies=[...new Set(sourceItems.map(c=>c.geography))].sort((a,b)=>a==='CH'?-1:b==='CH'?1:geographyLabel(a).localeCompare(geographyLabel(b)));
  const items=sourceItems.filter(c=>c.geography===query.geography);
  const first=selected[0]||items.find(c=>c.metric===query.metric)||defaultIndicators(items,topic)[0];
  const rankedItems=items.filter(c=>c.metric===(query.metric||first?.metric));
  const rankingAvailable=canRankIndicators(rankedItems);
  const activeItems=query.mode==='ranking'?rankedItems:selected;
  const canShare=activeItems.length>0&&activeItems.every(c=>c.canShare);
  const canCount=activeItems.length>0&&activeItems.every(c=>c.unit!=='percent'||c.metric==='share_of_platform_ads');
  const displayedShare=query.measure==='share'||(query.measure==='reported'&&canShare&&activeItems.every(c=>c.unit==='percent'));
  const comparisonItems=first?items.filter(c=>compatibleIndicators(first,c)):[];
  const canCompare=comparisonItems.length>1;
  const filtered=comparisonItems.filter(c=>`${c.label} ${c.metric}`.toLowerCase().includes(search.toLowerCase()));
  const otherItems=items.filter(c=>c.id!==first?.id);
  const differentPopulation=!!first&&otherItems.some(c=>c.population!==first.population);
  const differentUnit=!!first&&otherItems.some(c=>c.unit!==first.unit);
  const comparisonReason=!otherItems.length
    ?'No other indicators are available for this source, topic and geography.'
    :differentPopulation&&!differentUnit
      ?'These indicators cover different populations. Choose another indicator above to view it separately.'
      :differentUnit
        ?'These indicators use different units or measurement definitions. Choose another indicator above to view it separately.'
        :'These indicators use different measurement definitions. Choose another indicator above to view it separately.';
  const dateItems=activeItems.length?activeItems:items;
  const dateMin=dateItems.map(c=>c.first).sort()[0],dateMax=dateItems.map(c=>c.last).sort().at(-1);
  const indicatorLabel=topic==='skills'?'Skill':topic==='roles'?'Role / occupational group':topic==='experience'?'Experience level':'Indicator';

  function changeScope(nextTopic:ExplorerTopic,nextSource?:string,nextGeography?:string) {
    setSearch('');setPickerOpen(false);
    void onQuery(scopeQuery(catalog,query,nextTopic,nextSource,nextGeography));
  }
  function chooseIndicator(id:string) {
    const item=items.find(c=>c.id===id);if(!item)return;
    setSearch('');setPickerOpen(false);
    void onQuery({seriesIds:[id],sourceId,topic,geography:query.geography,mode:'history',measure:item.canShare?'share':'reported'});
  }
  function toggleSeries(item:CatalogItem) {
    const next=query.seriesIds.includes(item.id)?query.seriesIds.filter(id=>id!==item.id):[...query.seriesIds,item.id];
    if(!next.length||next.length>4)return;
    const nextItems=catalog.filter(c=>next.includes(c.id));
    void onQuery({...query,seriesIds:next,mode:'history',measure:query.measure==='share'&&!nextItems.every(c=>c.canShare)?'reported':query.measure});
  }
  function chooseMode(mode:QuerySpec['mode']) {
    if(mode==='ranking'&&!rankingAvailable)return;
    const request:QueryInput={...query,mode,sourceId,topic};
    if(mode==='ranking'){request.seriesIds=[];request.metric=first?.metric;}
    else {request.seriesIds=query.seriesIds.length?query.seriesIds:[first!.id];delete request.metric;}
    void onQuery(request);
  }
  const options=(sameTopic:boolean)=>sources.filter(s=>topicSources.has(s.sourceId)===sameTopic).map(s=><option key={s.sourceId} value={s.sourceId}>{sourceLabel(s)}</option>);
  return <section className="explorer-controls">
    <div className="topic-tabs" role="tablist" aria-label="Analysis topic">{TOPICS.map(t=><button type="button" role="tab" aria-selected={topic===t.id} className={topic===t.id?'selected':''} key={t.id} disabled={busy} onClick={()=>changeScope(t.id)}>{t.label}</button>)}</div>
    <div className="explorer-coverage" id="explorer-coverage"><Info size={16}/><div><strong>{topicSources.size} {topicSources.size===1?'source':'sources'} for {TOPICS.find(t=>t.id===topic)?.label}</strong><p>{TOPIC_NOTES[topic]}</p><span>All {sources.length} source datasets are available below. Choosing another source switches to its supported topic.</span></div><button className="text-button" onClick={onLibrary}>Browse all data</button></div>
    <div className="filter-row">
      <label className="filter-field source-field"><span>Source · all {sources.length} datasets</span><span className="select-wrap"><select aria-label="Source" aria-describedby="explorer-coverage" value={sourceId} disabled={busy} onChange={e=>changeScope(topic,e.target.value)}><optgroup label={`For ${TOPICS.find(t=>t.id===topic)?.label}`}>{options(true)}</optgroup>{topicSources.size<sources.length&&<optgroup label="Other data — switches topic">{options(false)}</optgroup>}</select><ChevronDown size={14}/></span></label>
      <label className="filter-field"><span>Geography</span><span className="select-wrap"><select aria-label="Geography" value={query.geography} disabled={busy} onChange={e=>changeScope(topic,sourceId,e.target.value)}>{geographies.map(geo=><option value={geo} key={geo}>{geographyLabel(geo)}</option>)}</select><ChevronDown size={14}/></span></label>
      <label className="filter-field small-field"><span>View</span><span className="select-wrap"><select aria-label="View" value={query.mode} disabled={busy} onChange={e=>chooseMode(e.target.value as QuerySpec['mode'])}><option value="history">History</option><option value="snapshot">Latest snapshot</option>{(rankingAvailable||query.mode==='ranking')&&<option value="ranking">Ranking</option>}</select><ChevronDown size={14}/></span></label>
      <div className="measure-field"><span>Measure</span><div className="segmented compact"><button type="button" disabled={busy} className={!displayedShare?'selected':''} onClick={()=>void onQuery({...query,measure:canCount?'count':'reported'})}>{canCount?'Count':'Reported'}</button><button type="button" className={displayedShare?'selected':''} disabled={busy||!canShare} onClick={()=>void onQuery({...query,measure:'share'})} title={!canShare?'This measure has no documented share or rate':'Use the source’s documented population and denominator'}>{first?.metric==='registry_employment_rate'?'Rate':'Share'}</button></div></div>
    </div>
    <div className="indicator-control-row"><label className="filter-field"><span>{indicatorLabel} · {items.length} available</span><span className="select-wrap"><select aria-label="Choose indicator" value={query.mode==='ranking'?'':first?.id||''} disabled={busy} onChange={e=>chooseIndicator(e.target.value)}>{query.mode==='ranking'&&<option value="" disabled>Ranking compatible indicators</option>}{items.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select><ChevronDown size={14}/></span></label><p>Choose an indicator to start a new selection. {canCompare?'Use Compare to add compatible series.':'Indicators with different definitions are explored separately.'}</p></div>
    <div className="selection-row"><div className="indicator-selection">{query.mode==='ranking'?<><span className="indicator-tag"><Layers3 size={13}/>Top {query.limit} indicators</span><label className="ranking-sort"><span className="sr-only">Rank indicators by</span><select aria-label="Rank indicators by" value={query.rankingBy} disabled={busy} onChange={e=>void onQuery({...query,rankingBy:e.target.value as 'value'|'change'})}><option value="value">By latest value</option>{rankedItems.some(c=>c.observations>1)&&<option value="change">By change</option>}</select><ChevronDown size={12}/></label></>:<>
      {selected.map((item,index)=><button className={`indicator-tag tag-${index}`} type="button" key={item.id} disabled={busy} onClick={()=>{if(selected.length>1)toggleSeries(item);}} title={selected.length>1?'Remove from comparison':item.label}><span className="series-dot"/>{item.label}{selected.length>1&&<X size={12}/>}</button>)}
      {canCompare?<div className="indicator-picker"><button type="button" className="add-indicator" disabled={busy} onClick={()=>{setSearch('');setPickerOpen(!pickerOpen);}} aria-expanded={pickerOpen}><Plus size={14}/>{selected.length>=4?'Edit comparison':'Compare'}</button>{pickerOpen&&<><button className="picker-backdrop" aria-label="Close indicator picker" onClick={()=>setPickerOpen(false)}/><div className="picker-panel"><div className="picker-search"><Search size={15}/><input autoFocus aria-label="Search indicators" placeholder="Find a compatible indicator…" value={search} onChange={e=>setSearch(e.target.value)}/><button onClick={()=>setPickerOpen(false)} aria-label="Close indicator picker"><X size={14}/></button></div><div className="picker-help">{comparisonItems.length} compatible indicators · {selected.length} of 4 selected</div>{selected.length>=4&&<p className="picker-limit" role="status">4-indicator limit reached. Remove one selection before adding another.</p>}<div className="picker-options">{filtered.map(item=>{const isSelected=query.seriesIds.includes(item.id);const lastSelected=isSelected&&selected.length===1;const atLimit=!isSelected&&selected.length>=4;return <button type="button" key={item.id} aria-label={item.label} aria-pressed={isSelected} disabled={busy||lastSelected||atLimit} title={lastSelected?'Keep at least one indicator selected.':atLimit?'Remove a selected indicator first (maximum 4).':isSelected?'Remove from comparison':'Add to comparison'} onClick={()=>toggleSeries(item)}><span className={`picker-check ${isSelected?'checked':''}`}>{isSelected&&<Check size={12}/>}</span><span>{item.label}<small>{item.unit.replaceAll('_',' ')} · {item.observations} observations</small></span></button>})}{!filtered.length&&<p className="picker-empty">No compatible indicators match this search. Try another name.</p>}</div></div></>}</div>:<div className="comparison-note" role="note" aria-label="Comparison availability"><Info size={14}/><div><strong>Single-indicator view</strong><p>{comparisonReason}</p></div></div>}
    </>}</div><div className="period-controls"><label><span className="sr-only">Period start</span><input type="date" value={start} min={dateMin} max={end||dateMax} onChange={e=>setStart(e.target.value)} aria-label="Period start"/></label><span>to</span><label><span className="sr-only">Period end</span><input type="date" value={end} min={start||dateMin} max={dateMax} onChange={e=>setEnd(e.target.value)} aria-label="Period end"/></label><Button size="sm" variant="outline" disabled={busy} onClick={()=>void onQuery({...query,start:start||undefined,end:end||undefined})}>{busy?<LoaderCircle size={14} className="spin"/>:'Apply'}</Button>{(start||end)&&<button className="text-button" disabled={busy} onClick={()=>{setStart('');setEnd('');void onQuery({...query,start:undefined,end:undefined});}}>Reset</button>}</div></div>
  </section>;
}
