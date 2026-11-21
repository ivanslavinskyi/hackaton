import { createHash } from 'node:crypto';
import { getDataDb } from './data';
import { isQueryEnabled, isSourceEnabled } from './source-policy';
import { querySchema, type AnalyticsResult, type Bootstrap, type CatalogItem, type Change, type Evidence, type Point, type QueryInput, type QuerySpec, type ResultSeries, type SourceRef } from './contracts';

export const DATA_RELEASE = '0.6.0-local';
const MAX_ROWS = 200;
// Percent is a unit, not a guarantee that the metric measures a share.
const PUBLISHED_SHARE_METRICS = new Set(['share_of_platform_ads', 'ict_oja_share', 'occupation_share_of_ict_oja', 'registry_employment_rate']);
type SqlRow = Record<string, string | number | null>;

export class AnalyticsError extends Error {
  public readonly status = 400;
  constructor(public code: string, message: string) { super(message); this.name = 'AnalyticsError'; }
}

function strings(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []; }
  catch { return []; }
}
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function rows(sql: string, params: (string | number | null)[] = []): SqlRow[] {
  return getDataDb().prepare(sql).all(...params) as SqlRow[];
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function num(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function titleCase(value: string): string {
  const acronyms: Record<string, string> = { it: 'IT', ai: 'AI', bi: 'BI', qa: 'QA', ui: 'UI', ux: 'UX', sap: 'SAP', erp: 'ERP', devops: 'DevOps' };
  return value.split(/[-_ ]+/).map(w => acronyms[w.toLowerCase()] || w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const fixedLabels: Record<string, string> = {
  itboard_monitor_total_open_ads: 'Listings in sample',
  itboard_csv_inserate_aktiv: 'Active inventory before exclusions',
  itboard_csv_arbeitgeber_anzahl: 'Employers represented',
  eurostat_ch_isoc_sk_oja1_ict: 'ICT share of all online job advertisements',
  eurostat_ch_isoc_sk_oja3_ict: 'ICT job advertisements — year-on-year change',
  fso_jobstat_ch_vacancies_div_5_96: 'All covered industries — estimated vacancies',
  fso_jobstat_ch_vacancies_div_58_63: 'Information & communication — estimated vacancies',
  fso_jobstat_ch_vacancies_div_62_63: 'IT & information services — estimated vacancies',
};

function labelFor(row: SqlRow): string {
  const id = text(row.series_id), metric = text(row.metric);
  if (fixedLabels[id]) return fixedLabels[id];
  if (row.skill_label) return text(row.skill_label) + (metric === 'share_of_platform_ads' ? ' — published share' : '');
  if (metric === 'platform_role_open_ads') return titleCase(text(row.occupation_id).split(':').at(-1) || text(row.label));
  if (metric === 'platform_remote_by_role') return titleCase(text(row.occupation_id).split(':').at(-1) || '') + ' — remote possible';
  if (metric === 'platform_experience_open_ads') return titleCase(id.split('_').at(-1) || '') + '-tagged listings';
  if (metric === 'occupation_share_of_ict_oja' && row.occupation_label) return text(row.occupation_label);
  return text(row.label).replace(/^ITBoard monitor: /, '').replace(/ \(ITBoard listings\)$/, '');
}

let catalogCache: CatalogItem[] | undefined;
/** Includes all public national and regional series. The geography stays explicit. */
export function getCatalog(): CatalogItem[] {
  if (!catalogCache) {
    const data = rows(`SELECT s.*,p.publisher,sl.label skill_label,ol.label occupation_label,
      q.first_date,q.last_date,q.n,q.skill_kind,q.has_denominator,q.observation_limits
      FROM series s JOIN sources p USING(source_id)
      JOIN source_review r USING(source_id)
      JOIN (SELECT o.series_id,MIN(o.period_start) first_date,MAX(o.period_end) last_date,COUNT(*) n,
        MAX(o.skill_kind) skill_kind,MAX(CASE WHEN o.denominator_observation_id IS NOT NULL OR c.base > 0 THEN 1 ELSE 0 END) has_denominator,
        MAX(o.all_limitations) observation_limits
        FROM observations o LEFT JOIN itboard_cells c USING(observation_id)
        WHERE o.value IS NOT NULL AND o.usage_scope='swiss_core' GROUP BY o.series_id) q USING(series_id)
      LEFT JOIN dimension_labels sl ON sl.concept_id=s.skill_id
      LEFT JOIN dimension_labels ol ON ol.concept_id=s.occupation_id
      WHERE r.use_mode='numeric' ORDER BY s.source_id,s.series_id`);
    catalogCache = data.filter(row=>isSourceEnabled(text(row.source_id))).map(row => {
      const metric = text(row.metric);
      let topic: CatalogItem['topic'] = 'context';
      if (row.skill_id && ['programming_language', 'tool'].includes(text(row.skill_kind))) topic = 'skills';
      else if (['platform_role_open_ads', 'platform_remote_by_role', 'occupation_share_of_ict_oja'].includes(metric)) topic = 'roles';
      else if (metric === 'platform_experience_open_ads') topic = 'experience';
      return {
        id: text(row.series_id), label: labelFor(row), topic, sourceId: text(row.source_id), sourceName: text(row.publisher),
        geography: text(row.geography), metric, unit: text(row.unit), frequency: text(row.frequency),
        first: text(row.first_date), last: text(row.last_date), observations: Number(row.n),
        canShare: PUBLISHED_SHARE_METRICS.has(metric) || (row.unit !== 'percent' && Number(row.has_denominator) > 0),
        limitations: unique([...strings(row.limitations), ...strings(row.observation_limits), ...(metric === 'platform_region_open_ads' ? ['Regional shares use the national counted ITBoard total as denominator, not the total inside that region.'] : [])]),
        population: text(row.population), measurementBasis: text(row.measurement_basis),
        denominatorDefinition: row.denominator_definition as string | null,
        skillId: row.skill_id as string | null, occupationId: row.occupation_id as string | null,
        timeComparison: text(row.time_comparison),
      };
    });
  }
  return catalogCache.map(item => ({ ...item, limitations: [...item.limitations] }));
}

export type CapabilityOptions = { search?: string; ids?: string[]; topic?: CatalogItem['topic']; geography?: string; sourceId?: string; limit?: number; offset?: number };

export function getCapabilities(options: CapabilityOptions = {}) {
  const all = getCatalog();
  const geo = options.geography || 'CH';
  const terms = (options.search || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/\s+/).filter(Boolean);
  const alias: Record<string, string> = { zurich: 'zuerich', zürich: 'zuerich', швейцария: 'ch', питон: 'python', пайтон: 'python', докер: 'docker' };
  const stopwords = new Set(['and','or','the','for','in','of','with','what','data','have','do','we','available','demand','trend','trends','compare']);
  const needle = terms.map(t => alias[t] || t).filter(t=>!stopwords.has(t));
  const score = (s: CatalogItem) => {
    const haystack = `${s.id} ${s.label} ${s.sourceName} ${s.geography} ${s.metric} ${s.population}`.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return needle.reduce((n,t)=>n+Number(t.length<=3 ? haystack.split(/[^a-z0-9]+/).includes(t) : haystack.includes(t)),0);
  };
  const found = all.filter(s => {
    if (geo !== 'all' && s.geography !== geo) return false;
    if (options.sourceId && s.sourceId !== options.sourceId) return false;
    if (options.ids?.length && !options.ids.includes(s.id)) return false;
    if (options.topic && s.topic !== options.topic) return false;
    return !needle.length || score(s)>0;
  }).sort((a,b)=>score(b)-score(a) || a.id.localeCompare(b.id));
  const offset = Math.max(0, Math.floor(options.offset || 0));
  const limit = Math.min(40, Math.max(1, Math.floor(options.limit || 16)));
  return {
    total: found.length, offset, hasMore: offset + limit < found.length,
    items: found.slice(offset, offset + limit).map(item => ({...item, limitations: options.ids?.length ? item.limitations : item.limitations.slice(0,2)})),
    geographies: unique(all.map(s => s.geography)).sort(),
    operations: ['history', 'snapshot', 'ranking', 'compare', 'documented_share', 'percentage_point_change'],
    limitations: [
      'Series are published slices, not an unrestricted cross-tabulation. There is no verified role × named skill × time or junior × named skill intersection.',
      'ITBoard is a platform sample. Observed count growth is not representative Swiss market growth.',
      'ITBoard regions use their own major-region codes; canton codes in other sources cannot be silently substituted.',
      'Counts from different sources must not be added. Missing cells are not zeros.',
      'For named-technology rankings prefer platform_tagged_open_ads / platform_regional_tagged_open_ads to avoid duplicate derived-share series.',
    ],
  };
}

function parseQuery(input: QueryInput): QuerySpec {
  const parsed = querySchema.safeParse(input);
  if (!parsed.success) throw new AnalyticsError('INVALID_QUERY', parsed.error.issues.map(i => `${i.path.join('.') || 'query'}: ${i.message}`).join('; '));
  const q = parsed.data;
  if (!isQueryEnabled(q)) throw new AnalyticsError('SOURCE_UNAVAILABLE', 'This source is no longer available in the workspace. Choose an indicator from the current catalog.');
  for (const date of [q.start, q.end]) {
    if (date && (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new AnalyticsError('INVALID_QUERY', 'Choose a valid calendar date.');
  }
  if (q.start && q.end && q.start > q.end) throw new AnalyticsError('INVALID_QUERY', 'The start date must be on or before the end date.');
  if (q.seriesIds.length !== new Set(q.seriesIds).size) throw new AnalyticsError('INVALID_QUERY', 'Choose distinct series IDs.');
  // Older saved queries placed Eurostat occupational shares in Market context.
  // Canonicalise only that exact indicator family; other topic mismatches still fail.
  if (q.topic === 'context') {
    const catalog = getCatalog();
    const isOccupationShare = (item: CatalogItem | undefined) => item?.metric === 'occupation_share_of_ict_oja';
    const explicitShares = q.seriesIds.length > 0 && q.seriesIds.every(id => isOccupationShare(catalog.find(item => item.id === id)));
    const sourceItems = q.sourceId ? catalog.filter(item => item.sourceId === q.sourceId) : [];
    const sourceShares = sourceItems.length > 0 && sourceItems.every(isOccupationShare);
    const shareRanking = !q.seriesIds.length && q.mode === 'ranking'
      && ((!q.metric && sourceShares) || (q.metric === 'occupation_share_of_ict_oja' && (!q.sourceId || sourceShares)));
    if (explicitShares || shareRanking) q.topic = 'roles';
  }
  return q;
}

function selectSeries(q: QuerySpec): CatalogItem[] {
  const catalog = getCatalog();
  let selected: CatalogItem[];
  if (q.seriesIds.length) {
    selected = q.seriesIds.map(id => {
      const item = catalog.find(s => s.id === id);
      if (!item) throw new AnalyticsError('UNKNOWN_SERIES', `No verified public series exists for ${id}. Search the catalog for an available indicator.`);
      return item;
    });
    if (selected.some(s => s.geography !== q.geography)) throw new AnalyticsError('GEOGRAPHY_MISMATCH', 'The selected series do not match the requested geography. Discover the exact published regional series first.');
    if (q.sourceId && selected.some(s => s.sourceId !== q.sourceId)) throw new AnalyticsError('INVALID_QUERY', 'The selected series do not match the requested source.');
    if (q.topic && selected.some(s => s.topic !== q.topic)) throw new AnalyticsError('INVALID_QUERY', 'The selected series do not match the requested topic.');
    if (q.metric && selected.some(s => s.metric !== q.metric)) throw new AnalyticsError('INVALID_QUERY', 'The selected series do not match the requested metric.');
  } else {
    if (q.mode !== 'ranking') throw new AnalyticsError('INVALID_QUERY', 'Select one to four catalog series for a history or snapshot query.');
    if (!q.topic && !q.metric) throw new AnalyticsError('INVALID_QUERY', 'A ranking requires a topic or exact metric.');
    selected = catalog.filter(s => s.geography === q.geography && (!q.topic || s.topic === q.topic) && (!q.sourceId || s.sourceId === q.sourceId) && (!q.metric || s.metric === q.metric));
    if (!q.metric && q.topic === 'skills') selected = selected.filter(s => ['platform_tagged_open_ads', 'platform_regional_tagged_open_ads'].includes(s.metric));
    if (!q.metric && q.topic === 'roles') {
      // An explicit Eurostat source ranks its published occupational shares.
      // The existing unscoped default stays ITBoard and never mixes sources.
      const metric = q.sourceId && selected.some(s => s.metric === 'occupation_share_of_ict_oja')
        ? 'occupation_share_of_ict_oja' : 'platform_role_open_ads';
      selected = selected.filter(s => s.metric === metric);
    }
  }
  if (q.measure === 'share' && selected.some(s => !s.canShare)) throw new AnalyticsError('UNSUPPORTED_MEASURE', 'This metric is not a published share or rate, and has no documented matching denominator. Percentage growth is not a share; use the reported measure.');
  if (q.measure === 'count' && selected.some(s => s.unit === 'percent' && s.metric !== 'share_of_platform_ads')) throw new AnalyticsError('UNSUPPORTED_MEASURE', 'This source reports percentages, not underlying counts. Use the reported measure.');
  if (selected.length > 1) assertComparable(selected, q.measure);
  return selected;
}

function assertComparable(selected: CatalogItem[], measure: QuerySpec['measure']) {
  const first = selected[0];
  const unit = (s: CatalogItem) => measure === 'share' ? 'percent' : measure === 'count' && s.metric === 'share_of_platform_ads' ? 'job_ads' : s.unit;
  const incompatible = selected.some(s => s.sourceId !== first.sourceId || s.geography !== first.geography || unit(s) !== unit(first)
    || s.measurementBasis !== first.measurementBasis || s.population !== first.population || s.frequency !== first.frequency);
  if (incompatible) throw new AnalyticsError('INCOMPARABLE_SERIES', 'These indicators have different sources, populations, geographies, units or measurement bases. Query them separately as context; they cannot share one numeric comparison.');
  const definitions = unique(selected.filter(s => s.unit === 'percent').map(s => s.denominatorDefinition || ''));
  if (definitions.length > 1) throw new AnalyticsError('INCOMPARABLE_SERIES', 'These percentages have different denominators. Query them separately rather than ranking them together.');
}

function observationRows(series: CatalogItem, q: QuerySpec): SqlRow[] {
  // Dates select by the period ending within the range; the full source window is preserved.
  return rows(`SELECT o.*,c.base cell_base,c.numerator cell_numerator,
    d.value denominator_value,d.observation_id denominator_id,d.geography denominator_geography,
    d.source_id denominator_source,d.period_start denominator_start,d.period_end denominator_end,
    n.value numerator_value,n.observation_id numerator_id
    FROM observations o LEFT JOIN itboard_cells c USING(observation_id)
    LEFT JOIN observations d ON d.observation_id=o.denominator_observation_id
    LEFT JOIN observations n ON n.observation_id=o.numerator_observation_id
    WHERE o.series_id=? AND o.period_end>=? AND o.period_end<=? ORDER BY o.period_end,o.period_start`,
  [series.id, q.start || '0000-01-01', q.end || '9999-12-31']);
}

function toPoint(row: SqlRow, item: CatalogItem, q: QuerySpec): Point {
  let value = num(row.value);
  let count = item.unit === 'job_ads' || item.unit === 'vacancies' || item.unit === 'persons' ? value : num(row.numerator_value);
  let denominator = num(row.denominator_value) ?? num(row.cell_base);
  // Region totals are explicitly a part of the national inventory. This is not
  // the same denominator as a skill's share within a particular region.
  const documentedNationalRegionBase = item.sourceId === 'itboard_monitor_csv' && item.metric === 'platform_region_open_ads'
    && item.geography.startsWith('itboard:region:') && row.denominator_geography === 'CH'
    && row.denominator_id === `itboard_monitor_total_open_ads:${row.period_start}:${row.period_end}`;
  if (row.denominator_id && ((!documentedNationalRegionBase && row.denominator_geography !== item.geography) || row.denominator_source !== item.sourceId
    || row.denominator_start !== row.period_start || row.denominator_end !== row.period_end)) {
    throw new AnalyticsError('INVALID_DENOMINATOR', 'The documented denominator does not match this observation.');
  }
  if (q.measure === 'share') {
    if (item.unit === 'percent') { /* Published percentage; do not divide it again. */ }
    else if (count !== null && denominator !== null && denominator > 0) value = 100 * count / denominator;
    else value = null;
  } else if (q.measure === 'count' && item.metric === 'share_of_platform_ads') value = count;
  if (count === null && num(row.cell_numerator) !== null) count = num(row.cell_numerator);
  if (denominator !== null && denominator <= 0) denominator = null;
  return { date: text(row.period_start), end: text(row.period_end), value, count, denominator,
    observationIds: unique([text(row.observation_id), text(row.numerator_id), text(row.denominator_id)].filter(Boolean)) };
}

function withGaps(points: Point[], item: CatalogItem, q: QuerySpec): Point[] {
  if (q.mode !== 'history') return points;
  let dates: SqlRow[];
  if (item.sourceId === 'itboard_monitor_csv') {
    dates = rows(`SELECT period_start,period_end FROM observations WHERE series_id='itboard_monitor_total_open_ads'
      AND period_end>=? AND period_end<=? ORDER BY period_end`, [q.start || '0000-01-01', q.end || '9999-12-31']);
  } else if (points.length > 1 && ['monthly','quarterly'].includes(item.frequency) && points[0].date.endsWith('-01')) {
    // Calendar gaps in sparse official series must remain visible as well.
    const first=points[0], last=points.at(-1)!;
    const startDate=new Date(first.date+'T00:00:00Z');
    const firstEnd=new Date(first.end+'T00:00:00Z');
    const months=(firstEnd.getUTCFullYear()-startDate.getUTCFullYear())*12+firstEnd.getUTCMonth()-startDate.getUTCMonth()+1;
    const step=item.frequency==='monthly'?1:3;
    dates=[];
    for (let i=0;i<600;i+=step) {
      const start=new Date(Date.UTC(startDate.getUTCFullYear(),startDate.getUTCMonth()+i,1)).toISOString().slice(0,10);
      const end=new Date(Date.UTC(startDate.getUTCFullYear(),startDate.getUTCMonth()+i+months,0)).toISOString().slice(0,10);
      if (end>last.end) break;
      dates.push({period_start:start,period_end:end});
    }
  } else return points;
  const byDate = new Map(points.map(p => [p.end, p]));
  return dates.map(d => byDate.get(text(d.period_end)) || { date: text(d.period_start), end: text(d.period_end), value: null, count: null, denominator: null, observationIds: [] });
}

function buildSeries(item: CatalogItem, q: QuerySpec): ResultSeries {
  const points = withGaps(observationRows(item, q).map(row => toPoint(row, item, q)), item, q);
  return { id: item.id, label: item.label, unit: q.measure === 'share' ? 'percent' : q.measure === 'count' && item.metric === 'share_of_platform_ads' ? 'job_ads' : item.unit,
    geography: item.geography, sourceId: item.sourceId, population: item.population, measurementBasis: item.measurementBasis,
    points, limitations: [...item.limitations] };
}

function calculateChanges(series: ResultSeries[], q: QuerySpec): Change[] {
  if (!series.length) return [];
  // Align to common observed dates. Never compare different dates simply because each is latest.
  let common = series[0].points.filter(p => p.value !== null).map(p => p.end);
  for (const s of series.slice(1)) { const available = new Set(s.points.filter(p => p.value !== null).map(p => p.end)); common = common.filter(d => available.has(d)); }
  common.sort();
  if (common.length < 2) return [];
  const from = q.start ? common[0] : common.at(-2)!;
  const to = common.at(-1)!;
  return series.map(s => {
    const a = s.points.find(p => p.end === from)!, b = s.points.find(p => p.end === to)!;
    const absolute = b.value! - a.value!;
    return { seriesId: s.id, label: s.label, fromDate: from, toDate: to, fromValue: a.value!, toValue: b.value!,
      absolute, relativePercent: a.value! > 0 ? absolute / a.value! * 100 : null, unit: s.unit === 'percent' ? 'percentage_points' : s.unit };
  });
}

function sourceRefs(items: CatalogItem[], series: ResultSeries[]): SourceRef[] {
  return unique(items.map(s => s.sourceId)).map(id => {
    const row = rows(`SELECT s.*,c.coverage_label FROM sources s LEFT JOIN national_coverage c USING(source_id) WHERE s.source_id=?`, [id])[0];
    const related = series.filter(s => s.sourceId === id);
    const latest = related.flatMap(s => s.points).filter(p => p.observationIds.length).sort((a, b) => b.end.localeCompare(a.end))[0];
    const citation = latest ? rows('SELECT citation_url FROM observations WHERE observation_id=?', [latest.observationIds[0]])[0] : undefined;
    const regional = related.some(s => s.geography !== 'CH');
    return { id, title: text(row.title), publisher: text(row.publisher), url: text(citation?.citation_url) || text(row.url), publishedAt: row.published_at as string | null,
      retrievedAt: row.retrieved_at as string | null, coverage: regional ? `${related.map(s => s.geography).filter((v,i,a) => a.indexOf(v)===i).join(', ')} · ${text(row.publisher)} published regional sample` : text(row.coverage_label) || text(row.title), license: text(row.license) };
  });
}

export function queryMetrics(input: QueryInput): AnalyticsResult {
  const q = parseQuery(input);
  const selected = selectSeries(q);
  let series = selected.map(item => buildSeries(item, q));
  const limits = unique(selected.flatMap(s => s.limitations));
  let changes: Change[];
  if (q.mode === 'ranking') {
    // All ranked values must refer to exactly the same published date/window.
    const allDates = unique(series.flatMap(s => s.points.filter(p => p.value !== null).map(p => p.end))).sort();
    const target = allDates.at(-1);
    const from = q.start ? allDates[0] : allDates.at(-2);
    const candidates = series.filter(s => s.points.some(p => p.end === target && p.value !== null))
      .filter(s => q.rankingBy !== 'change' || (from && s.points.some(p => p.end === from && p.value !== null)));
    const score = (s: ResultSeries): number => {
      const latest = s.points.find(p => p.end === target)!.value!;
      return q.rankingBy === 'change' ? latest - s.points.find(p => p.end === from)!.value! : latest;
    };
    series = candidates.sort((a,b) => score(b)-score(a) || a.label.localeCompare(b.label)).slice(0,q.limit)
      .map(s => ({...s, points:s.points.filter(p => p.end === target || (q.rankingBy === 'change' && p.end === from))}));
    changes = calculateChanges(series,q);
    limits.push('Only categories with an observed value at the common ranking date are included. Missing or unpublished categories are not zeros.');
    if (q.rankingBy === 'change') limits.push('Ranking uses absolute change in the selected measure between aligned dates, not percentage growth. Percentage measures use percentage-point change.');
  } else {
    changes = calculateChanges(series,q);
    if (q.mode === 'snapshot') {
      const target = unique(series.flatMap(s => s.points.filter(p => p.value !== null).map(p => p.end))).sort().at(-1);
      series = series.map(s => ({...s,points:s.points.filter(p => p.end === target)}));
      changes = [];
    }
  }
  let truncated = false;
  const cap = Math.max(1,Math.floor(MAX_ROWS / Math.max(series.length,1)));
  series = series.map(s => {
    if (s.points.length <= cap) return s;
    truncated = true;
    return {...s,points:s.points.slice(-cap)};
  });
  if (truncated) {
    limits.push(`Result limited to the latest ${cap} points per series (${MAX_ROWS} total maximum). Choose a narrower date range to inspect older observations.`);
    changes = calculateChanges(series,{...q,start:undefined});
  }
  if (series.some(s => s.points.some(p => p.value === null))) limits.push('Gaps represent unavailable observations. They are not zero demand and are not interpolated.');
  const hasData = series.some(s => s.points.some(p => p.value !== null));
  if (!hasData) limits.push('No observations match this selection. Try an available date range or use the catalog to inspect supported slices.');
  const title = q.mode === 'ranking' ? `${q.topic === 'skills' ? 'Technology' : q.topic === 'roles' ? 'Role' : 'Indicator'} ${q.rankingBy === 'change' ? 'changes' : 'ranking'}`
    : series.map(s => s.label).join(' & ') || 'No matching data';
  const id = 'result_' + createHash('sha256').update(JSON.stringify({q,release:DATA_RELEASE})).digest('hex').slice(0,20);
  return {id,status:hasData?'ok':'empty',title,query:q,series,changes,sources:sourceRefs(selected,series),limitations:unique(limits),
    allowedViews:q.mode === 'history' ? ['line','table','bar','metric_cards'] : ['bar','table','metric_cards'],
    generatedAt:new Date().toISOString(),release:DATA_RELEASE,truncated};
}

export function compareMetrics(input: QueryInput): AnalyticsResult {
  const q = parseQuery(input);
  if (q.seriesIds.length < 1 && q.mode !== 'ranking') throw new AnalyticsError('INVALID_QUERY','Choose at least one series and two available dates, or two compatible series.');
  const result = queryMetrics({...q,mode:q.mode === 'ranking'?'ranking':'history'});
  if (!result.changes.length) result.limitations = unique([...result.limitations,'Fewer than two common observed periods are available; no time change can be calculated.']);
  return result;
}

export function searchEvidence(query = ''): Evidence[] {
  if (typeof query !== 'string' || query.length > 2000) throw new AnalyticsError('INVALID_QUERY','Evidence query must be a string of at most 2000 characters.');
  const evidence: Evidence[] = rows('SELECT * FROM reference_notes').map(row => ({id:text(row.id),title:text(row.title),summary:text(row.summary),limitations:text(row.limitations),period:text(row.reference_period),url:text(row.source_url),locator:text(row.locator)}));
  for (const row of rows('SELECT * FROM policy_cards')) {
    const card = JSON.parse(text(row.card_json)) as Record<string,unknown>;
    evidence.push({id:text(row.id),title:text(card.title),summary:text(card.summary),limitations:`${text(card.limits)} Status was provisional at the saved publication date; current legal status is not verified by this frozen dataset.`,period:text(row.document_date),url:text(row.source_url),locator:'Publisher dated notice',status:text(row.publisher_status)});
  }
  const needle = query.toLowerCase().split(/\s+/).filter(w => w.length>2);
  if (!needle.length) return evidence;
  const scored=evidence.map(e=>({e,n:needle.reduce((sum,w)=>sum+Number(`${e.title} ${e.summary} ${e.limitations}`.toLowerCase().includes(w)),0)}));
  return scored.filter(x=>x.n>0).sort((a,b)=>b.n-a.n).slice(0,5).map(x=>x.e);
}

export function getOverview(): Bootstrap['overview'] {
  const latest=rows("SELECT MAX(period_end) last FROM observations WHERE series_id='itboard_monitor_total_open_ads'")[0];
  const snapshot=rows(`SELECT c.family,c.category,c.numerator FROM itboard_cells c JOIN observations o USING(observation_id)
    WHERE o.geography='CH' AND o.period_end=?`,[text(latest.last)]);
  const find=(family:string,category:string)=>{
    const value=num(snapshot.find(r=>r.family===family&&r.category===category)?.numerator);
    if(value===null) throw new AnalyticsError('MISSING_OVERVIEW','A required overview metric is absent from this verified snapshot.');
    return value;
  };
  return {listings:find('inserate','gezaehlt'),employers:find('arbeitgeber','anzahl'),juniors:find('erfahrung','junior'),asOf:text(latest.last)};
}
