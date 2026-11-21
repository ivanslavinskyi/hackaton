'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {ArrowUpRight,BookOpen,CheckCircle2,Info,LoaderCircle,Sparkles} from 'lucide-react';
import {decisionHref,getDecisionOptions,parseDecisionSearch,PARTICIPANT_GROUPS,type DecisionBrief,type DecisionPanel,type DecisionScope,type ParticipantGroup} from '@/lib/decision-contracts';
import {updateFilterURL} from '@/lib/workspace-routing';
import type {AnalyticsResult,CatalogItem,ViewType} from '@/lib/contracts';
import {Button} from './ui/button';
import {formatDate,formatValue,geographyLabel,ResultView} from './result-view';

type Props={kind:DecisionScope['kind'];catalog:CatalogItem[];onExplore:(result:AnalyticsResult,view?:ViewType)=>void;onAsk:(scope:DecisionScope|null,result:AnalyticsResult,text:string)=>void;onSources:(result:AnalyticsResult)=>void};
function latest(panel:DecisionPanel){const series=panel.result.series[0];return {series,point:series?.points.filter(point=>point.value!==null).at(-1)};}
export function DecisionWorkspace({kind,catalog,onExplore,onAsk,onSources}:Props){
  const search=useSearchParams().toString(),options=useMemo(()=>getDecisionOptions(catalog),[catalog]);
  const [brief,setBrief]=useState<DecisionBrief|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[attempt,retry]=useState(0);
  const [navigationVersion,setNavigationVersion]=useState(0);
  useEffect(()=>{const changed=()=>setNavigationVersion(value=>value+1);window.addEventListener('popstate',changed);return()=>window.removeEventListener('popstate',changed);},[]);
  let selected:DecisionScope={kind},linkError='';
  try{selected=parseDecisionSearch(kind,search);}catch{linkError='The filters in this link are not supported. Reset the view to continue.';}
  useEffect(()=>{
    const controller=new AbortController(),deadline=AbortSignal.timeout(10_000);
    setLoading(true);setError('');setBrief(null);
    async function load(){
      try{
        const scope=parseDecisionSearch(kind,search);
        const response=await fetch('/api/decision-brief',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(scope),signal:AbortSignal.any([controller.signal,deadline]),cache:'no-store'});
        const body=await response.json();if(!response.ok)throw new Error(body.error?.message||'The evidence could not be loaded.');
        if(!controller.signal.aborted&&new URLSearchParams(window.location.search).toString()===search)setBrief(body as DecisionBrief);
      }catch(cause){if(!controller.signal.aborted)setError(deadline.aborted?'Loading took too long. Please try again.':cause instanceof Error?cause.message:'The evidence could not be loaded.');}
      finally{if(!controller.signal.aborted)setLoading(false);}
    }
    void load();return()=>controller.abort();
  },[kind,search,attempt,navigationVersion]);
  function change(patch:Partial<DecisionScope>){updateFilterURL(decisionHref({...parseDecisionSearch(kind,window.location.search),...patch}));}
  const askBrief=()=>{if(brief)onAsk(brief.scope,brief.panels.find(panel=>panel.metric==='rate')?.result||brief.panels[0].result,kind==='opportunities'?'Explain this graduate-opportunities brief. What can we conclude for the selected role, and what should we validate before changing training?':'Explain this participant-context brief. Keep the selected populations separate and describe what these figures can and cannot tell Powercoders.');};
  return <div className="decision-workspace">
    <section className="decision-intro"><div><span className="eyebrow">EVIDENCE FOR PROGRAMME DECISIONS</span><h2>{kind==='opportunities'?'Start with the evidence. Then check the fit.':'Population context, with the right boundaries.'}</h2><p>{kind==='opportunities'?'Explore a role, then read the separate signals for junior access, technologies and the wider market.':'Published SEM figures for residents aged 18–64. Each status group keeps its own population and denominator.'}</p></div><Button disabled={!brief||loading} onClick={askBrief}><Sparkles size={16}/>Ask about this brief</Button></section>
    <section className="decision-controls" aria-label="Decision brief filters">
      {kind==='opportunities'?<><label>Role to investigate<select aria-label="Role to investigate" value={selected.role||'itboard_csv_rolle_it-support'} onChange={event=>change({role:event.target.value})}>{options.roles.map(role=><option key={role.id} value={role.id}>{role.label}</option>)}</select></label><p><Info size={16}/>Role selection changes the role panel only. Junior tags and technologies describe the whole national sample.</p></>:<><label>Population group<select aria-label="Population group" value={selected.group||'all'} onChange={event=>change({group:event.target.value as DecisionScope['group']})}><option value="all">All groups · separate populations</option>{Object.entries(PARTICIPANT_GROUPS).map(([id,group])=><option key={id} value={id}>{group.label}</option>)}</select></label><label>Geography<select aria-label="Participant geography" value={selected.geography||'CH'} onChange={event=>change({geography:event.target.value})}>{options.geographies.map(geo=><option key={geo} value={geo}>{geographyLabel(geo)}</option>)}</select></label><p><Info size={16}/>One published snapshot. No trend or programme placement rate is available.</p></>}
    </section>
    {(error||linkError)&&<div className="notice notice-error" role="alert"><Info size={18}/><div><strong>This brief could not be opened.</strong><p>{linkError||error}</p><Button variant="outline" onClick={()=>retry(value=>value+1)}>Try again</Button><Link className="text-button" href={'/'+kind}>Reset filters</Link></div></div>}
    {loading&&!linkError&&<div className="decision-loading" role="status"><LoaderCircle className="spin" size={22}/>Preparing the selected evidence…</div>}
    {brief&&!loading&&!linkError&&<>
      <div className="decision-release"><BookOpen size={15}/><span>{geographyLabel(brief.scope.geography||'CH')} · Frozen release {brief.release}. Observation dates are shown with each result.</span></div>
      {kind==='opportunities'?<div className="decision-panel-grid">{brief.panels.map(panel=><section className="decision-panel" key={panel.id} data-panel={panel.id}><div className="decision-panel-intro"><span className="eyebrow">{panel.id==='role'?'SELECTED ROLE':'SEPARATE CONTEXT'}</span><h2>{panel.title}</h2><p>{panel.description}</p>{panel.note&&<div className="decision-note"><Info size={16}/>{panel.note}</div>}</div><ResultView result={panel.result} onSources={()=>onSources(panel.result)} compact preferredView={panel.view}/><PanelActions panel={panel} onExplore={onExplore} onAsk={onAsk}/></section>)}</div>:<div className="participant-groups">{[...new Set(brief.panels.map(panel=>panel.group!))].map(group=>{
        const panels=brief.panels.filter(panel=>panel.group===group),definition=PARTICIPANT_GROUPS[group],rate=panels.find(panel=>panel.metric==='rate')!,value=latest(rate),source=rate.result.sources[0];
        return <section className="participant-group" key={group} data-group={group}><header><div><span className="eyebrow">{geographyLabel(brief.scope.geography!)} · AGES 18–64</span><h2>{definition.label}</h2><p>{definition.description}. All employment sectors.</p></div><span className="participant-date">{value.point?formatDate(value.point.end):'No published value'}</span></header><div className="participant-metrics">{panels.map(panel=>{
          const {point,series}=latest(panel);
          return <article className="participant-metric" key={panel.id} data-metric={panel.metric}><span>{panel.title}</span><strong>{formatValue(point?.value,series?.unit)}</strong>{panel.metric==='rate'&&point?.value!==null&&point?.value!==undefined&&<meter min={0} max={100} value={point.value} aria-label={`${definition.label} employment rate`}/>}<small>{panel.metric==='rate'?'Registered employed / working-age population':'People in this specific population group'}</small><button className="text-button" onClick={()=>onExplore(panel.result,'table')}>Inspect source values <ArrowUpRight size={14}/></button></article>;
        })}</div><div className="participant-source"><a href={source.url} target="_blank" rel="noreferrer">{source.publisher} · Original table <ArrowUpRight size={14}/></a><span>Retrieved {source.retrievedAt?formatDate(source.retrievedAt):'date not recorded'}</span><button className="text-button" onClick={()=>onSources(rate.result)}>Definitions & limitations</button></div><div className="decision-actions"><Button variant="outline" size="sm" onClick={()=>onAsk({...brief.scope,group},rate.result,`Explain the ${definition.label} population context for ${geographyLabel(brief.scope.geography!)}. What do the employment rate and denominator mean?`)}><Sparkles size={14}/>Ask about {definition.label}</Button></div></section>;
      })}</div>}
      <div className="decision-bottom"><section><h2>Read the evidence with care</h2><ul>{brief.limitations.map(text=><li key={text}><Info size={16}/><span>{text}</span></li>)}</ul></section><section><h2>What to check next</h2><p>Questions for your team and partners, rather than conclusions about individual graduates.</p><ul>{brief.nextSteps.map(text=><li key={text}><CheckCircle2 size={16}/><span>{text}</span></li>)}</ul></section></div>
    </>}
  </div>;
}
function PanelActions({panel,onExplore,onAsk}:{panel:DecisionPanel;onExplore:Props['onExplore'];onAsk:Props['onAsk']}){
  return <div className="decision-actions"><Button variant="outline" size="sm" onClick={()=>onExplore(panel.result,panel.view)}>Explore this evidence <ArrowUpRight size={14}/></Button><Button variant="ghost" size="sm" onClick={()=>onAsk(null,panel.result,`Explain this ${panel.title} view, its source and limitations. What further evidence would help a programme decision?`)}><Sparkles size={14}/>Ask about this view</Button></div>;
}
