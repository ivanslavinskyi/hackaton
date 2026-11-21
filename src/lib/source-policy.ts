import type {AnalyticsResult,Evidence,QueryInput} from './contracts';

// Product availability is separate from the immutable reviewed source archive.
// The archived release remains unchanged; this source was removed by request.
export const SOURCE_POLICY_VERSION='2026-11-21.1';
const disabledSources=new Set(['thurgau_awa_rav_2026_10']);
const disabledSeries=new Set(['thurgau_rav_cross','thurgau_rav_noga62','thurgau_rav_occ36']);

export function isSourceEnabled(sourceId:string):boolean { return !disabledSources.has(sourceId); }
export function isSeriesEnabled(seriesId:string):boolean { return !disabledSeries.has(seriesId); }
export function isQueryEnabled(query:QueryInput):boolean {
  return (!query.sourceId||isSourceEnabled(query.sourceId))&&(query.seriesIds||[]).every(isSeriesEnabled);
}
export function isResultEnabled(result:AnalyticsResult):boolean {
  return isQueryEnabled(result.query)&&result.sources.every(source=>isSourceEnabled(source.id))
    &&result.series.every(series=>isSourceEnabled(series.sourceId)&&isSeriesEnabled(series.id));
}
export function isEvidenceEnabled(evidence:Pick<Evidence,'id'>):boolean {
  return ![...disabledSources].some(sourceId=>evidence.id===`dataset_${sourceId}`);
}
