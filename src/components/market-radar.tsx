'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Activity, BookOpen, BriefcaseBusiness, Building2, Check, ChevronDown, CircleAlert, CircleHelp, Compass, Database, ExternalLink, FileCheck2, FileText, Filter, GraduationCap, History, Info, Layers3, LoaderCircle, MessageSquare, Plus, Radar, RefreshCw, Search, Send, SlidersHorizontal, Sparkles, Square, Table2, X } from 'lucide-react';
import type { AnalyticsResult, AnalystAnswer, Bootstrap, CatalogItem, ChatEvent, ChatTurn, Evidence, QueryInput, QuerySpec, ViewType } from '@/lib/contracts';
import { Button } from './ui/button';
import {DataLibrary,MarketOverview} from './data-workspace';
import {ExplorerControls,sourceLabel} from './explorer-controls';
import { formatDate, formatValue, geographyLabel, LatestReadout, ResultView } from './result-view';

type Topic = 'skills'|'roles'|'context'|'experience';
type Mode = 'overview'|'library'|'explore'|'analyst';
const MODE_COPY={overview:{title:'The market, from more than one angle.',description:'Read Swiss labour-market signals with their sources, dates and limitations.',label:'Market overview'},library:{title:'All the evidence. Clearly organised.',description:'Discover every approved indicator, from national demand to participant context.',label:'Data library'},explore:{title:'A clearer view of the market.',description:'Explore demand, compare skills, and put the numbers in context.',label:'Market explorer'},analyst:{title:'Good questions. Grounded answers.',description:'Follow a question through the data, the evidence, and the next decision.',label:'AI Analyst'}};
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

export default function MarketRadar() {
  const [bootstrap,setBootstrap]=useState<Bootstrap|null>(null);
  const [loadError,setLoadError]=useState('');
  const [mode,setMode]=useState<Mode>('overview');
  const [result,setResult]=useState<AnalyticsResult|null>(null);
  const [query,setQuery]=useState<QuerySpec>(normalized({topic:'skills',measure:'share'}));
  const [queryBusy,setQueryBusy]=useState(false);
  const [queryError,setQueryError]=useState('');
  const [sourcesOpen,setSourcesOpen]=useState(false);
  const [sourcesResult,setSourcesResult]=useState<AnalyticsResult|null>(null);
  const [turns,setTurns]=useState<ChatTurn[]>([]);
  const [results,setResults]=useState<Record<string,AnalyticsResult>>({});
  const resultsRef=useRef<Record<string,AnalyticsResult>>({});
  const [evidence,setEvidence]=useState<Evidence[]>([]);
  const [message,setMessage]=useState('');
  const [chatBusy,setChatBusy]=useState(false);
  const [chatStatus,setChatStatus]=useState('');
  const [chatError,setChatError]=useState('');
  const [preferredView,setPreferredView]=useState<ViewType|undefined>();
  const [newChatBusy,setNewChatBusy]=useState(false);
  const [historyReady,setHistoryReady]=useState(false);
  const queryAbort=useRef<AbortController|null>(null);
  const chatAbort=useRef<AbortController|null>(null);
  const conversationEnd=useRef<HTMLDivElement|null>(null);
  const composer=useRef<HTMLTextAreaElement|null>(null);

  const rememberResult=useCallback((value:AnalyticsResult)=>{
    resultsRef.current={...resultsRef.current,[value.id]:value};
    setResults(resultsRef.current);
  },[]);
  const loadConversation=useCallback(async(restoreScope=false)=>{
    const body=await responseJSON<{turns:ChatTurn[];results:AnalyticsResult[];evidence?:Evidence[];scope?:QueryInput|null}>(await fetch('/api/conversation',{cache:'no-store'}));
    setTurns(body.turns||[]);
    for(const value of body.results||[])rememberResult(value);
    if(body.evidence)setEvidence(body.evidence);
    if(restoreScope&&body.scope){
      let saved=Object.values(resultsRef.current).find(value=>queryKey(value.query)===queryKey(body.scope!));
      if(!saved)saved=await responseJSON<AnalyticsResult>(await fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body.scope)}));
      rememberResult(saved);setResult(saved);setQuery(saved.query);setPreferredView(undefined);
    }
    setHistoryReady(true);
  },[rememberResult]);
  const load=useCallback(async()=>{
    setLoadError('');
    try {
      const data=await responseJSON<Bootstrap>(await fetch('/api/bootstrap',{cache:'no-store'}));
      setBootstrap(data);setResult(data.initialResult);setQuery(data.initialResult.query);rememberResult(data.initialResult);
      await loadConversation(true).catch(()=>{setHistoryReady(false);setChatError('Conversation history could not be loaded. Retry before continuing an existing conversation.');});
    }catch(error){setLoadError(error instanceof Error?error.message:'The verified data could not be loaded.');}
  },[loadConversation,rememberResult]);
  useEffect(()=>{void load();return()=>{queryAbort.current?.abort();chatAbort.current?.abort();};},[load]);
  useEffect(()=>{if(mode==='analyst')conversationEnd.current?.scrollIntoView({behavior:'smooth',block:'nearest'});},[turns,chatStatus,mode]);

  async function runQuery(input:QueryInput) {
    const request=normalized(input);queryAbort.current?.abort();const controller=new AbortController();queryAbort.current=controller;
    setQueryBusy(true);setQueryError('');setPreferredView(undefined);
    try { const value=await responseJSON<AnalyticsResult>(await fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:controller.signal}));if(controller.signal.aborted)return;setResult(value);setQuery(value.query);rememberResult(value); }
    catch(error){if(!controller.signal.aborted)setQueryError(error instanceof Error?error.message:'Unable to update this view.');}
    finally{if(!controller.signal.aborted)setQueryBusy(false);}
  }
  async function openResult(id:string,view?:ViewType,persistScope=true){
    try{
      let value=resultsRef.current[id];
      if(!value){const saved=await responseJSON<{results:AnalyticsResult[]}>(await fetch(`/api/conversation?resultId=${encodeURIComponent(id)}`,{cache:'no-store'}));const found=saved.results?.find(item=>item.id===id);if(!found)throw new Error('This earlier result is no longer available in this conversation.');value=found;rememberResult(value);}
      setResult(value);setQuery(value.query);setPreferredView(view);setQueryError('');
      if(persistScope)await responseJSON<AnalyticsResult>(await fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value.query)}));
    }catch(error){setChatError(error instanceof Error?error.message:'Unable to retrieve the earlier result.');}
  }
  function consumeEvent(event:ChatEvent) {
    if(event.type==='status')setChatStatus(event.message);
    if(event.type==='result'){rememberResult(event.result);setResult(event.result);setQuery(event.result.query);setPreferredView(undefined);}
    if(event.type==='evidence')setEvidence(prev=>[...prev.filter(e=>!event.evidence.some(n=>n.id===e.id)),...event.evidence]);
    if(event.type==='answer'){
      setTurns(prev=>[...prev,{id:event.turnId,role:'assistant',content:event.answer.summary,createdAt:new Date().toISOString(),answer:event.answer,resultIds:[...new Set(event.answer.findings.flatMap(f=>f.resultIds).concat(event.answer.views.map(v=>v.resultId)))]}]);
      const view=event.answer.views[0];if(view)void openResult(view.resultId,view.type,false);
    }
    if(event.type==='error')setChatError(event.message);
  }
  async function sendMessage(text=message) {
    const value=text.trim();if(!value||chatBusy)return;
    setMode('analyst');
    if(!historyReady){setMessage(value);setChatError('Load the conversation history before continuing, or start a new conversation. This keeps your earlier context intact.');return;}
    if(!bootstrap?.aiAvailable){setMessage(value);setChatError('AI Analyst is not connected yet. You can continue exploring the verified data manually.');return;}
    setMessage('');setChatBusy(true);setChatError('');setChatStatus('Understanding your question…');
    setTurns(prev=>[...prev,{id:-Date.now(),role:'user',content:value,createdAt:new Date().toISOString(),resultIds:[]}]);
    const controller=new AbortController();chatAbort.current=controller;let finished=false;
    try{
      const response=await fetch('/api/analyst',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:value,context:result?.query??null}),signal:controller.signal});
      if(!response.ok){await responseJSON(response);return;}
      if(!response.body)throw new Error('The analyst response was interrupted.');
      const reader=response.body.getReader();const decoder=new TextDecoder();let pending='';
      while(true){const {done,value:chunk}=await reader.read();pending+=decoder.decode(chunk,{stream:!done});const lines=pending.split('\n');pending=lines.pop()||'';for(const line of lines){if(!line.trim())continue;const event=JSON.parse(line) as ChatEvent;consumeEvent(event);if(event.type==='answer')finished=true;}if(done)break;}
      if(pending.trim()){const event=JSON.parse(pending) as ChatEvent;consumeEvent(event);if(event.type==='answer')finished=true;}
      if(finished)await loadConversation().catch(()=>undefined);
    }catch(error){setChatError(controller.signal.aborted?'Analysis stopped. Your previous results are still available.':error instanceof Error?error.message:'The analyst could not complete this request.');}
    finally{setChatBusy(false);setChatStatus('');chatAbort.current=null;}
  }
  async function newConversation(){if(chatBusy)return;setNewChatBusy(true);setChatError('');try{await responseJSON(await fetch('/api/conversation',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));setTurns([]);setEvidence([]);resultsRef.current=result?{[result.id]:result}:{};setResults(resultsRef.current);setMessage('');setHistoryReady(true);}catch(error){setChatError(error instanceof Error?error.message:'Unable to start a new conversation.');}finally{setNewChatBusy(false);}}
  function askAboutView(){setMode('analyst');setMessage('Explain this view. What can we conclude, and what should we be careful about?');setTimeout(()=>composer.current?.focus(),50);}

  function openCatalogItem(item:CatalogItem){setMode('explore');void runQuery({seriesIds:[item.id],topic:item.topic,sourceId:item.sourceId,geography:item.geography,measure:'reported',mode:'history'});}
  function openOverviewResult(value:AnalyticsResult){rememberResult(value);setMode('explore');void runQuery(value.query);}
  function prepareQuestion(value:string){setMode('analyst');setMessage(value);setTimeout(()=>composer.current?.focus(),50);}

  const userTurns=turns.filter(t=>t.role==='user').length;
  const activeView:ViewType=preferredView||(result?.query.mode==='ranking'||result?.query.mode==='snapshot'?'bar':'line');
  const topic=(bootstrap?.catalog.find(c=>c.id===query.seriesIds[0]||(!query.seriesIds.length&&c.sourceId===query.sourceId&&(!query.metric||c.metric===query.metric)))?.topic||query.topic||'skills') as Topic;

  return <div className="app-shell">
    <header className="brand-header"><a className="brand-lockup" href="/" aria-label="Powercoders Market Radar home"><img src="/powercoders-logo.svg" alt="Powercoders" width="553" height="65"/><span className="brand-divider" aria-hidden="true"/><span className="product-name">Market Radar</span></a><span className="brand-purpose">Swiss IT market intelligence</span></header>
    <aside className="sidebar">
      <div className="sidebar-nav"><span className="nav-label">WORKSPACE</span><button className={`nav-item ${mode==='overview'?'active':''}`} aria-label="Market overview" onClick={()=>setMode('overview')}><Activity size={19}/><span>Market overview</span></button><button className={`nav-item ${mode==='library'?'active':''}`} aria-label="Data library" onClick={()=>setMode('library')}><Database size={19}/><span>Data library</span></button><button className={`nav-item ${mode==='explore'?'active':''}`} aria-label="Explore the market" onClick={()=>setMode('explore')}><Compass size={19}/><span>Explore the market</span></button><button className={`nav-item ${mode==='analyst'?'active':''}`} aria-label="AI Analyst" onClick={()=>setMode('analyst')}><Sparkles size={19}/><span>AI Analyst</span><span className="nav-mini-badge">AI</span></button><button className="nav-item" aria-label="Sources and coverage" onClick={()=>setSourcesOpen(true)} disabled={!bootstrap}><BookOpen size={19}/><span>Sources & coverage</span></button></div>
      <div className="sidebar-bottom"><div className="sidebar-note"><span className="sidebar-note-icon"><FileCheck2 size={19}/></span><strong>Evidence comes first.</strong><p>Every chart starts with verified data. Every conclusion keeps its source.</p></div><div className="workspace-person"><span className="workspace-avatar">P</span><div><strong>Powercoders</strong><span>Programme workspace</span></div></div></div>
    </aside>
    <main className="main-shell"><header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>{MODE_COPY[mode].label}</strong></div><div className="topbar-right"><span className="verified-label"><FileCheck2 size={15}/>Verified data</span><span className="country-label"><span className="swiss-flag">+</span>Switzerland</span></div></header>
      {!bootstrap||!result?<div className="initial-state">{loadError?<><CircleAlert size={32}/><h1>We couldn’t load the workspace</h1><p>{loadError}</p><Button onClick={()=>void load()}><RefreshCw size={16}/>Try again</Button></>:<><span className="loading-radar"><Radar size={42}/></span><h1>Opening your market workspace</h1><p>Loading verified indicators and their sources…</p><div className="skeleton-row"><span/><span/><span/></div></>}</div>:<>
      <section className="page-heading"><div><div className="eyebrow">YOUR SWISS IT MARKET WORKSPACE</div><h1>{MODE_COPY[mode].title}</h1><p>{MODE_COPY[mode].description}</p></div><div className="heading-switch segmented"><button className={mode==='explore'?'selected':''} onClick={()=>setMode('explore')} aria-pressed={mode==='explore'}><SlidersHorizontal size={16}/>Explore</button><button className={mode==='analyst'?'selected':''} onClick={()=>setMode('analyst')} aria-pressed={mode==='analyst'}><Sparkles size={16}/>AI Analyst</button></div></section>
      {mode==='overview'?<MarketOverview inventory={bootstrap.inventory} panels={bootstrap.marketOverview} onOpen={openOverviewResult} onSources={value=>{setSourcesResult(value);setSourcesOpen(true);}} onLibrary={()=>setMode('library')} onAsk={prepareQuestion}/>:mode==='library'?<DataLibrary catalog={bootstrap.catalog} inventory={bootstrap.inventory} onOpen={openCatalogItem} onAsk={prepareQuestion}/>:<>
      <div className="workspace-data-access"><Database size={16}/><span>ITBoard · Eurostat · BFS · SECO · SEM · regional sources</span><button className="text-button" onClick={()=>setMode('library')}>Browse all {bootstrap.inventory.counts.series} indicators</button></div>
      {mode==='explore'?<>
        <ExplorerControls catalog={bootstrap.catalog} query={query} topic={topic} busy={queryBusy} onQuery={runQuery} onLibrary={()=>setMode('library')}/>
        {queryError&&<div className="notice notice-error" role="alert"><CircleAlert size={17}/><div><strong>This selection could not be applied.</strong><p>{queryError} The chart below retains the previous verified result.</p></div></div>}
        <div className="explore-grid"><div className="explore-main"><ResultView result={result} busy={queryBusy} onSources={()=>setSourcesOpen(true)} preferredView={preferredView} onViewChange={setPreferredView}/></div><aside className="insight-column"><section className="side-card snapshot-card"><div className="eyebrow">LATEST IN THIS VIEW</div><h3>The numbers, in context</h3><LatestReadout result={result}/><div className="sample-note"><Info size={15}/><p>{result.series.every(series=>series.sourceId==='itboard_monitor_csv')?'These are observations in the source sample. Changes can also reflect platform coverage.':'Read each indicator with its own population, reporting period and definition.'}</p></div></section><section className="ask-card"><span className="ask-icon"><Sparkles size={20}/></span><h3>Take the next question.</h3><p>Your analyst can explain this view, compare indicators, or help identify what’s missing.</p><Button onClick={askAboutView}><Sparkles size={16}/>Ask about this view</Button><button className="text-button" onClick={()=>{setMode('analyst');setMessage('What data do we have, and how recent is it?');}}>Explore what the data can answer</button></section></aside></div>
      </>:<>
        {!bootstrap.aiAvailable&&<div className="notice notice-setup"><Info size={18}/><div><strong>Your analyst is ready for an API connection.</strong><p>AI conversations will be available once the server connection is configured. All manual data exploration remains available.</p></div><Button variant="outline" size="sm" onClick={()=>setMode('explore')}>Keep exploring</Button></div>}
        <div className="analyst-layout"><section className="conversation-card"><div className="conversation-header"><div><span className="analyst-avatar"><Sparkles size={18}/></span><div><h2>AI Analyst</h2><span>Evidence-led, question by question</span></div></div><Button size="icon" variant="ghost" disabled={chatBusy||newChatBusy} onClick={()=>void newConversation()} title="Start a new conversation" aria-label="Start a new conversation">{newChatBusy?<LoaderCircle size={17} className="spin"/>:<Plus size={18}/>}</Button></div>
          <div className="context-strip"><History size={14}/><span>{userTurns?`${userTurns} ${userTurns===1?'question':'questions'} in this conversation`:'Context for 20+ follow-up questions'}</span><span className="context-scope">{geographyLabel(result.query.geography)}</span></div>
          <div className="conversation-body" aria-live="polite" aria-relevant="additions text">
            {turns.length===0?<div className="conversation-welcome"><div className="welcome-symbol"><Sparkles size={25}/></div><h3>Where would you like to begin?</h3><p>Ask in your own words. I can find relevant data, compare it, and show the evidence.</p><div className="prompt-grid">{PROMPTS.map(prompt=><button key={prompt.title} onClick={()=>{setMessage(prompt.text);composer.current?.focus();}}><prompt.icon size={18}/><strong>{prompt.title}</strong><span>{prompt.text}</span></button>)}</div><div className="welcome-footnote"><Database size={14}/>Answers use the verified data catalog, with its limits.</div></div>:turns.map(turn=>turn.role==='user'?<div className="message-user" key={turn.id}><div className="message-author">You</div><div>{turn.content}</div></div>:<AssistantMessage key={turn.id} turn={turn} results={results} evidence={evidence} activeResultId={result.id} activeView={activeView} onView={openResult}/>)}
            {chatBusy&&<div className="analyst-working" role="status"><span className="analyst-avatar"><Sparkles size={16}/></span><div><strong>Working with the data</strong><span><LoaderCircle size={13} className="spin"/>{chatStatus||'Preparing your answer…'}</span></div></div>}
            {chatError&&<div className="chat-error" role="alert"><CircleAlert size={16}/><div>{chatError}<button className="text-button" onClick={()=>void loadConversation(true).then(()=>setChatError('')).catch(()=>setChatError('Conversation history is still unavailable. Please try again.'))}>Reload conversation</button></div></div>}
            <div ref={conversationEnd}/>
          </div>
          <form className="composer" onSubmit={(event:FormEvent)=>{event.preventDefault();void sendMessage();}}><label className="sr-only" htmlFor="analyst-question">Ask the AI Analyst</label><textarea ref={composer} id="analyst-question" placeholder={turns.length?'Ask a follow-up…':'Ask anything about the available market data…'} value={message} onChange={e=>setMessage(e.target.value)} maxLength={4000} rows={2} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void sendMessage();}}}/><div className="composer-bottom"><span><Layers3 size={13}/>Current view included</span>{chatBusy?<Button type="button" size="sm" variant="outline" onClick={()=>chatAbort.current?.abort()}><Square size={12}/>Stop</Button>:<Button type="submit" size="sm" disabled={!message.trim()||!bootstrap.aiAvailable}><Send size={15}/>Ask analyst</Button>}</div></form>
        </section><div className="analyst-canvas"><div className="canvas-heading"><div><span className="eyebrow">CONNECTED WORKSPACE</span><h3>Your working view</h3></div><Button variant="outline" size="sm" onClick={()=>setMode('explore')}><SlidersHorizontal size={14}/>Explore this view</Button></div><div className="scope-chips"><span><span className="swiss-mini">+</span>{geographyLabel(result.query.geography)}</span><span>{result.query.measure==='share'?'Share / rate':result.query.measure==='count'?'Count':'Reported values'}</span>{result.series.slice(0,3).map(s=><span key={s.id}>{s.label}</span>)}</div><ResultView result={result} onSources={()=>setSourcesOpen(true)} compact preferredView={preferredView} onViewChange={setPreferredView}/><div className="connected-note"><FileCheck2 size={16}/><p>Charts and answers use the same verified results. Open any referenced view in the conversation to revisit it.</p></div>{turns.length>0&&!chatBusy&&<div className="followup-suggestions"><span>Keep exploring</span>{['Compare with Docker.','What are the limitations?','And for junior roles?'].map(text=><button key={text} onClick={()=>void sendMessage(text)} disabled={!bootstrap.aiAvailable}>{text}</button>)}</div>}</div></div>
      </>}
      </>}
      <footer className="workspace-footer"><span>Market Radar <span>·</span> Built for informed programme decisions</span><button className="text-button" onClick={()=>setSourcesOpen(true)}>Data coverage & methodology <CircleHelp size={13}/></button></footer>
      <SourcesDrawer open={sourcesOpen} onClose={()=>{setSourcesOpen(false);setSourcesResult(null);}} result={sourcesResult||result} catalog={bootstrap.catalog} release={bootstrap.release} onLibrary={()=>{setSourcesOpen(false);setMode('library');}}/>
      </>}
    </main>
  </div>;
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
