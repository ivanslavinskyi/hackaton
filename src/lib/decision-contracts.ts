import {z} from 'zod';
import type {AnalyticsResult,ViewType,CatalogItem} from './contracts';

export const decisionScopeSchema=z.object({
  kind:z.enum(['opportunities','participants']),
  role:z.string().min(1).max(160).optional(),
  group:z.enum(['all','f','b','s']).optional(),
  geography:z.string().min(1).max(40).optional(),
}).strict();
export type DecisionScope=z.infer<typeof decisionScopeSchema>;
export const PARTICIPANT_GROUPS={
  f:{label:'Permit F',description:'Provisionally admitted people, including provisionally admitted refugees',sourceId:'sem_asyl_202610_6_22'},
  b:{label:'Refugees with permit B',description:'Recognised refugees granted asylum and holding a B permit',sourceId:'sem_asyl_202610_6_23'},
  s:{label:'Status S',description:'People with temporary protection',sourceId:'sem_asyl_202610_6_24'},
} as const;
export type ParticipantGroup=keyof typeof PARTICIPANT_GROUPS;
export type DecisionPanel={id:string;title:string;description:string;result:AnalyticsResult;view:ViewType;group?:ParticipantGroup;metric?:'population'|'employed'|'rate';note?:string};
export type DecisionBrief={scope:DecisionScope;title:string;description:string;panels:DecisionPanel[];limitations:string[];nextSteps:string[];release:string};

export function decisionHref(scope:DecisionScope){
  const valid=decisionScopeSchema.parse(scope),params=new URLSearchParams();
  for(const key of ['role','group','geography'] as const)if(valid[key])params.set(key,valid[key]);
  return '/'+valid.kind+(params.size?'?'+params:'');
}
export function parseDecisionSearch(kind:DecisionScope['kind'],search:string):DecisionScope{
  const params=new URLSearchParams(search);
  if(search.length>500||[...params.keys()].some(key=>key==='kind'||params.getAll(key).length>1))throw new Error('This link contains invalid or repeated filters.');
  const scope=decisionScopeSchema.parse({kind,...Object.fromEntries(params)});
  if(kind==='opportunities'&&(scope.group!==undefined||(scope.geography&&scope.geography!=='CH')))throw new Error('Role and junior signals are available for Switzerland only.');
  if(kind==='participants'&&scope.role!==undefined)throw new Error('Participant data has no role filter.');
  return scope;
}

export function getDecisionOptions(catalog:CatalogItem[]){
  const sources=Object.values(PARTICIPANT_GROUPS).map(group=>group.sourceId);
  return {
    roles:catalog.filter(item=>item.geography==='CH'&&item.sourceId==='itboard_monitor_csv'&&item.metric==='platform_role_open_ads').map(({id,label})=>({id,label})),
    geographies:[...new Set(catalog.filter(item=>sources.includes(item.sourceId as typeof sources[number])&&item.metric==='registry_employment_rate').map(item=>item.geography))].sort((a,b)=>a==='CH'?-1:b==='CH'?1:a.localeCompare(b)),
  };
}
