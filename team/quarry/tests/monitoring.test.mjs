import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createCollector} from '../monitoring/metrics-core.mjs';
import {createMetricsServer} from '../monitoring/exporter.mjs';
const json=name=>JSON.parse(readFileSync(new URL('../dist/assets/'+name,import.meta.url)));

test('server control runs reproduce the baseline and delayed shift without changing the game core',()=>{
  const collector=createCollector(json('road-route.json'),json('terrain-design.json'));
  const baseline=collector.reference.find(r=>r.config.id==='baseline'),delayed=collector.reference.find(r=>r.config.id==='delay60');
  assert.equal(baseline.tonnes,500);assert.ok(Math.abs(baseline.seconds-269.05)<.1);assert.equal(delayed.tonnes,400);
  for(let i=0;i<5;i++)collector.tick(1);
  assert.ok(collector.runs[0].sim.elapsed>4.9);assert.ok(collector.metrics().includes('quarry_shift_tonnes{scenario="baseline"}'));
  assert.ok(!collector.metrics().includes('reason='),'free text must not become metric labels');
});
test('metrics reject anonymous access and writes, accept only the configured bearer token',async()=>{
  const token=randomBytes(32).toString('hex'),server=createMetricsServer({token,collector:{metrics:()=> 'quarry_test 1\n'}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/metrics';
  try{
    assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:{Authorization:'Bearer invalid'}})).status,401);
    const headers={Authorization:'Bearer '+token};assert.equal((await fetch(url,{headers,method:'POST'})).status,405);
    const response=await fetch(url,{headers});assert.equal(response.status,200);assert.equal(await response.text(),'quarry_test 1\n');
  }finally{await new Promise(resolve=>server.close(resolve))}
  assert.throws(()=>createMetricsServer({token:'',collector:{}}),/QUARRY_METRICS_TOKEN/);
});
