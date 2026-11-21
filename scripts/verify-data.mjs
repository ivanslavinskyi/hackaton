import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {isSourceEnabled} from '../src/lib/source-policy.ts';

const root=resolve(process.env.MARKET_RADAR_DATA_DIR||'data');
const manifest=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
assert.equal(manifest.version,'0.6.0-local');
const files={'market-radar.sqlite':'market-radar-public-ch.sqlite','capabilities-public-ch.json':'capabilities-public-ch.json','capabilities-regional-ch.json':'capabilities-regional-ch.json'};
for(const [local,original] of Object.entries(files))assert.equal(createHash('sha256').update(readFileSync(join(root,local))).digest('hex'),manifest.sha256[original],`Approved release hash: ${local}`);
const db=new DatabaseSync(join(root,'market-radar.sqlite'),{readOnly:true});
try{
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.equal(db.prepare("SELECT count(*) n FROM observations WHERE usage_scope!='swiss_core' OR source_family='getuhired' OR period_start>period_end").get().n,0);
 assert.equal(db.prepare("SELECT count(*) n FROM observations o LEFT JOIN source_review r USING(source_id) WHERE r.use_mode IS NULL OR r.use_mode!='numeric'").get().n,0);
 const counts=db.prepare("SELECT count(*) observations,count(DISTINCT series_id) series,sum(CASE WHEN geography='CH' THEN 1 ELSE 0 END) nationalObservations,sum(CASE WHEN value IS NULL THEN 1 ELSE 0 END) nullValues FROM observations").get();
 assert.equal(counts.observations,manifest.public_observations);
 assert.equal(counts.nationalObservations,manifest.national_public_observations);
 const sources=db.prepare(`SELECT source_id,count(*) observations,count(DISTINCT series_id) series,sum(CASE WHEN geography='CH' THEN 1 ELSE 0 END) nationalObservations,count(DISTINCT CASE WHEN geography='CH' THEN series_id END) nationalSeries,min(period_start) first,max(period_end) last FROM observations GROUP BY source_id`).all();
 for(const source of sources)assert.equal(source.observations,manifest.public_counts_by_source[source.source_id]);
 const enabled=sources.filter(source=>isSourceEnabled(source.source_id));
 const active={observations:enabled.reduce((n,s)=>n+s.observations,0),series:enabled.reduce((n,s)=>n+s.series,0),nationalObservations:enabled.reduce((n,s)=>n+s.nationalObservations,0),nationalSeries:enabled.reduce((n,s)=>n+s.nationalSeries,0),sources:enabled.length};
 assert.deepEqual(active,{observations:3445,series:595,nationalObservations:2015,nationalSeries:168,sources:10});
 console.log(JSON.stringify({status:'passed',release:manifest.version,checkedOn:manifest.checked_on,archive:{counts,sourceCount:sources.length},active,sources:enabled,verification:'Original archive hashes and integrity are preserved. Active counts apply the shared source policy. Publisher microdata and live updates are not independently verified by this check.'},null,2));
}finally{db.close();}
