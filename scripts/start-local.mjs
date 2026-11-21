import {existsSync, cpSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {spawn} from 'node:child_process';

const root=process.cwd();
const standalone=resolve(root,'.next/standalone');
if(!existsSync(join(standalone,'server.js')))throw new Error('Run npm run build before npm start.');
if(existsSync(join(root,'.env.local')))process.loadEnvFile(join(root,'.env.local'));
cpSync(join(root,'.next/static'),join(standalone,'.next/static'),{recursive:true});
if(existsSync(join(root,'public')))cpSync(join(root,'public'),join(standalone,'public'),{recursive:true});
const child=spawn(process.execPath,['--use-system-ca',join(standalone,'server.js')],{
  stdio:'inherit',windowsHide:true,
  env:{...process.env,HOSTNAME:'127.0.0.1',PORT:process.env.PORT||'3000',
    MARKET_RADAR_DATA_DIR:process.env.MARKET_RADAR_DATA_DIR||join(root,'data'),
    MARKET_RADAR_SESSION_DB:process.env.MARKET_RADAR_SESSION_DB||join(root,'.runtime/conversations.sqlite')}
});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
