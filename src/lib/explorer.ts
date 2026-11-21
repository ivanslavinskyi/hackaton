import type {CatalogItem, QueryInput, QuerySpec} from './contracts';

export type ExplorerTopic = CatalogItem['topic'];

/** Keep automatic selections within one definition, including its denominator. */
export function compatibleIndicators(a:CatalogItem,b:CatalogItem):boolean {
  return a.sourceId===b.sourceId && a.geography===b.geography && a.metric===b.metric
    && a.population===b.population && a.measurementBasis===b.measurementBasis
    && a.frequency===b.frequency && a.unit===b.unit
    && a.denominatorDefinition===b.denominatorDefinition;
}

export function defaultIndicators(rows:CatalogItem[],topic:ExplorerTopic):CatalogItem[] {
  const primary=topic==='skills'?rows.filter(c=>['platform_tagged_open_ads','platform_regional_tagged_open_ads'].includes(c.metric))
    :topic==='roles'?rows.filter(c=>['platform_role_open_ads','occupation_share_of_ict_oja'].includes(c.metric)):rows;
  const candidates=primary.length?primary:rows;
  const preferences=topic==='skills'?['python','docker']:topic==='roles'?['software-engineer','it-support','_oc251','_oc351']
    :topic==='experience'?['junior']:['div_62_63','employment_rate'];
  const preferred=preferences.map(word=>candidates.find(c=>c.id.toLowerCase().includes(word))).filter((c):c is CatalogItem=>!!c);
  const first=preferred[0]||candidates[0];
  if(!first)return [];
  const ordered=[...new Map([...preferred,...candidates].map(c=>[c.id,c])).values()];
  return ordered.filter(c=>compatibleIndicators(first,c)).slice(0,topic==='skills'||topic==='roles'?2:1);
}

/** Changing source also chooses a supported topic and geography, never an empty slice. */
export function scopeQuery(catalog:CatalogItem[],current:QuerySpec,topic:ExplorerTopic,requestedSource?:string,requestedGeography?:string):QueryInput {
  const available=requestedSource?catalog.filter(c=>c.sourceId===requestedSource):catalog;
  const actualTopic=available.some(c=>c.topic===topic)?topic:available[0]?.topic;
  const rows=available.filter(c=>c.topic===actualTopic);
  const currentSource=current.sourceId||catalog.find(c=>c.id===current.seriesIds[0])?.sourceId;
  const preferredContext=topic==='context'&&current.topic!=='context'?rows.find(c=>c.sourceId.startsWith('fso_'))?.sourceId:undefined;
  const sourceId=requestedSource||preferredContext||(rows.some(c=>c.sourceId===currentSource)?currentSource:undefined)
    ||rows.find(c=>c.geography==='CH')?.sourceId||rows[0]?.sourceId;
  const sourceRows=rows.filter(c=>c.sourceId===sourceId);
  const geographies=[...new Set(sourceRows.map(c=>c.geography))];
  const geography=requestedGeography||(geographies.includes(current.geography)?current.geography:geographies.includes('CH')?'CH':geographies[0]);
  const selected=defaultIndicators(sourceRows.filter(c=>c.geography===geography),actualTopic||topic);
  return {seriesIds:selected.map(c=>c.id),topic:actualTopic,sourceId,geography,mode:'history',
    measure:selected.length&&selected.every(c=>c.canShare)?'share':'reported'};
}

export function canRankIndicators(rows:CatalogItem[]):boolean {
  return rows.length>1&&rows.every(c=>compatibleIndicators(rows[0],c));
}
