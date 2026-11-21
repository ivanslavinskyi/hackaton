import {AnalyticsError,DATA_RELEASE,getCatalog,queryMetrics} from './analytics';
import {decisionScopeSchema,PARTICIPANT_GROUPS,getDecisionOptions,type DecisionBrief,type DecisionPanel,type DecisionScope,type ParticipantGroup} from './decision-contracts';
import type {QueryInput} from './contracts';

export function validateDecisionScope(input:DecisionScope):DecisionScope{
  const scope=decisionScopeSchema.parse(input),options=getDecisionOptions(getCatalog());
  if(scope.kind==='opportunities'){
    if(scope.group!==undefined||(scope.geography&&scope.geography!=='CH'))throw new AnalyticsError('UNSUPPORTED_BRIEF_FILTER','Role and junior signals are national; participant status is not a job filter.');
    const role=scope.role||'itboard_csv_rolle_it-support';
    if(!options.roles.some(item=>item.id===role))throw new AnalyticsError('UNSUPPORTED_BRIEF_FILTER','Choose a published national ITBoard role tag.');
    return {kind:scope.kind,role,geography:'CH'};
  }
  if(scope.role!==undefined)throw new AnalyticsError('UNSUPPORTED_BRIEF_FILTER','SEM has no IT role or graduate-outcome breakdown.');
  const geography=scope.geography||'CH';
  if(!options.geographies.includes(geography))throw new AnalyticsError('UNSUPPORTED_BRIEF_FILTER','Choose Switzerland or a published SEM canton.');
  return {kind:scope.kind,group:scope.group||'all',geography};
}

/** A bounded collection of ordinary engine results, never a new synthetic market metric. */
export function getDecisionBrief(input:DecisionScope):DecisionBrief{
  const scope=validateDecisionScope(input),catalog=getCatalog();
  function panel(id:string,title:string,description:string,query:QueryInput,view:DecisionPanel['view']='line',extra:Partial<DecisionPanel>={}):DecisionPanel{
    return {id,title,description,result:queryMetrics(query),view,...extra};
  }
  if(scope.kind==='opportunities'){
    const role=catalog.find(item=>item.id===scope.role)!;
    const latest=catalog.find(item=>item.id==='itboard_monitor_total_open_ads')!.last;
    const panels=[
      panel('role',role.label,'Published role tag across all experience levels. Tags can overlap; this is not a count of suitable graduate vacancies.',{seriesIds:[role.id],measure:'share',geography:'CH'},'line',{
        note:role.observations<3?'Sparse evidence: too few snapshots to infer a sustained trend.':role.last<latest?'The latest observation for this role predates the latest platform snapshot. Missing observations are not zero.':undefined}),
      panel('junior','Junior-tagged listings','A separate experience signal across all roles. It is not filtered by the selected role or technology.',{seriesIds:['itboard_csv_erfahrung_junior'],measure:'share',geography:'CH'}),
      panel('skills','Technologies across the sample','Most-mentioned named technologies in the available ITBoard snapshot, across all roles and experience levels.',{mode:'ranking',topic:'skills',sourceId:'itboard_monitor_csv',metric:'platform_tagged_open_ads',geography:'CH',measure:'share',limit:8},'bar'),
      panel('industry','Official industry context','BFS vacancies by employer industry. These are not junior vacancies or a count of people in the selected role.',{seriesIds:['fso_jobstat_ch_vacancies_div_62_63'],measure:'reported',geography:'CH',start:'2021-01-01'}),
    ];
    const rolePoints=panels[0].result.series[0].points,latestCount=rolePoints.filter(point=>point.value!==null).at(-1)?.count;
    panels[0].note=[panels[0].note,latestCount!==null&&latestCount!==undefined&&latestCount<10?'Small counts: fewer than ten tagged listings in the latest available role snapshot. Interpret percentage changes cautiously.':undefined,rolePoints.some(point=>point.value===null)?'Some snapshots are missing; gaps are not zero demand.':undefined].filter(Boolean).join(' ')||undefined;
    return {scope,title:'Graduate opportunities',description:`Investigate ${role.label} with separate signals for entry-level access, technology demand and the wider market.`,panels,release:DATA_RELEASE,
      limitations:['National scope does not mean a census of Swiss jobs. ITBoard is one platform sample with changing coverage.','There is no role × junior × skill intersection. Choosing a role changes only the role panel.','Junior tags do not establish suitability for Powercoders graduates; experience, language, qualifications and work authorisation are not available here.','No employer names, graduate placement rates or programme outcomes are available.'],
      nextSteps:['Ask partner employers which entry requirements they can relax and which skills they assess in practice.','Validate the role signal against current partner vacancies and graduates’ language and experience profiles.','Combine this evidence with programme completion, placement and retention outcomes before changing training capacity.']};
  }
  const groups=scope.group==='all'?Object.keys(PARTICIPANT_GROUPS) as ParticipantGroup[]:[scope.group as ParticipantGroup];
  const metrics=[['population','registry_working_age_people','Working-age population'],['employed','registry_employed_people','Registered employed'],['rate','registry_employment_rate','Employment rate']] as const;
  const panels=groups.flatMap(group=>metrics.map(([metric,metricId,title])=>{
    const definition=PARTICIPANT_GROUPS[group],item=catalog.find(item=>item.sourceId===definition.sourceId&&item.geography===scope.geography&&item.metric===metricId);
    if(!item)throw new AnalyticsError('INSUFFICIENT_DATA','This group and geography do not have the requested published indicator.');
    return panel(`${group}-${metric}`,title,`${definition.description}, ages 18–64. All employment sectors.`,{seriesIds:[item.id],geography:scope.geography,measure:'reported',mode:'snapshot'},'metric_cards',{group,metric});
  }));
  return {scope,title:'Participant context',description:'Understand the published employment context of the populations Powercoders may serve.',panels,release:DATA_RELEASE,
    limitations:['SEM provides one snapshot in this release. It cannot show an employment trend.','These are administrative population groups across all sectors, not Powercoders participants or IT placements. Refugee B does not mean all B-permit holders.','Groups have different populations and denominators. They are shown separately, without a combined employment rate, ranking or causal comparison.','Origin, programme participation, language, time since arrival and individual work eligibility are not available.'],
    nextSteps:['Use the population context to frame discussions with canton and integration partners.','Request programme-specific participation, placement and retention evidence before allocating training places.','Check current official rules separately when deciding an individual participant’s eligibility.']};
}
