import { z } from 'zod';
import type {DecisionScope} from './decision-contracts';

export const querySchema = z.object({
  seriesIds: z.array(z.string().max(160)).max(4).default([]),
  mode: z.enum(['history','snapshot','ranking']).default('history'),
  measure: z.enum(['reported','count','share']).default('reported'),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  geography: z.string().max(40).default('CH'),
  topic: z.enum(['skills','roles','context','experience']).optional(),
  sourceId: z.string().max(180).optional(),
  metric: z.string().max(100).optional(),
  rankingBy: z.enum(['value','change']).default('value'),
  limit: z.number().int().min(1).max(20).default(10),
}).strict();
export type QuerySpec = z.infer<typeof querySchema>;
export type QueryInput = z.input<typeof querySchema>;
export type ViewType = 'line'|'bar'|'table'|'metric_cards';
export type SourceRef = { id:string; title:string; publisher:string; url:string; publishedAt:string|null; retrievedAt:string|null; coverage:string; license:string };
export type CatalogItem = { id:string; label:string; topic:'skills'|'roles'|'context'|'experience'; sourceId:string; sourceName:string; geography:string; metric:string; unit:string; frequency:string; first:string; last:string; observations:number; canShare:boolean; limitations:string[]; population:string; measurementBasis:string; denominatorDefinition:string|null; skillId:string|null; occupationId:string|null; timeComparison:string };
export type Point = { date:string; end:string; value:number|null; count:number|null; denominator:number|null; observationIds:string[] };
export type ResultSeries = { id:string; label:string; unit:string; geography:string; sourceId:string; population:string; measurementBasis:string; points:Point[]; limitations:string[] };
export type Change = { seriesId:string; label:string; fromDate:string; toDate:string; fromValue:number; toValue:number; absolute:number; relativePercent:number|null; unit:string };
export type AnalyticsResult = { id:string; status:'ok'|'empty'; title:string; query:QuerySpec; series:ResultSeries[]; changes:Change[]; sources:SourceRef[]; limitations:string[]; allowedViews:ViewType[]; generatedAt:string; release:string; truncated:boolean };
export type Evidence = { id:string; title:string; summary:string; limitations:string; period:string; url:string; locator:string; status?:string };
export const answerSchema = z.object({
  summary:z.string().max(2500),
  findings:z.array(z.object({text:z.string().max(1800),resultIds:z.array(z.string()).max(8),evidenceIds:z.array(z.string()).max(8)}).strict()).max(8),
  limitations:z.array(z.string().max(1200)).max(8),
  actions:z.array(z.string().max(1000)).max(5),
  views:z.array(z.object({resultId:z.string(),type:z.enum(['line','bar','table','metric_cards']),title:z.string().max(160)}).strict()).max(4),
  clarification:z.string().max(1000).nullable(),
}).strict();
export type AnalystAnswer = z.infer<typeof answerSchema>;
export type ChatTurn = { id:number; role:'user'|'assistant'; content:string; createdAt:string; answer?:AnalystAnswer; resultIds:string[]; error?:string };
export type ChatEvent = {type:'status';message:string}|{type:'result';result:AnalyticsResult}|{type:'evidence';evidence:Evidence[]}|{type:'answer';answer:AnalystAnswer;turnId:number}|{type:'error';code:string;message:string}|{type:'brief';scope:DecisionScope|null};
export type DataSourceInventory = SourceRef & {family:string;domain:'skills'|'demand'|'participants'|'regional';seriesCount:number;nationalSeriesCount:number;observations:number;nationalObservations:number;geographies:string[];first:string;last:string;metrics:string[];sampleSeriesIds:string[];limitations:string[];reviewedOn?:string|null;attribution?:string|null;termsUrl?:string|null};
export type DataInventory = {release:string;sourcePolicyVersion:string;checkedOn:string;frozen:true;counts:{observations:number;nationalObservations:number;series:number;nationalSeries:number;sources:number};sources:DataSourceInventory[];evidence:Evidence[];excludedSources:{id:string;name:string;status:string;reason:string}[];limitations:string[]};
export type MarketOverviewPanel = {id:string;title:string;description:string;result:AnalyticsResult};
export type Bootstrap = {catalog:CatalogItem[]; overview:{listings:number; employers:number;juniors:number;asOf:string}; initialResult:AnalyticsResult;inventory:DataInventory;marketOverview:MarketOverviewPanel[];aiAvailable:boolean;model:string;release:string};
