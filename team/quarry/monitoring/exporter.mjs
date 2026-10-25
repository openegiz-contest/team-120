import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createCollector} from './metrics-core.mjs';

export function createMetricsServer({token,collector}){
  if(!token||token.length<32)throw new Error('QUARRY_METRICS_TOKEN must contain at least 32 characters');
  const expected=Buffer.from('Bearer '+token);
  const server=http.createServer((req,res)=>{
    const auth=Buffer.from(req.headers.authorization||'');
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(auth.length!==expected.length||!timingSafeEqual(auth,expected)){res.writeHead(401);res.end('Unauthorized\n');return}
    if(req.method!=='GET'){res.writeHead(405,{Allow:'GET'});res.end();return}
    if(req.url!=='/metrics'){res.writeHead(404);res.end();return}
    res.writeHead(200,{'Content-Type':'text/plain; version=0.0.4; charset=utf-8'});res.end(collector.metrics());
  });
  server.requestTimeout=5000;server.headersTimeout=5000;server.maxHeadersCount=32;return server;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const load=async name=>JSON.parse(await readFile(new URL('../dist/assets/'+name,import.meta.url),'utf8'));
  const collector=createCollector(await load('road-route.json'),await load('terrain-design.json'));
  const server=createMetricsServer({token:process.env.QUARRY_METRICS_TOKEN,collector});
  const timer=setInterval(()=>collector.tick(1),1000);
  server.listen(Number(process.env.QUARRY_METRICS_PORT||9187),'127.0.0.1',()=>console.log('QUARRY control-run exporter listening on loopback'));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);server.close(()=>process.exit(0))});
}
