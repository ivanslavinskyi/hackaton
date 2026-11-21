import { z } from 'zod';
import { querySchema, type QueryInput, type QuerySpec, type ViewType } from './contracts';

export const WORKSPACE_ROUTES = {
  overview:'/overview', library:'/library', explore:'/explore', analyst:'/analyst', sources:'/sources',
} as const;
export type WorkspaceMode = keyof typeof WORKSPACE_ROUTES;
export function workspaceMode(pathname:string):WorkspaceMode {
  return (Object.keys(WORKSPACE_ROUTES) as WorkspaceMode[]).find(key=>WORKSPACE_ROUTES[key]===pathname)||'overview';
}
const views=z.enum(['line','bar','table','metric_cards']);
type Parsed<T> = {ok:true;value:T}|{ok:false;error:string};
const queryFields={mode:'mode',measure:'measure',geography:'geography',topic:'topic',source:'sourceId',metric:'metric',start:'start',end:'end',sort:'rankingBy',limit:'limit'} as const;

/** Only public analytical filters belong in links; conversation IDs/messages never do. */
export function analysisHref(mode:'explore'|'analyst',input:QueryInput,view?:ViewType):string {
  const q=querySchema.parse(input),params=new URLSearchParams();
  q.seriesIds.forEach(id=>params.append('series',id));
  for(const [key,field] of Object.entries(queryFields))if(q[field as keyof QuerySpec]!==undefined)params.set(key,String(q[field as keyof QuerySpec]));
  if(view)params.set('view',view);
  return `${WORKSPACE_ROUTES[mode]}?${params}`;
}
export function parseAnalysisSearch(search:string):Parsed<{query:QuerySpec|null;view?:ViewType}> {
  const params=new URLSearchParams(search),keys=new Set(['series','view',...Object.keys(queryFields)]);
  if(!params.size)return {ok:true,value:{query:null}};
  if(search.length>4000||[...params.keys()].some(key=>!keys.has(key)))return {ok:false,error:'This analysis link contains unsupported parameters.'};
  if([...params.keys()].some(key=>key!=='series'&&params.getAll(key).length>1))return {ok:false,error:'This analysis link repeats a filter.'};
  const raw:Record<string,unknown>={seriesIds:params.getAll('series')};
  for(const [key,field] of Object.entries(queryFields))if(params.has(key))raw[field]=key==='limit'?Number(params.get(key)):params.get(key);
  const parsed=querySchema.safeParse(raw),view=params.has('view')?views.safeParse(params.get('view')):null;
  if(!parsed.success||(view&&!view.success))return {ok:false,error:'This analysis link has invalid filters or a chart type that is not supported.'};
  const q=parsed.data;
  if(q.seriesIds.length!==new Set(q.seriesIds).size||q.seriesIds.some(id=>!id.trim()))return {ok:false,error:'Choose distinct, non-empty indicator IDs.'};
  if([q.start,q.end].some(date=>date&&(!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))||(q.start&&q.end&&q.start>q.end))return {ok:false,error:'This analysis link has an invalid date range.'};
  if(!q.seriesIds.length&&q.mode!=='ranking')return {ok:false,error:'This analysis link does not identify any indicators.'};
  return {ok:true,value:{query:q,view:view?.success?view.data:undefined}};
}
export function queryIdentity(input:QueryInput):string {
  const q=querySchema.parse(input);
  return JSON.stringify(Object.entries(q).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)));
}
const librarySchema=z.object({q:z.string().max(200).default(''),source:z.string().min(1).max(180).default('all'),topic:z.enum(['all','skills','demand','participants','regional']).default('all'),coverage:z.enum(['CH','all']).default('CH'),page:z.coerce.number().int().min(1).max(100).default(1)}).strict();
export type LibraryFilters=z.infer<typeof librarySchema>;
export const DEFAULT_LIBRARY_FILTERS=librarySchema.parse({});
export function parseLibrarySearch(search:string):Parsed<LibraryFilters> {
  const params=new URLSearchParams(search);
  if(search.length>2000||[...params.keys()].some(key=>params.getAll(key).length>1))return {ok:false,error:'This library link contains invalid or repeated filters.'};
  const parsed=librarySchema.safeParse(Object.fromEntries(params));
  return parsed.success?{ok:true,value:parsed.data}:{ok:false,error:'This library link contains unsupported filters.'};
}
export function libraryHref(filters:Partial<LibraryFilters>={}):string {
  const values=librarySchema.parse(filters),params=new URLSearchParams();
  for(const key of Object.keys(values) as (keyof LibraryFilters)[])if(values[key]!==DEFAULT_LIBRARY_FILTERS[key])params.set(key,String(values[key]));
  return WORKSPACE_ROUTES.library+(params.size?`?${params}`:'');
}

/** Next's App Router integrates the native History API for same-page filter changes. */
export function updateFilterURL(href:string,replace=false) {
  if(!href.startsWith(window.location.pathname+'?')&&href!==window.location.pathname)throw new Error('Filter changes must stay on the current page.');
  if(window.location.pathname+window.location.search===href)return;
  window.history[replace?'replaceState':'pushState'](null,'',href);
}
