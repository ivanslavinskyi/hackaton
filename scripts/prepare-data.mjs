import {existsSync,readFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const candidates=['../market-radar-discovery/national-skills-review-2026-11-21','../temp/market-radar-discovery/national-skills-review-2026-11-21'];
const source=process.argv[2]||process.env.MARKET_RADAR_RELEASE_DIR||candidates.find(p=>existsSync(resolve(p,'manifest.json')));
if(!source) throw new Error('Provide the verified release directory: npm run data:prepare -- <release-directory>');
const root=resolve(source),manifest=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
if(manifest.version!=='0.6.0-local') throw new Error('This application expects the reviewed 0.6.0-local release.');
const files={'market-radar-public-ch.sqlite':'market-radar.sqlite','capabilities-public-ch.json':'capabilities-public-ch.json','capabilities-regional-ch.json':'capabilities-regional-ch.json'};
for(const name of Object.keys(files)) {
  const hash=createHash('sha256').update(readFileSync(join(root,name))).digest('hex');
  if(hash!==manifest.sha256[name]) throw new Error(`Source hash mismatch: ${name}`);
}
const db=new DatabaseSync(join(root,'market-radar-public-ch.sqlite'),{readOnly:true});
if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok') throw new Error('Source database integrity check failed.');
if(db.prepare("SELECT count(*) AS n FROM observations WHERE usage_scope!='swiss_core' OR source_family='getuhired'").get().n) throw new Error('Source contains records outside the approved serving scope.');
db.close();
const destination=resolve('data');mkdirSync(destination,{recursive:true});
for(const [name,target] of Object.entries(files)) copyFileSync(join(root,name),join(destination,target));
copyFileSync(join(root,'manifest.json'),join(destination,'manifest.json'));
console.log(`Verified public data prepared: ${manifest.public_observations} observations, ${manifest.national_public_observations} national observations. Research data was not imported.`);
