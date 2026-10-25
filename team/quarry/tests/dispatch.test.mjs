import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildGraph,DispatchSimulation,STATES} from '../dist/dispatch-core.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL('../dist/assets/'+name,import.meta.url)));
const graph=buildGraph(read('road-route.json'),read('terrain-design.json'));
const create=options=>new DispatchSimulation(graph,options);

test('graph has connected routes, four node types and eight separate bay branches',()=>{
  assert.equal(graph.hubs.filter(h=>h.type==='PASSING_BAY').length,8);
  assert.deepEqual(new Set(graph.nodes.map(n=>n.type)),new Set(['WAYPOINT','PASSING_BAY','CRUSHER','LOADER']));
  const nodes=new Map(graph.nodes.map(n=>[n.id,n]));const edges=new Map(graph.edges.map(e=>[e.id,e]));
  for(const e of edges.values()){assert.ok(e.length>0);assert.equal(e.isOccupied,false);assert.equal(e.direction,null);assert.ok(nodes.has(e.from)&&nodes.has(e.to));assert.ok(nodes.get(e.from).s<nodes.get(e.to).s)}
  for(const path of [graph.downRoute,graph.upRoute.slice().reverse()])for(let i=1;i<path.length;i++)assert.equal(edges.get(path[i-1]).to,edges.get(path[i]).from);
  for(const h of graph.hubs.slice(1,-1)){assert.notEqual(h.pocketNode,h.mainNode);assert.ok(Math.abs(nodes.get(h.pocketNode).lateral-9.5)<.001)}
});

test('default automatic shift wins, all FSM states occur and no opposing reservation overlaps',()=>{
  const s=create(),seen=new Set();s.start();
  while(s.status==='running'){
    s.tick(.05);s.trucks.forEach(t=>seen.add(t.state));
    for(const block of s.blocks)assert.ok(block.size<=1,'one admitted truck per automatic block');
    for(const e of s.edges.values()){assert.equal(e.isOccupied,Boolean(e.owner));if(e.owner)assert.ok(s.trucks.some(t=>t.id===e.owner&&(t.edgeId===e.id||t.tail?.id===e.id)))}
  }
  assert.equal(s.status,'won');assert.equal(s.tonnes,500);assert.equal(s.stars,3);assert.ok(s.elapsed<300);assert.ok(s.fuel>s.config.fuel*.2);assert.equal(s.emergencyStops,0);
  for(const state of Object.values(STATES))assert.ok(seen.has(state),state);
});

test('fixed-step simulation gives the same shift at 20 and 60 FPS',()=>{
  const a=create(),b=create();a.start();b.start();for(let i=0;i<2000;i++)a.tick(.05);for(let i=0;i<6000;i++)b.tick(1/60);
  assert.equal(a.elapsed,b.elapsed);assert.equal(a.fuel,b.fuel);assert.equal(a.tonnes,b.tonnes);assert.deepEqual(a.trucks,b.trucks);
});

test('pause freezes resources; reset clears reservations and terminal state',()=>{
  const s=create();s.start();s.tick(3);s.paused=true;const before=JSON.stringify([s.elapsed,s.fuel,s.trucks]);s.tick(30);assert.equal(JSON.stringify([s.elapsed,s.fuel,s.trucks]),before);
  s.reset();assert.equal(s.status,'ready');assert.equal(s.fuel,260);assert.equal(s.elapsed,0);assert.ok([...s.edges.values()].every(e=>!e.isOccupied));assert.ok(s.blocks.every(b=>!b.size));assert.equal(s.services.LOADER,null);
});

test('manual trucks hold until an explicit GO command or a green node signal',()=>{
  const s=create();s.setMode('manual');s.start();s.tick(5);assert.ok(s.trucks.every(t=>!t.edgeId));
  s.command('T1','GO');s.tick(1);assert.equal(s.trucks[0].state,STATES.MOVING_EMPTY);assert.equal(s.trucks[1].state,STATES.IDLE);
  s.setSignal(9,'up',true);s.tick(1);assert.equal(s.trucks[2].state,STATES.MOVING_FULL);
});

test('opening all manual signals causes a real opposing edge wait-cycle, not a timeout',()=>{
  const s=create();s.setMode('manual');s.signals.forEach(signal=>signal.up=signal.down=true);s.start();s.tick(300);
  assert.equal(s.status,'lost');assert.match(s.reason,/встречный затор/);assert.ok(s.elapsed<300);assert.equal(s.emergencyStops,1);assert.ok(s.trucks.some(t=>t.edgeId&&t.blockedBy));
});

test('empty truck holds in a pocket for a loaded approach',()=>{
  const s=create();s.start();let held=false;
  for(let i=0;i<3000&&s.status==='running';i++){s.tick(.05);held ||=s.trucks.some(t=>!t.full&&!t.edgeId&&t.hub>0&&t.hub<9&&t.state===STATES.WAITING&&s.lateral(t)>9)}
  assert.ok(held);
});

test('service timers award ore exactly once and loaded travel is slower',()=>{
  const s=create(),t=s.trucks[0];t.hub=9;t.nodeId=graph.hubs.at(-1).mainNode;assert.ok(s.beginService(t));assert.equal(t.serviceTime,7);s.advanceService(t,6.9);assert.equal(t.full,false);s.advanceService(t,.11);assert.equal(t.full,true);
  t.hub=0;t.nodeId=graph.hubs[0].mainNode;s.beginService(t);s.advanceService(t,3.9);assert.equal(s.tonnes,0);s.advanceService(t,.11);assert.equal(s.tonnes,100);assert.equal(t.full,false);assert.equal(t.trips,1);assert.equal(s.config.fullSpeedFactor,.6);
});

test('time and shared-fuel exhaustion terminate and freeze the shift',()=>{
  const timeout=create({duration:1});timeout.setMode('manual');timeout.start();timeout.tick(2);assert.equal(timeout.status,'lost');assert.match(timeout.reason,/Смена закончилась/);assert.equal(timeout.elapsed,1);
  const fuel=create({fuel:.1});fuel.start();fuel.tick(10);assert.equal(fuel.status,'lost');assert.equal(fuel.fuel,0);assert.match(fuel.reason,/Топливо/);const elapsed=fuel.elapsed;fuel.tick(100);assert.equal(fuel.elapsed,elapsed);
});

test('brake overheating leaves the truck and its occupied edge in place',()=>{
  const s=create({brakeLimit:29});s.start();s.tick(20);const broken=s.trucks.find(t=>t.broken);assert.ok(broken);assert.ok(broken.edgeId);assert.equal(s.edges.get(broken.edgeId).owner,broken.id);const p=s.position(broken);s.tick(10);assert.deepEqual(s.position(broken),p);assert.equal(broken.state,STATES.WAITING);
});

test('strict star conditions: fuel threshold and station queues',()=>{
  for(const [fuel,queue,emergency,stars] of [[52,0,0,1],[53,1,0,2],[53,0,0,3],[100,0,1,1]]){const s=create();s.start();s.fuel=fuel;s.serviceQueueWait=queue;s.emergencyStops=emergency;s.finish(true,'test');assert.equal(s.stars,stars)}
});
