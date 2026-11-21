'use client';

import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { WORKSPACE_ROUTES, workspaceMode, analysisHref, parseAnalysisSearch, queryIdentity, updateFilterURL, type WorkspaceMode } from '@/lib/workspace-routing';
import { SourceDirectory } from './source-directory';
import {DecisionWorkspace} from './decision-workspace';
import {PARTICIPANT_GROUPS,type DecisionScope} from '@/lib/decision-contracts';
import { Activity, BookOpen, BriefcaseBusiness, Building2, Check, ChevronDown, CircleAlert, CircleHelp, Compass, Database, ExternalLink, FileCheck2, FileText, Filter, GraduationCap, History, Info, Layers3, LoaderCircle, MessageSquare, Plus, Radar, RefreshCw, Search, Send, SlidersHorizontal, Sparkles, Square, Table2, X } from 'lucide-react';
import type { AnalyticsResult, AnalystAnswer, Bootstrap, CatalogItem, ChatEvent, ChatTurn, Evidence, QueryInput, QuerySpec, ViewType } from '@/lib/contracts';
import { Button } from './ui/button';
import {DataLibrary,MarketOverview} from './data-workspace';
import {ExplorerControls,sourceLabel} from './explorer-controls';
import { formatDate, formatValue, geographyLabel, LatestReadout, ResultView } from './result-view';

type Topic = 'skills'|'roles'|'context'|'experience';
type Mode = WorkspaceMode;
const MODE_COPY={opportunities:{title:'From market signals to better programme decisions.',description:'Investigate roles and entry-level signals, with the limits of each source in view.',label:'Graduate opportunities'},participants:{title:'Understand the people behind the programme.',description:'Explore published population and employment context by status group and canton.',label:'Participant context'},sources:{title:'Know where the numbers come from.',description:'Sources, reporting dates, methodology and the limits of this data release.',label:'Sources & coverage'},overview:{title:'The market, from more than one angle.',description:'Read Swiss labour-market signals with their sources, dates and limitations.',label:'Market overview'},library:{title:'All the evidence. Clearly organised.',description:'Discover every approved indicator, from national demand to participant context.',label:'Data library'},explore:{title:'A clearer view of the market.',description:'Explore demand, compare skills, and put the numbers in context.',label:'Market explorer'},analyst:{title:'Good questions. Grounded answers.',description:'Follow a question through the data, the evidence, and the next decision.',label:'AI Analyst'}};
const PROMPTS = [
  {title:'Follow a skill',text:'How has Python changed in the available data?',icon:Activity},
  {title:'Compare the signals',text:'Compare Python with Docker. Explain both counts and shares.',icon:Layers3},
  {title:'Understand the coverage',text:'What data do we have, and how recent is it?',icon:Database},
  {title:'Inform a decision',text:'What should Powercoders check before changing its curriculum?',icon:GraduationCap},
];
function normalized(q:QueryInput):QuerySpec { return {seriesIds:[],mode:'history',measure:'reported',geography:'CH',rankingBy:'value',limit:10,...q}; }
function queryKey(q:QueryInput) { return JSON.stringify(Object.entries(normalized(q)).filter(([,value])=>value!==undefined).sort(([a],[b])=>a.localeCompare(b))); }
async function responseJSON<T>(response:Response):Promise<T> {
  const body=await response.json();
  if(!response.ok)throw new Error(typeof body.error==='string'?body.error:body.error?.message||body.message||'This request could not be completed. Please try again.');
  return body as T;
}

// Bound data/history reads, including the body; the streamed AI request has its own deadline.
async function loadJSON<T>(url:string,init:RequestInit={}):Promise<T> {
  const deadline=AbortSignal.timeout(10_000);
  const signal=init.signal?AbortSignal.any([init.signal,deadline]):deadline;
  try { return await responseJSON<T>(await fetch(url,{cache:'no-store',...init,signal})); }
  catch(error) {
    if(deadline.aborted)throw new Error('Loading took too long. Check your connection and try again.');
    throw error;
  }
}

function useWorkspaceState() {
  const pathname=usePathname(),searchParams=useSearchParams(),router=useRouter();
  const searchKey=searchParams.toString(),mode=workspaceMode(pathname);
  const routeRef=useRef({pathname,searchKey,mode});routeRef.current={pathname,searchKey,mode};
  const libraryURL=useRef<string>('/library');
  if(mode==='library')libraryURL.current=pathname+(searchKey?'?'+searchKey:'');
  const scopeVersion=useRef(0),historyVersion=useRef(0);
  const [bootstrap,setBootstrap]=useState<Bootstrap|null>(null);
  const [loadError,setLoadError]=useState('');
  const [result,setActiveResult]=useState<AnalyticsResult|null>(null);
  const resultRef=useRef<AnalyticsResult|null>(null);
  function setResult(value:AnalyticsResult){resultRef.current=value;setActiveResult(value);}
  const [routeError,setRouteError]=useState('');
  const [query,setQuery]=useState<QuerySpec>(normalized({topic:'skills',measure:'share'}));
  const [queryBusy,setQueryBusy]=useState(false);
  const [navigationVersion,setNavigationVersion]=useState(0);
  const [queryError,setQueryError]=useState('');
  const [sourcesOpen,setSourcesOpen]=useState(false);
  const [sourcesResult,setSourcesResult]=useState<AnalyticsResult|null>(null);
  const [turns,setTurns]=useState<ChatTurn[]>([]);
  const [results,setResults]=useState<Record<string,AnalyticsResult>>({});
  const resultsRef=useRef<Record<string,AnalyticsResult>>({});
  const [evidence,setEvidence]=useState<Evidence[]>([]);
  const [message,setMessage]=useState('');
  const [briefScope,setActiveBriefScope]=useState<DecisionScope|null>(null);
  const [contextBusy,setContextBusy]=useState(false),[contextError,setContextError]=useState('');
  const contextUpdating=useRef(false);
  const briefVersion=useRef(0);
  function setBriefScope(value:DecisionScope|null){briefVersion.current++;setActiveBriefScope(value);}
  const [chatBusy,setChatBusy]=useState(false);
  const [chatStatus,setChatStatus]=useState('');
  const [chatError,setChatError]=useState('');
  const [preferredView,setPreferredView]=useState<ViewType|undefined>();
  const [newChatBusy,setNewChatBusy]=useState(false);
  const [historyReady,setHistoryReady]=useState(false);
  const loadAbort=useRef<AbortController|null>(null);
  const queryAbort=useRef<AbortController|null>(null);
  const pendingQuery=useRef<{location:string;controller:AbortController}|null>(null);
  const chatAbort=useRef<AbortController|null>(null);
  const conversationEnd=useRef<HTMLDivElement|null>(null);
  const composer=useRef<HTMLTextAreaElement|null>(null);

  const linkedAnalysis=(mode==='explore'||mode==='analyst')?parseAnalysisSearch(searchKey):null;
  const effectiveView=linkedAnalysis?.ok&&linkedAnalysis.value.query&&result&&queryIdentity(linkedAnalysis.value.query)===queryIdentity(result.query)?linkedAnalysis.value.view:preferredView;

  function hrefFor(next:Mode) {
    if((next==='explore'||next==='analyst')&&resultRef.current)return analysisHref(next,resultRef.current.query,effectiveView);
    return next==='library'?libraryURL.current:WORKSPACE_ROUTES[next];
  }
  function setMode(next:Mode) {if(next!==routeRef.current.mode)router.push(hrefFor(next));}
  function syncResultURL(value:AnalyticsResult,view?:ViewType,replace=false) {
    const current=routeRef.current;
    if(window.location.pathname!==current.pathname)return;
    if(current.mode==='explore'||current.mode==='analyst')updateFilterURL(analysisHref(current.mode,value.query,view),replace);
  }
  function changeView(view:ViewType) {setPreferredView(view);if(resultRef.current)syncResultURL(resultRef.current,view);}

  const rememberResult=useCallback((value:AnalyticsResult)=>{
    resultsRef.current={...resultsRef.current,[value.id]:value};
    setResults(resultsRef.current);
  },[]);
  const loadConversation=useCallback(async(restoreScope=false,signal?:AbortSignal)=>{
    const revision=scopeVersion.current,briefRevision=briefVersion.current,historyRequest=++historyVersion.current;
    const body=await loadJSON<{turns:ChatTurn[];results:AnalyticsResult[];evidence?:Evidence[];scope?:QueryInput|null;brief?:DecisionScope|null}>('/api/conversation',{signal});
    if(signal?.aborted||historyRequest!==historyVersion.current)return;
    setTurns(body.turns||[]);
    for(const value of body.results||[])rememberResult(value);
    if(body.evidence)setEvidence(body.evidence);
    if(briefRevision===briefVersion.current){
      const linked=parseAnalysisSearch(routeRef.current.searchKey);
      const matches=!routeRef.current.searchKey||(linked.ok&&linked.value.query&&body.scope&&queryIdentity(linked.value.query)===queryIdentity(body.scope));
      if(!restoreScope||!['analyst','explore'].includes(routeRef.current.mode)||matches)setBriefScope(body.brief||null);
    }
    if(restoreScope&&body.scope&&revision===scopeVersion.current&&!((routeRef.current.mode==='explore'||routeRef.current.mode==='analyst')&&routeRef.current.searchKey)){
      let saved=Object.values(resultsRef.current).find(value=>queryKey(value.query)===queryKey(body.scope!));
      if(!saved)saved=await loadJSON<AnalyticsResult>('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body.scope),signal});
      if(signal?.aborted||revision!==scopeVersion.current||historyRequest!==historyVersion.current)return;
      rememberResult(saved);setResult(saved);setQuery(saved.query);setPreferredView(undefined);
    }
    setHistoryReady(true);
  },[rememberResult]);
  const load=useCallback(async()=>{
    loadAbort.current?.abort();const controller=new AbortController();loadAbort.current=controller;
    setLoadError('');
    try {
      const data=await loadJSON<Bootstrap>('/api/bootstrap',{signal:controller.signal});
      if(controller.signal.aborted)return;
      setBootstrap(data);setResult(data.initialResult);setQuery(data.initialResult.query);rememberResult(data.initialResult);
      await loadConversation(true,controller.signal).catch(()=>{if(controller.signal.aborted)return;setHistoryReady(false);setChatError('Conversation history could not be loaded. Retry before continuing an existing conversation.');});
    }catch(error){if(!controller.signal.aborted)setLoadError(error instanceof Error?error.message:'The verified data could not be loaded.');}
  },[loadConversation,rememberResult]);
  useEffect(()=>{void load();return()=>{loadAbort.current?.abort();queryAbort.current?.abort();chatAbort.current?.abort();};},[load]);
  useEffect(()=>{if(mode==='analyst')conversationEnd.current?.scrollIntoView({behavior:'smooth',block:'nearest'});},[turns,chatStatus,mode]);

  async function runQuery(input:QueryInput,options:{fromURL?:boolean;view?:ViewType}={}) {
    if(chatBusy||contextUpdating.current){setQueryError('Wait for the current analysis or stop it in AI Analyst before changing the working view.');return;}
    const request=normalized(input),revision=++scopeVersion.current;
    const location=window.location.pathname+'?'+new URLSearchParams(window.location.search).toString();
    queryAbort.current?.abort();const controller=new AbortController();queryAbort.current=controller;pendingQuery.current={location,controller};
    setQueryBusy(true);setQueryError('');setRouteError('');
    try {
      const chartOnly=!options.fromURL||routeRef.current.mode==='explore';
      const value=await loadJSON<AnalyticsResult>('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json',...(chartOnly?{'X-Radar-Context':'chart'}:{})},body:JSON.stringify(request),signal:controller.signal});
      if(controller.signal.aborted||revision!==scopeVersion.current||location!==window.location.pathname+'?'+new URLSearchParams(window.location.search).toString())return;
      if(options.view&&!value.allowedViews.includes(options.view))throw new Error('This chart type is not available for the linked analysis.');
      if(chartOnly&&value.status==='ok')setBriefScope(null);
      setResult(value);setQuery(value.query);setPreferredView(options.view);rememberResult(value);
      if(!options.fromURL)syncResultURL(value,options.view);
      else if(queryIdentity(value.query)!==queryIdentity(request))syncResultURL(value,options.view,true);
    } catch(error) {
      if(!controller.signal.aborted){const message=error instanceof Error?error.message:'Unable to update this view.';if(options.fromURL)setRouteError(message);else setQueryError(message);}
    } finally {if(pendingQuery.current?.controller===controller)pendingQuery.current=null;if(!controller.signal.aborted)setQueryBusy(false);}
  }
  // URL filters take precedence over the anonymous session's last working scope.
  useEffect(()=>{
    // Native history updates synchronously; ignore an older React URL snapshot.
    if(window.location.pathname!==pathname||new URLSearchParams(window.location.search).toString()!==searchKey)return;
    const location=pathname+'?'+searchKey;
    if(pendingQuery.current?.location===location)return;
    queryAbort.current?.abort();pendingQuery.current=null;setQueryBusy(false);setRouteError('');
    if(!bootstrap||(mode!=='explore'&&mode!=='analyst'))return;
    const parsed=parseAnalysisSearch(searchKey);
    if(!parsed.ok){scopeVersion.current++;setRouteError(parsed.error);return;}
    if(!parsed.value.query)return;
    const current=resultRef.current;
    if(current&&queryIdentity(current.query)===queryIdentity(parsed.value.query)){
      if(parsed.value.view&&!current.allowedViews.includes(parsed.value.view))setRouteError('This chart type is not available for the linked analysis.');
      else setPreferredView(parsed.value.view);
      return;
    }
    void runQuery(parsed.value.query,{fromURL:true,view:parsed.value.view});
    // Reconcile URL filters after navigation and guard rapid back/forward actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[bootstrap,pathname,searchKey,result?.id,navigationVersion]);
  useEffect(()=>{
    if(historyReady&&!searchKey&&(mode==='explore'||mode==='analyst')&&resultRef.current)syncResultURL(resultRef.current,preferredView,true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[historyReady,pathname,searchKey]);
  useEffect(()=>{setSourcesOpen(false);setSourcesResult(null);},[pathname]);
  useEffect(()=>{
    const cancel=()=>{
      const location=window.location.pathname+'?'+new URLSearchParams(window.location.search).toString();
      if(pendingQuery.current&&pendingQuery.current.location!==location){scopeVersion.current++;pendingQuery.current.controller.abort();pendingQuery.current=null;setQueryBusy(false);}
      // Back can return to the previous React snapshot before a pushed URL renders.
      setNavigationVersion(version=>version+1);
    };
    window.addEventListener('popstate',cancel);return()=>window.removeEventListener('popstate',cancel);
  },[]);

  async function openResult(id:string,view?:ViewType,persistScope=true){
    try{
      let value=resultsRef.current[id];
      if(!value){const saved=await responseJSON<{results:AnalyticsResult[]}>(await fetch(`/api/conversation?resultId=${encodeURIComponent(id)}`,{cache:'no-store'}));const found=saved.results?.find(item=>item.id===id);if(!found)throw new Error('This earlier result is no longer available in this conversation.');value=found;rememberResult(value);}
      scopeVersion.current++;queryAbort.current?.abort();pendingQuery.current=null;setQueryBusy(false);
      setResult(value);setQuery(value.query);setPreferredView(view);setQueryError('');setRouteError('');syncResultURL(value,view,!persistScope);
      if(persistScope)await responseJSON<AnalyticsResult>(await fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value.query)}));
    }catch(error){setChatError(error instanceof Error?error.message:'Unable to retrieve the earlier result.');}
  }
  function consumeEvent(event:ChatEvent) {
    if(event.type==='brief')setBriefScope(event.scope);
    if(event.type==='status')setChatStatus(event.message);
    if(event.type==='result'){rememberResult(event.result);if(routeRef.current.mode==='analyst'){setResult(event.result);setQuery(event.result.query);setPreferredView(undefined);syncResultURL(event.result,undefined,true);}}
    if(event.type==='evidence')setEvidence(prev=>[...prev.filter(e=>!event.evidence.some(n=>n.id===e.id)),...event.evidence]);
    if(event.type==='answer'){
      setTurns(prev=>[...prev,{id:event.turnId,role:'assistant',content:event.answer.summary,createdAt:new Date().toISOString(),answer:event.answer,resultIds:[...new Set(event.answer.findings.flatMap(f=>f.resultIds).concat(event.answer.views.map(v=>v.resultId)))]}]);
      const view=event.answer.views[0];if(view&&routeRef.current.mode==='analyst')void openResult(view.resultId,view.type,false);
    }
    if(event.type==='error')setChatError(event.message);
  }
  async function sendMessage(text=message) {
    const value=text.trim();if(!value||chatBusy||contextUpdating.current)return;
    setMode('analyst');
    if(!historyReady){setMessage(value);setChatError('Load the conversation history before continuing, or start a new conversation. This keeps your earlier context intact.');return;}
    if(!bootstrap?.aiAvailable){setMessage(value);setChatError('AI Analyst is not connected yet. You can continue exploring the verified data manually.');return;}
    setMessage('');setChatBusy(true);setChatError('');setChatStatus('Understanding your question…');
    setTurns(prev=>[...prev,{id:-Date.now(),role:'user',content:value,createdAt:new Date().toISOString(),resultIds:[]}]);
    const controller=new AbortController();chatAbort.current=controller;let finished=false;
    try{
      const response=await fetch('/api/analyst',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:value,context:result?.query??null,brief:briefScope}),signal:controller.signal});
      if(!response.ok){await responseJSON(response);return;}
      if(!response.body)throw new Error('The analyst response was interrupted.');
      const reader=response.body.getReader();const decoder=new TextDecoder();let pending='';
      while(true){const {done,value:chunk}=await reader.read();pending+=decoder.decode(chunk,{stream:!done});const lines=pending.split('\n');pending=lines.pop()||'';for(const line of lines){if(!line.trim())continue;const event=JSON.parse(line) as ChatEvent;consumeEvent(event);if(event.type==='answer')finished=true;}if(done)break;}
      if(pending.trim()){const event=JSON.parse(pending) as ChatEvent;consumeEvent(event);if(event.type==='answer')finished=true;}
      if(finished)await loadConversation().catch(()=>undefined);
    }catch(error){setChatError(controller.signal.aborted?'Analysis stopped. Your previous results are still available.':error instanceof Error?error.message:'The analyst could not complete this request.');}
    finally{setChatBusy(false);setChatStatus('');chatAbort.current=null;}
  }
  async function newConversation(){if(chatBusy||contextUpdating.current)return;historyVersion.current++;setNewChatBusy(true);setChatError('');try{await responseJSON(await fetch('/api/conversation',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));setTurns([]);setEvidence([]);setBriefScope(null);resultsRef.current=result?{[result.id]:result}:{};setResults(resultsRef.current);setMessage('');setHistoryReady(true);}catch(error){setChatError(error instanceof Error?error.message:'Unable to start a new conversation.');}finally{setNewChatBusy(false);}}
  function askAboutView(){setMode('analyst');setMessage('Explain this view. What can we conclude, and what should we be careful about?');setTimeout(()=>composer.current?.focus(),50);}

  async function selectContext(scope:DecisionScope|null,input?:QueryInput,onSaved?:(value:AnalyticsResult|null)=>void){
    if(contextUpdating.current)return;
    if(chatBusy){setContextError('AI Analyst is answering. Wait or stop the analysis before changing its context.');return;}
    contextUpdating.current=true;setContextBusy(true);setContextError('');briefVersion.current++;
    try{
      const saved=await loadJSON<{brief:DecisionScope|null;result:AnalyticsResult|null}>('/api/conversation',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({brief:scope,context:input})});
      setBriefScope(saved.brief);
      if(saved.result){scopeVersion.current++;queryAbort.current?.abort();pendingQuery.current=null;setQueryBusy(false);rememberResult(saved.result);setResult(saved.result);setQuery(saved.result.query);}
      onSaved?.(saved.result);
    }catch(error){setContextError(error instanceof Error?error.message:'The selected context could not be saved. Please try again.');}
    finally{contextUpdating.current=false;setContextBusy(false);}
  }
  function clearBriefContext(){void selectContext(null);}
  function openCatalogItem(item:CatalogItem){void selectContext(null,{seriesIds:[item.id],topic:item.topic,sourceId:item.sourceId,geography:item.geography,measure:'reported',mode:'history'},value=>{if(value)router.push(analysisHref('explore',value.query));});}
  function openOverviewResult(value:AnalyticsResult){openDecisionResult(value);}
  function prepareQuestion(value:string){setMode('analyst');setMessage(value);setTimeout(()=>composer.current?.focus(),50);}

  function openDecisionResult(value:AnalyticsResult,view?:ViewType){void selectContext(null,value.query,saved=>{if(saved){setPreferredView(view);router.push(analysisHref('explore',saved.query,view));}});}
  function askDecision(scope:DecisionScope|null,value:AnalyticsResult,text:string){
    void selectContext(scope,value.query,saved=>{if(saved){const view=saved.query.mode==='snapshot'?'metric_cards':undefined;setPreferredView(view);setMessage(text);router.push(analysisHref('analyst',saved.query,view));}});
  }

  const userTurns=turns.filter(t=>t.role==='user').length;
  const activeView:ViewType=effectiveView||(result?.query.mode==='ranking'||result?.query.mode==='snapshot'?'bar':'line');
  const topic=(bootstrap?.catalog.find(c=>c.id===query.seriesIds[0]||(!query.seriesIds.length&&c.sourceId===query.sourceId&&(!query.metric||c.metric===query.metric)))?.topic||query.topic||'skills') as Topic;

  return {briefScope,clearBriefContext,contextBusy,contextError,openDecisionResult,askDecision,bootstrap,loadError,mode,result,query,queryBusy,queryError,routeError,sourcesOpen,sourcesResult,turns,results,evidence,message,chatBusy,chatStatus,chatError,preferredView:effectiveView,newChatBusy,historyReady,conversationEnd,composer,userTurns,activeView,topic,setMessage,setChatError,setSourcesOpen,setSourcesResult,setMode,hrefFor,load,loadConversation,runQuery,openResult,sendMessage,newConversation,askAboutView,openCatalogItem,openOverviewResult,prepareQuestion,changeView,chatAbort,syncResultURL};
}

const WorkspaceContext=createContext<ReturnType<typeof useWorkspaceState>|null>(null);
function useWorkspace(){const value=useContext(WorkspaceContext);if(!value)throw new Error("Workspace layout is missing.");return value;}

export default function MarketRadar({children}:{children:React.ReactNode}){const workspace=useWorkspaceState();return <WorkspaceContext.Provider value={workspace}><WorkspaceShell>{children}</WorkspaceShell></WorkspaceContext.Provider>;}

function WorkspaceShell({children}:{children:React.ReactNode}){
  const {contextBusy,contextError,bootstrap,loadError,mode,result,routeError,sourcesOpen,sourcesResult,preferredView,setSourcesOpen,setSourcesResult,setMode,hrefFor,load,syncResultURL}=useWorkspace();
  return <div className="app-shell">
    <header className="brand-header"><Link className="brand-lockup" href="/overview" aria-label="Powercoders Market Radar home"><img src="/powercoders-logo.svg" alt="Powercoders" width="553" height="65"/><span className="brand-divider" aria-hidden="true"/><span className="product-name">Market Radar</span></Link><span className="brand-purpose">Swiss IT market intelligence</span></header>
    <aside className="sidebar">
      <div className="sidebar-nav"><span className="nav-label">WORKSPACE</span><Link className={`nav-item ${mode==='overview'?'active':''}`} aria-label="Market overview" aria-current={mode==='overview'?'page':undefined} href={hrefFor('overview')}><Activity size={19}/><span>Market overview</span></Link><Link className={`nav-item ${mode==='opportunities'?'active':''}`} aria-label="Graduate opportunities" aria-current={mode==='opportunities'?'page':undefined} href="/opportunities"><GraduationCap size={19}/><span>Graduate opportunities</span></Link><Link className={`nav-item ${mode==='participants'?'active':''}`} aria-label="Participant context" aria-current={mode==='participants'?'page':undefined} href="/participants"><Building2 size={19}/><span>Participant context</span></Link><Link className={`nav-item ${mode==='library'?'active':''}`} aria-label="Data library" aria-current={mode==='library'?'page':undefined} href={hrefFor('library')}><Database size={19}/><span>Data library</span></Link><Link className={`nav-item ${mode==='explore'?'active':''}`} aria-label="Explore the market" aria-current={mode==='explore'?'page':undefined} href={hrefFor('explore')}><Compass size={19}/><span>Explore the market</span></Link><Link className={`nav-item ${mode==='analyst'?'active':''}`} aria-label="AI Analyst" aria-current={mode==='analyst'?'page':undefined} href={hrefFor('analyst')}><Sparkles size={19}/><span>AI Analyst</span><span className="nav-mini-badge">AI</span></Link><Link className={`nav-item ${mode==='sources'?'active':''}`} aria-label="Sources and coverage" aria-current={mode==='sources'?'page':undefined} href="/sources"><BookOpen size={19}/><span>Sources & coverage</span></Link></div>
      <div className="sidebar-bottom"><div className="sidebar-note"><span className="sidebar-note-icon"><FileCheck2 size={19}/></span><strong>Evidence comes first.</strong><p>Every chart starts with verified data. Every conclusion keeps its source.</p></div><div className="workspace-person"><div><strong>Powercoders</strong><span>Workspace</span></div></div></div>
    </aside>
    <main className="main-shell"><header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>{MODE_COPY[mode].label}</strong></div><div className="topbar-right"><span className="verified-label"><FileCheck2 size={15}/>Verified data</span></div></header>
      {!bootstrap||!result?<div className="initial-state">{loadError?<><CircleAlert size={32}/><h1>We couldn’t load the workspace</h1><p>{loadError}</p><Button onClick={()=>void load()}><RefreshCw size={16}/>Try again</Button></>:<><span className="loading-radar"><Radar size={42}/></span><h1>Opening your market workspace</h1><p>Loading verified indicators and their sources…</p><div className="skeleton-row"><span/><span/><span/></div></>}</div>:<>
      <section className="page-heading"><div><div className="eyebrow">YOUR SWISS IT MARKET WORKSPACE</div><h1>{MODE_COPY[mode].title}</h1><p>{MODE_COPY[mode].description}</p></div><div className="heading-switch segmented"><button className={mode==='explore'?'selected':''} onClick={()=>setMode('explore')} aria-pressed={mode==='explore'}><SlidersHorizontal size={16}/>Explore</button><button className={mode==='analyst'?'selected':''} onClick={()=>setMode('analyst')} aria-pressed={mode==='analyst'}><Sparkles size={16}/>AI Analyst</button></div></section>
      {routeError&&<div className="notice notice-error" role="alert"><CircleAlert size={18}/><div><strong>This analysis link could not be opened.</strong><p>{routeError} The previous verified view remains available.</p><button className="text-button" onClick={()=>syncResultURL(result,preferredView,true)}>Use the current verified view</button></div></div>}
      {contextBusy&&<div className="notice" role="status"><LoaderCircle className="spin" size={16}/>Saving the selected context…</div>}
      {contextError&&<div className="notice notice-error" role="alert"><CircleAlert size={16}/>{contextError}</div>}
      {children}
      <footer className="workspace-footer"><span>Market Radar <span>·</span> Built for informed programme decisions</span><Link className="text-button" href="/sources">Data coverage & methodology <CircleHelp size={13}/></Link></footer>
      <SourcesDrawer open={sourcesOpen} onClose={()=>{setSourcesOpen(false);setSourcesResult(null);}} result={sourcesResult||result} catalog={bootstrap.catalog} release={bootstrap.release} onLibrary={()=>{setSourcesOpen(false);setMode('library');}}/>
      </>}
    </main>
  </div>;
}

export function OverviewScreen(){
  const {bootstrap,result,setSourcesOpen,setSourcesResult,setMode,openOverviewResult,prepareQuestion}=useWorkspace();
  if(!bootstrap||!result)return null;
  return <><div className="decision-entry"><Link href="/opportunities"><strong>Graduate opportunities →</strong><span>Investigate roles, junior signals and the evidence needed for programme decisions.</span></Link><Link href="/participants"><strong>Participant context →</strong><span>Understand SEM population and employment figures by status group and canton.</span></Link></div><MarketOverview inventory={bootstrap.inventory} panels={bootstrap.marketOverview} onOpen={openOverviewResult} onSources={value=>{setSourcesResult(value);setSourcesOpen(true);}} onLibrary={()=>setMode('library')} onAsk={prepareQuestion}/></>;
}

export function LibraryScreen(){
  const {bootstrap,result,openCatalogItem,prepareQuestion}=useWorkspace();
  if(!bootstrap||!result)return null;
  return <DataLibrary catalog={bootstrap.catalog} inventory={bootstrap.inventory} onOpen={openCatalogItem} onAsk={prepareQuestion}/>;
}

export function ExploreScreen(){
  const {bootstrap,result,query,queryBusy,queryError,preferredView,topic,setMessage,setSourcesOpen,setMode,runQuery,askAboutView,changeView}=useWorkspace();
  if(!bootstrap||!result)return null;
  return <><div className="workspace-data-access"><Database size={16}/><span>ITBoard · Eurostat · BFS · SECO · SEM · regional sources</span><Link className="text-button" href="/library">Browse all {bootstrap.inventory.counts.series} indicators</Link></div>
        <ExplorerControls catalog={bootstrap.catalog} query={query} topic={topic} busy={queryBusy} onQuery={runQuery} onLibrary={()=>setMode('library')}/>
        {queryError&&<div className="notice notice-error" role="alert"><CircleAlert size={17}/><div><strong>This selection could not be applied.</strong><p>{queryError} The chart below retains the previous verified result.</p></div></div>}
        <div className="explore-grid"><div className="explore-main"><ResultView result={result} busy={queryBusy} onSources={()=>setSourcesOpen(true)} preferredView={preferredView} onViewChange={changeView}/></div><aside className="insight-column"><section className="side-card snapshot-card"><div className="eyebrow">LATEST IN THIS VIEW</div><h3>The numbers, in context</h3><LatestReadout result={result}/><div className="sample-note"><Info size={15}/><p>{result.series.every(series=>series.sourceId==='itboard_monitor_csv')?'These are observations in the source sample. Changes can also reflect platform coverage.':'Read each indicator with its own population, reporting period and definition.'}</p></div></section><section className="ask-card"><span className="ask-icon"><Sparkles size={20}/></span><h3>Take the next question.</h3><p>Your analyst can explain this view, compare indicators, or help identify what’s missing.</p><Button onClick={askAboutView}><Sparkles size={16}/>Ask about this view</Button><button className="text-button" onClick={()=>{setMode('analyst');setMessage('What data do we have, and how recent is it?');}}>Explore what the data can answer</button></section></aside></div>
</>;
}

export function AnalystScreen(){
  const {briefScope,clearBriefContext,contextBusy,bootstrap,result,query,turns,results,evidence,message,chatBusy,chatStatus,chatError,preferredView,newChatBusy,conversationEnd,composer,userTurns,activeView,setMessage,setChatError,setSourcesOpen,setMode,loadConversation,openResult,sendMessage,newConversation,changeView,chatAbort}=useWorkspace();
  if(!bootstrap||!result)return null;
  return <><div className="workspace-data-access"><Database size={16}/><span>ITBoard · Eurostat · BFS · SECO · SEM · regional sources</span><Link className="text-button" href="/library">Browse all {bootstrap.inventory.counts.series} indicators</Link></div>
        {!bootstrap.aiAvailable&&<div className="notice notice-setup"><Info size={18}/><div><strong>Your analyst is ready for an API connection.</strong><p>AI conversations will be available once the server connection is configured. All manual data exploration remains available.</p></div><Button variant="outline" size="sm" onClick={()=>setMode('explore')}>Keep exploring</Button></div>}
        {briefScope&&<div className="decision-context"><BookOpen size={16}/><span>Decision context: {briefScope.kind==='opportunities'?'Graduate opportunities':`Participant context · ${briefScope.group==='all'?'All groups, separately':PARTICIPANT_GROUPS[briefScope.group as keyof typeof PARTICIPANT_GROUPS]?.label}`} · {geographyLabel(briefScope.geography||'CH')}{briefScope.role?` · ${bootstrap.catalog.find(item=>item.id===briefScope.role)?.label||'Selected role'}`:''}</span><button className="text-button" disabled={contextBusy||chatBusy} onClick={clearBriefContext}>Use chart only</button></div>}
        <div className="analyst-layout"><section className="conversation-card"><div className="conversation-header"><div><span className="analyst-avatar"><Sparkles size={18}/></span><div><h2>AI Analyst</h2><span>Evidence-led, question by question</span></div></div><Button size="icon" variant="ghost" disabled={chatBusy||newChatBusy} onClick={()=>void newConversation()} title="Start a new conversation" aria-label="Start a new conversation">{newChatBusy?<LoaderCircle size={17} className="spin"/>:<Plus size={18}/>}</Button></div>
          <div className="context-strip"><History size={14}/><span>{userTurns?`${userTurns} ${userTurns===1?'question':'questions'} in this conversation`:'Context for 20+ follow-up questions'}</span><span className="context-scope">{geographyLabel(result.query.geography)}</span></div>
          <div className="conversation-body" aria-live="polite" aria-relevant="additions text">
            {turns.length===0?<div className="conversation-welcome"><div className="welcome-symbol"><Sparkles size={25}/></div><h3>Where would you like to begin?</h3><p>Ask in your own words. I can find relevant data, compare it, and show the evidence.</p><div className="prompt-grid">{PROMPTS.map(prompt=><button key={prompt.title} onClick={()=>{setMessage(prompt.text);composer.current?.focus();}}><prompt.icon size={18}/><strong>{prompt.title}</strong><span>{prompt.text}</span></button>)}</div><div className="welcome-footnote"><Database size={14}/>Answers use the verified data catalog, with its limits.</div></div>:turns.map(turn=>turn.role==='user'?<div className="message-user" key={turn.id}><div className="message-author">You</div><div>{turn.content}</div></div>:<AssistantMessage key={turn.id} turn={turn} results={results} evidence={evidence} activeResultId={result.id} activeView={activeView} onView={openResult}/>)}
            {chatBusy&&<div className="analyst-working" role="status"><span className="analyst-avatar"><Sparkles size={16}/></span><div><strong>Working with the data</strong><span><LoaderCircle size={13} className="spin"/>{chatStatus||'Preparing your answer…'}</span></div></div>}
            {chatError&&<div className="chat-error" role="alert"><CircleAlert size={16}/><div>{chatError}<button className="text-button" onClick={()=>void loadConversation(true).then(()=>setChatError('')).catch(()=>setChatError('Conversation history is still unavailable. Please try again.'))}>Reload conversation</button></div></div>}
            <div ref={conversationEnd}/>
          </div>
          <form className="composer" onSubmit={(event:FormEvent)=>{event.preventDefault();void sendMessage();}}><label className="sr-only" htmlFor="analyst-question">Ask the AI Analyst</label><textarea ref={composer} id="analyst-question" placeholder={turns.length?'Ask a follow-up…':'Ask anything about the available market data…'} value={message} onChange={e=>setMessage(e.target.value)} maxLength={4000} rows={2} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void sendMessage();}}}/><div className="composer-bottom"><span><Layers3 size={13}/>Current view included</span>{chatBusy?<Button type="button" size="sm" variant="outline" onClick={()=>chatAbort.current?.abort()}><Square size={12}/>Stop</Button>:<Button type="submit" size="sm" disabled={contextBusy||!message.trim()||!bootstrap.aiAvailable}><Send size={15}/>Ask analyst</Button>}</div></form>
        </section><div className="analyst-canvas"><div className="canvas-heading"><div><span className="eyebrow">CONNECTED WORKSPACE</span><h3>Your working view</h3></div><Button variant="outline" size="sm" onClick={()=>setMode('explore')}><SlidersHorizontal size={14}/>Explore this view</Button></div><div className="scope-chips"><span><span className="swiss-mini">+</span>{geographyLabel(result.query.geography)}</span><span>{result.query.measure==='share'?'Share / rate':result.query.measure==='count'?'Count':'Reported values'}</span>{result.series.slice(0,3).map(s=><span key={s.id}>{s.label}</span>)}</div><ResultView result={result} onSources={()=>setSourcesOpen(true)} compact preferredView={preferredView} onViewChange={changeView}/><div className="connected-note"><FileCheck2 size={16}/><p>Charts and answers use the same verified results. Open any referenced view in the conversation to revisit it.</p></div>{turns.length>0&&!chatBusy&&<div className="followup-suggestions"><span>Keep exploring</span>{(briefScope?.kind==='participants'||result.series.some(series=>series.id.startsWith('sem_'))?['What about Bern canton?','What does the denominator include?','Can we see a trend?']:briefScope?.kind==='opportunities'?['What do we know about junior roles?','Which skills can we verify?','What should we check with employers?']:query.topic==='skills'||result.series.some(series=>series.id.includes('python'))?['Compare with Docker.','What are the limitations?','And for junior roles?']:['What are the limitations?','What changed over time?','Which other sources add context?']).map(text=><button key={text} onClick={()=>void sendMessage(text)} disabled={!bootstrap.aiAvailable}>{text}</button>)}</div>}</div></div>
</>;
}

export function DecisionScreen({kind}:{kind:DecisionScope['kind']}){
  const {bootstrap,openDecisionResult,askDecision,setSourcesOpen,setSourcesResult}=useWorkspace();
  if(!bootstrap)return null;
  return <DecisionWorkspace kind={kind} catalog={bootstrap.catalog} onExplore={openDecisionResult} onAsk={askDecision} onSources={result=>{setSourcesResult(result);setSourcesOpen(true);}}/>;
}

export function SourcesScreen(){
  const {bootstrap,result}=useWorkspace();
  if(!bootstrap||!result)return null;
  return <SourceDirectory inventory={bootstrap.inventory}/>;
}

function OverviewCard({label,value,caption,icon,asOf}:{label:string;value:number;caption:string;icon:React.ReactNode;asOf:string}){
  return <div className="overview-card"><div className="overview-top"><span>{label}</span><span className="overview-icon">{icon}</span></div><div className="overview-value">{formatValue(value)}</div><div className="overview-caption">{caption}</div><div className="overview-meta"><span>ITBoard</span><span>{formatDate(asOf)}</span></div></div>;
}

function AssistantMessage({turn,results,evidence,activeResultId,activeView,onView}:{turn:ChatTurn;results:Record<string,AnalyticsResult>;evidence:Evidence[];activeResultId:string;activeView:ViewType;onView:(id:string,type?:ViewType)=>void}){
  const answer=turn.answer;
  return <article className="message-assistant"><div className="message-author"><span className="analyst-avatar small"><Sparkles size={13}/></span>Market Radar<span>AI Analyst</span></div>{turn.error?<div className="notice notice-error">{turn.content}</div>:<><p className="answer-summary">{answer?.summary||turn.content}</p>{answer?.findings.length? <div className="findings-list">{answer.findings.map((finding,index)=><div className="finding" key={index}><span className="finding-marker"/><div><p>{finding.text}</p><div className="finding-citations">{finding.resultIds.map(id=><button key={id} onClick={()=>onView(id)} title={results[id]?.title||'Retrieve earlier evidence'}><Activity size={12}/>View evidence</button>)}{finding.evidenceIds.map(id=>evidence.find(e=>e.id===id)).filter((item):item is Evidence=>!!item).map(item=><a key={item.id} href={item.url} target="_blank" rel="noreferrer"><FileText size={12}/>{item.title}<ExternalLink size={10}/></a>)}</div></div></div>)}</div>:null}
    {!!answer?.views.length&&<div className="answer-views">{answer.views.map((view,index)=><button className={view.resultId===activeResultId&&view.type===activeView?'active':''} aria-pressed={view.resultId===activeResultId&&view.type===activeView} key={`${view.resultId}-${index}`} onClick={()=>onView(view.resultId,view.type)}><Activity size={15}/><span>{view.title}</span>{view.resultId===activeResultId&&view.type===activeView&&<Check size={14}/>}</button>)}</div>}
    {!!answer?.limitations.length&&<details className="answer-limits"><summary><CircleHelp size={14}/>What this does — and doesn’t — tell us</summary><ul>{answer.limitations.map((limit,index)=><li key={index}>{limit}</li>)}</ul></details>}
    {!!answer?.actions.length&&<div className="answer-actions"><span className="eyebrow">POSSIBLE NEXT STEPS</span><ul>{answer.actions.map((action,index)=><li key={index}>{action}</li>)}</ul></div>}
    {answer?.clarification&&<div className="answer-clarification"><MessageSquare size={16}/><p>{answer.clarification}</p></div>}
    {!!answer?.views.length&&!answer.views.some(v=>v.resultId===activeResultId)&&<small className="saved-view-note">This answer keeps its original evidence. Select a referenced view to revisit it.</small>}
  </>}</article>;
}

function SourcesDrawer({open,onClose,result,catalog,release,onLibrary}:{open:boolean;onClose:()=>void;result:AnalyticsResult;catalog:CatalogItem[];release:string;onLibrary:()=>void}){
  const dialog=useRef<HTMLDialogElement|null>(null);
  useEffect(()=>{if(open&&!dialog.current?.open)dialog.current?.showModal();else if(!open&&dialog.current?.open)dialog.current.close();},[open]);
  const publishers=[...new Map(catalog.map(c=>[c.sourceId,c])).values()];
  const uniqueLimits=[...new Set([...result.limitations,...result.series.flatMap(s=>s.limitations)])];
  return <dialog ref={dialog} className="sources-drawer" onClose={onClose} onClick={e=>{if(e.target===dialog.current)onClose();}} aria-labelledby="sources-title"><div className="drawer-inner"><div className="drawer-header"><div><div className="eyebrow">BEHIND THE NUMBERS</div><h2 id="sources-title">Sources & coverage</h2></div><Button size="icon" variant="ghost" onClick={onClose} aria-label="Close sources panel"><X size={20}/></Button></div><p className="drawer-intro">Check the origin, population and reporting period of the current view.</p><div className="drawer-section-title">Sources for this view</div>{result.sources.map(source=><article className="source-card" key={source.id}><div className="source-card-icon"><BookOpen size={19}/></div><div><span className="source-publisher">{source.publisher}</span><h3>{source.title}</h3><p>{source.coverage}</p><dl>{source.publishedAt&&<><dt>Published</dt><dd>{formatDate(source.publishedAt)}</dd></>}{source.retrievedAt&&<><dt>Retrieved</dt><dd>{formatDate(source.retrievedAt)}</dd></>}<dt>Reuse</dt><dd>{source.license}</dd></dl><a className="source-link" href={source.url} target="_blank" rel="noreferrer">Open original source<ExternalLink size={13}/></a></div></article>)}<div className="drawer-section-title">Read this analysis with care</div><ul className="drawer-limitations">{uniqueLimits.map((limit,index)=><li key={index}>{limit}</li>)}</ul><div className="drawer-section-title">Available in the verified catalog</div><Button variant="outline" onClick={onLibrary}><Database size={16}/>Explore the full data library</Button><div className="catalog-summary"><strong>{catalog.length}</strong><span>published indicator series<br/>National and explicit regional slices</span></div><div className="catalog-publishers">{publishers.map(publisher=><div key={publisher.sourceId}><span>{sourceLabel(publisher)}</span><span>{catalog.filter(c=>c.sourceId===publisher.sourceId).length} series</span></div>)}</div><p className="drawer-release">Data release {release}. Observation dates vary by source. Research-only records are excluded from this workspace.</p></div></dialog>;
}
