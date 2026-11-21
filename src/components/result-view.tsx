'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, CircleHelp, Database, ExternalLink, FileText, Info, LineChart as LineIcon, Table2 } from 'lucide-react';
import type { AnalyticsResult, Point, ResultSeries, ViewType } from '@/lib/contracts';
import { Button } from './ui/button';

const COLORS = ['#b51235', '#526a92', '#aa762a', '#23847d'];
export function formatValue(value: number | null | undefined, unit = '') {
  if (value === null || value === undefined) return '—';
  const text = new Intl.NumberFormat('en-CH', { maximumFractionDigits: Number.isInteger(value) ? 0 : 2 }).format(value);
  if (/percentage_points|^pp$/.test(unit)) return `${text} pp`;
  return /percent|^%$/.test(unit) ? `${text}%` : text;
}
export function formatDate(value: string, compact = false) {
  const date = new Date(`${value.slice(0,10)}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: compact ? undefined : 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}
export function geographyLabel(value: string) {
  const names: Record<string,string> = { CH: 'Switzerland', 'itboard:region:zuerich': 'Zürich region', 'itboard:region:genfersee': 'Lake Geneva region', 'itboard:region:mittelland': 'Espace Mittelland', 'itboard:region:nordwestschweiz': 'Northwestern Switzerland', 'itboard:region:ostschweiz': 'Eastern Switzerland', 'itboard:region:tessin': 'Ticino region', 'itboard:region:zentralschweiz': 'Central Switzerland', 'CH-ZH':'Zürich canton', 'CH-BE':'Bern canton', 'CH-GE':'Geneva canton', 'CH-VD':'Vaud canton', 'CH-TG':'Thurgau canton', 'CH-FR':'Fribourg canton', 'CH-BS':'Basel-Stadt canton', 'CH-BL':'Basel-Landschaft canton', 'CH-TI':'Ticino canton', 'CH-SG':'St. Gallen canton', 'CH-AG':'Aargau canton', 'CH-LU':'Lucerne canton', 'CH-ZG':'Zug canton', 'CH-VS':'Valais canton', 'CH-GR':'Graubünden canton', 'CH-NE':'Neuchâtel canton', 'CH-SO':'Solothurn canton', 'CH-SH':'Schaffhausen canton', 'CH-SZ':'Schwyz canton', 'CH-UR':'Uri canton', 'CH-JU':'Jura canton', 'CH-GL':'Glarus canton', 'CH-NW':'Nidwalden canton', 'CH-OW':'Obwalden canton', 'CH-AR':'Appenzell Ausserrhoden canton', 'CH-AI':'Appenzell Innerrhoden canton' };
  return names[value] || value;
}
function lastValue(series: ResultSeries) { return [...series.points].reverse().find(p => p.value !== null); }
function PointTooltip({ active, date, series }: {active?:boolean;date?:string;series:ResultSeries[]}) {
  if (!active || !date) return null;
  const points = series.map((s,index) => ({s,index,p:s.points.find(p => p.end === date)})).filter(x => x.p);
  return <div className="chart-tooltip"><div className="tooltip-date">{formatDate(date)}</div>{points.map(({s,p,index}) => <div className="tooltip-entry" key={s.id}>
    <div className="tooltip-label"><span className="series-dot" style={{background:COLORS[index%COLORS.length]}}/>{s.label}<strong>{formatValue(p!.value,s.unit)}</strong></div>
    {p!.end !== p!.date && <small>{formatDate(p!.date)} – {formatDate(p!.end)}</small>}
    {p!.count !== null && p!.denominator !== null && <small>{formatValue(p!.count)} of {formatValue(p!.denominator)} {s.sourceId==='itboard_monitor_csv'?'listings':'in the denominator'}</small>}
    {p!.value === null && <small>No published observation</small>}
  </div>)}</div>;
}

export function ResultView({ result, busy = false, onSources, compact = false, preferredView, onViewChange }: {result:AnalyticsResult;busy?:boolean;onSources:()=>void;compact?:boolean;preferredView?:ViewType;onViewChange?:(view:ViewType)=>void}) {
  const [localView,setView] = useState<ViewType>(preferredView || (result.query.mode === 'ranking' ? 'bar' : 'line'));
  const view=onViewChange?(preferredView||(result.query.mode==='ranking'||result.query.mode==='snapshot'?'bar':'line')):localView;
  function chooseView(next:ViewType) {if(!onViewChange)setView(next);onViewChange?.(next);}
  const [mounted,setMounted] = useState(false);
  const [showLimits,setShowLimits] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => { setView(preferredView || (result.query.mode === 'ranking' || result.query.mode === 'snapshot' ? 'bar' : 'line')); }, [result.id,result.query.mode,preferredView]);
  const series = result.series;
  const data = useMemo(() => {
    const dates = [...new Set(series.flatMap(s => s.points.map(p => p.end)))].sort();
    return dates.map(date => { const row:Record<string,string|number|null>={date}; series.forEach((s,i)=>{row[`s${i}`]=s.points.find(p=>p.end===date)?.value??null;});return row; });
  },[series]);
  const latest = series.map((s,index) => ({s,index,p:lastValue(s)}));
  const rankingChanges = result.query.mode === 'ranking' && result.query.rankingBy === 'change';
  const bars = latest.map(({s,p,index}) => ({name:s.label,value:rankingChanges?(result.changes.find(c=>c.seriesId===s.id)?.absolute??null):(p?.value??null),color:COLORS[index%COLORS.length]}));
  const unit = series[0]?.unit || '';
  const displayedUnit = rankingChanges && /percent|^%$/.test(unit) ? 'percentage_points' : unit;
  const unitLabel = displayedUnit==='percentage_points' ? 'Change · percentage points' : rankingChanges ? `Change in ${displayedUnit.replaceAll('_',' ')}` : result.query.measure==='share' ? result.query.metric==='registry_employment_rate'||series.every(s=>s.id.startsWith('sem_'))?'Employment rate (%)':'Share (%)' : unit==='percent' ? 'Percent (%)' : unit.replaceAll('_',' ');
  const units = [...new Set(series.map(s=>s.unit))];
  const showCounts=series.some(s=>s.points.some(p=>p.count!==null));
  const showDenominators=series.some(s=>s.points.some(p=>p.denominator!==null));
  const canGraph = units.length <= 1;
  const viewIsTable = view === 'table' || !canGraph;
  const isSnapshot = result.query.mode !== 'history';
  const pointCount = series.reduce((n,s)=>n+s.points.filter(p=>p.value!==null).length,0);
  const dates = series.flatMap(s=>s.points.flatMap(p=>[p.date,p.end])).sort();
  const limits = [...new Set(result.limitations)].filter(Boolean);

  return <section className={`result-card ${compact?'result-compact':''}`} aria-busy={busy}>
    <div className="result-header"><div><div className="eyebrow">{result.query.mode === 'ranking' ? 'Market ranking' : 'Evidence in focus'}</div><h2>{result.title}</h2><p className="result-subtitle">{geographyLabel(result.query.geography)}<span>·</span>{dates.length ? `${formatDate(dates[0])} – ${formatDate(dates.at(-1)!)}` : 'No observations in this period'}</p></div><Button variant="ghost" size="icon" aria-label="Sources and coverage for this chart" onClick={onSources}><Info size={18}/></Button></div>
    <div className="chart-toolbar"><div className="chart-unit">{unitLabel}{result.query.measure==='share'&&!rankingChanges&&<span>within the source’s documented population</span>}</div><div className="segmented compact" aria-label="Chart display">
      {!isSnapshot&&<button type="button" className={!viewIsTable&&view==='line'?'selected':''} onClick={()=>chooseView('line')} aria-label="Trend" aria-pressed={!viewIsTable&&view==='line'} title="Line chart"><LineIcon size={16}/><span>Trend</span></button>}
      <button type="button" className={!viewIsTable&&view==='bar'?'selected':''} onClick={()=>chooseView('bar')} aria-label="Bars" aria-pressed={!viewIsTable&&view==='bar'} title="Bar chart"><BarChart3 size={16}/><span>Bars</span></button>
      <button type="button" className={viewIsTable?'selected':''} onClick={()=>chooseView('table')} aria-label="Data" aria-pressed={viewIsTable}><Table2 size={16}/><span>Data</span></button>
    </div></div>
    {busy&&<div className="chart-loading-bar"/>}
    {result.status==='empty'||pointCount===0 ? <div className="chart-empty"><Database size={30}/><h3>No published values in this selection</h3><p>Try another period or indicator. Missing data is kept missing.</p></div> : viewIsTable ? <div className="data-table-wrap" tabIndex={0} role="region" aria-label="Underlying chart data"><table className="data-table"><thead><tr><th>Period</th><th>Indicator</th><th>Value</th>{rankingChanges&&<th>Change</th>}{showCounts&&<th>Count</th>}{showDenominators&&<th>Denominator</th>}</tr></thead><tbody>{series.flatMap(s=>s.points.map((p,index)=><tr key={`${s.id}-${p.date}-${index}`}><td>{formatDate(p.date)}{p.end!==p.date&&<small>to {formatDate(p.end)}</small>}</td><td>{s.label}</td><td className="number">{formatValue(p.value,s.unit)}</td>{rankingChanges&&<td className="number">{formatValue(result.changes.find(c=>c.seriesId===s.id)?.absolute,displayedUnit)}</td>}{showCounts&&<td className="number">{formatValue(p.count)}</td>}{showDenominators&&<td className="number">{formatValue(p.denominator)}</td>}</tr>))}</tbody></table></div> : view==='metric_cards' ? <div className="metric-cards-view"><LatestReadout result={result}/></div> : <div className="chart-area" style={isSnapshot?{height:Math.max(260,Math.min(600,series.length*37+30))}:undefined} role="img" aria-label={`${result.title}. ${pointCount} published observations. Use the Data button for the accessible table.`}>
      {mounted&&<ResponsiveContainer width="100%" height="100%" minWidth={0}>
        {isSnapshot ? <BarChart data={bars} layout="vertical" margin={{top:10,right:35,left:0,bottom:5}}><CartesianGrid stroke="#e8edef" horizontal={false} strokeDasharray="3 4"/><XAxis type="number" axisLine={false} tickLine={false} tick={{fill:'#7b8791',fontSize:12}}/><YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={compact?120:155} tick={{fill:'#46565d',fontSize:12}}/><Tooltip cursor={{fill:'#f0f6f5'}} formatter={(value)=>formatValue(Number(value),displayedUnit)} contentStyle={{border:'1px solid #dce5e6',borderRadius:12,fontSize:13}}/><Bar dataKey="value" fill={COLORS[0]} radius={[0,5,5,0]} maxBarSize={19}/></BarChart>
        : view === 'bar' ? <BarChart data={data} margin={{top:12,right:15,left:-16,bottom:0}}><CartesianGrid stroke="#e8edef" vertical={false} strokeDasharray="3 4"/><XAxis dataKey="date" tickFormatter={v=>formatDate(String(v),true)} axisLine={false} tickLine={false} tick={{fill:'#7b8791',fontSize:12}} minTickGap={25} tickMargin={14}/><YAxis axisLine={false} tickLine={false} tick={{fill:'#7b8791',fontSize:12}} tickFormatter={v=>/percent/.test(unit)||result.query.measure==='share'?`${v}%`:String(v)}/><Tooltip cursor={{fill:'#f3f7f6'}} content={({active,label})=><PointTooltip active={active} date={label===undefined?undefined:String(label)} series={series}/>}/>{series.map((s,i)=><Bar dataKey={`s${i}`} name={s.label} key={s.id} fill={COLORS[i%COLORS.length]} radius={[4,4,0,0]} maxBarSize={22}/>)}</BarChart>
        : <LineChart data={data} margin={{top:12,right:15,left:-16,bottom:0}}><CartesianGrid stroke="#e8edef" vertical={false} strokeDasharray="3 4"/><XAxis dataKey="date" tickFormatter={v=>formatDate(String(v),true)} axisLine={false} tickLine={false} tick={{fill:'#7b8791',fontSize:12}} minTickGap={25} tickMargin={14}/><YAxis axisLine={false} tickLine={false} tick={{fill:'#7b8791',fontSize:12}} tickFormatter={v=>/percent/.test(unit)||result.query.measure==='share'?`${v}%`:String(v)}/><Tooltip content={({active,label})=><PointTooltip active={active} date={label===undefined?undefined:String(label)} series={series}/>}/>{series.map((s,i)=><Line type="linear" dataKey={`s${i}`} name={s.label} key={s.id} stroke={COLORS[i%COLORS.length]} strokeWidth={2.6} dot={{r:3,strokeWidth:2,fill:'#fff'}} activeDot={{r:6,strokeWidth:3,stroke:'#fff'}} connectNulls={false} isAnimationActive={false}/>)}</LineChart>}
      </ResponsiveContainer>}
    </div>}
    {!viewIsTable&&view!=='metric_cards'&&series.length<=4&&<div className="chart-legend">{latest.map(({s,index,p})=><div className="legend-item" key={s.id}><span className="series-dot" style={{background:COLORS[index%COLORS.length]}}/><span>{s.label}</span><strong>{formatValue(p?.value,s.unit)}</strong>{p&&<span className="legend-asof">{formatDate(p.end)}</span>}</div>)}</div>}
    <div className="result-source-strip"><div><FileText size={14}/><span>{result.sources.map(s=>s.publisher).filter((x,i,a)=>a.indexOf(x)===i).join(' · ')||'Source details'}</span><span className="source-separator">·</span><span>{pointCount} observations</span></div><button className="text-button" type="button" onClick={onSources}>Sources & coverage <ExternalLink size={12}/></button></div>
    {limits.length>0&&<div className="limits-block"><button type="button" className="limits-toggle" onClick={()=>setShowLimits(!showLimits)} aria-expanded={showLimits}><CircleHelp size={15}/><span>{showLimits?'Hide reading notes':`${limits.length} ${limits.length===1?'reading note':'reading notes'} for this view`}</span><span className="limits-preview">{showLimits?'':limits[0]}</span></button>{showLimits&&<ul>{limits.map((text,i)=><li key={i}>{text}</li>)}</ul>}</div>}
    {result.truncated&&<p className="result-truncated">This result is limited. Narrow the period or selection to inspect all values.</p>}
  </section>;
}

export function LatestReadout({result}:{result:AnalyticsResult}) {
  return <div className="latest-readout">{result.series.slice(0,4).map((series,index)=>{const p=lastValue(series);const change=result.changes.find(c=>c.seriesId===series.id);return <div className="latest-item" key={series.id}><div className="latest-label"><span className="series-dot" style={{background:COLORS[index%COLORS.length]}}/>{series.label}</div><div className="latest-number">{formatValue(p?.value,series.unit)}</div>{p?.count!==null&&p?.denominator!==null&&p&&<div className="latest-denominator">{formatValue(p.count)} of {formatValue(p.denominator)} {series.sourceId==='itboard_monitor_csv'?'listings':'in the denominator'}</div>}{change&&<div className="latest-change">{change.absolute>0?'+':''}{formatValue(change.absolute)} {/percent/.test(series.unit)||result.query.measure==='share'?'pp':series.unit.replaceAll('_',' ')}<span>from {formatDate(change.fromDate)}</span></div>}</div>})}</div>;
}
