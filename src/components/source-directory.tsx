'use client';
import Link from 'next/link';
import { ExternalLink,BookOpen,Database } from 'lucide-react';
import type { DataInventory } from '@/lib/contracts';
import { libraryHref } from '@/lib/workspace-routing';
import { formatDate } from './result-view';

export function SourceDirectory({inventory}:{inventory:DataInventory}) {
  return <section className="source-directory">
    <div className="coverage-banner"><BookOpen size={22}/><div><strong>Check the evidence behind every view.</strong><p>Reviewed release {inventory.release} · checked {formatDate(inventory.checkedOn)}. This is a frozen dataset; publication and observation dates differ.</p></div></div>
    <div className="source-directory-grid">{inventory.sources.map(source=><article className="source-card" key={source.id} id={source.id}>
      <div><span className="source-publisher">{source.publisher}</span><h2>{source.title}</h2><p>{source.coverage}</p>
      <dl><dt>Observations</dt><dd>{formatDate(source.first)} – {formatDate(source.last)}</dd><dt>Retrieved</dt><dd>{source.retrievedAt?formatDate(source.retrievedAt):'Not recorded'}</dd><dt>Reviewed</dt><dd>{source.reviewedOn?formatDate(source.reviewedOn):'Not recorded'}</dd><dt>Reuse</dt><dd>{source.license}</dd></dl>
      <details><summary>Definitions & limitations</summary><ul>{source.limitations.map((text,index)=><li key={index}>{text}</li>)}</ul></details>
      <div className="source-directory-actions"><Link className="text-button" href={libraryHref({source:source.id,coverage:source.nationalSeriesCount?'CH':'all'})}><Database size={15}/>Browse indicators</Link><a className="source-link" href={source.url} target="_blank" rel="noreferrer">Original source <ExternalLink size={14}/></a></div>
      </div></article>)}</div>
    <div className="overview-section-heading"><h2>Research & dated notices</h2></div>
    <div className="library-evidence-grid">{inventory.evidence.map(item=><article key={item.id}><h3>{item.title}</h3><small>{item.period}{item.status?' · Provisional at saved date':''}</small><p>{item.summary}</p><p className="evidence-limit">{item.limitations}</p><a className="source-link" href={item.url} target="_blank" rel="noreferrer">Read original · {item.locator}<ExternalLink size={14}/></a></article>)}</div>
    <details className="library-exclusions"><summary>Coverage, exclusions & methodology</summary><ul>{inventory.limitations.map((text,index)=><li key={index}>{text}</li>)}</ul>{inventory.excludedSources.map(source=><div key={source.id}><strong>{source.name}</strong><p>{source.reason}</p></div>)}</details>
  </section>;
}
