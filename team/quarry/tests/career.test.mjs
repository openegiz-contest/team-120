import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildGraph,STATES} from '../dist/dispatch-core.mjs';
import {CareerSimulation,ECONOMY} from '../dist/career-core.mjs';
const read=n=>JSON.parse(fs.readFileSync(new URL('../dist/assets/'+n,import.meta.url)));
const graph=buildGraph(read('road-route.json'),read('terrain-design.json'));
const roundtrip=s=>CareerSimulation.restore(graph,JSON.parse(JSON.stringify(s.snapshot())));

test('new career starts with one empty truck, one excavator and no money',()=>{const s=new CareerSimulation(graph);assert.equal(s.trucks.length,1);assert.equal(s.excavators,1);assert.equal(s.wallet,0);assert.equal(s.trucks[0].full,false);assert.equal(s.trucks[0].hub,9);assert.equal(s.stage,'welcome');s.tick(100);assert.equal(s.elapsed,0)});

test('tutorial pauses at load, first reward, truck purchase and excavator purchase',()=>{
  const s=new CareerSimulation(graph);s.tutorialAction();s.tick(1000);assert.equal(s.stage,'haul');assert.equal(s.wallet,0);assert.ok(s.trucks[0].full);
  const held=s.elapsed;s.tick(100);assert.equal(s.elapsed,held);
  s.tutorialAction();s.tick(1000);assert.equal(s.stage,'first-reward');assert.equal(s.wallet,100);assert.equal(s.deliveries,1);assert.equal(s.buy('truck'),false);
  s.tutorialAction();s.tick(1000);assert.equal(s.stage,'buy-truck');assert.equal(s.wallet,200);assert.equal(s.deliveries,2);
  assert.ok(s.buy('truck'));assert.equal(s.wallet,0);assert.equal(s.trucks.length,2);assert.equal(s.stage,'fleet-ready');assert.equal(s.buy('truck'),false);
  s.tutorialAction();s.tick(1000);assert.equal(s.stage,'buy-excavator');assert.equal(s.deliveries,7);assert.equal(s.wallet,500);assert.ok(s.buy('excavator'));assert.equal(s.wallet,0);assert.equal(s.stage,'complete');assert.equal(s.excavators,2);assert.equal(s.config.loadingSeconds,4);
});

test('two trucks deliver more than one over the same time',()=>{const one=new CareerSimulation(graph),two=new CareerSimulation(graph);one.skipTutorial();two.skipTutorial();two.wallet=200;two.buy('truck');one.tick(600);two.tick(600);assert.ok(two.deliveries>one.deliveries*1.5);assert.equal(one.status,'running');assert.equal(two.status,'running');assert.equal(one.wallet,one.deliveries*100);assert.equal(two.wallet,two.deliveries*100)});

test('second excavator creates a second real loading slot and halves loading time',()=>{
  const s=new CareerSimulation(graph),a=s.trucks[0],b=s.addTruck(true);s.beginService(a);assert.equal(a.serviceTime,8);assert.equal(s.beginService(b),false);s.wallet=500;assert.ok(s.buy('excavator'));assert.ok(s.beginService(b));assert.equal(b.serviceTime,4);assert.deepEqual(s.loaderSlots,[a.id,b.id]);
});

test('no credit at loading; exactly one credit at unloading',()=>{const s=new CareerSimulation(graph),t=s.trucks[0];s.skipTutorial();s.beginService(t);s.advanceService(t,8);assert.equal(s.wallet,0);t.hub=0;t.nodeId=graph.hubs[0].mainNode;s.beginService(t);s.advanceService(t,2.99);assert.equal(s.wallet,0);s.advanceService(t,.02);assert.equal(s.wallet,100);assert.equal(t.full,false);s.tick(.1);assert.equal(s.wallet,100)});

test('purchases are atomic, bounded and do not create money',()=>{const s=new CareerSimulation(graph);assert.equal(s.buy('truck'),false);s.wallet=200;assert.equal(s.buy('truck'),true);assert.equal(s.buy('truck'),false);assert.equal(s.wallet,0);s.wallet=2000;assert.equal(s.buy('invalid'),false);s.buy('truck');s.buy('truck');assert.equal(s.trucks.length,4);const balance=s.wallet;assert.equal(s.buy('truck'),false);assert.equal(s.wallet,balance);s.buy('excavator');assert.equal(s.buy('excavator'),false);assert.equal(s.excavators,2);assert.equal(ECONOMY.truck,2*ECONOMY.delivery);assert.equal(ECONOMY.excavator,5*ECONOMY.delivery)});

test('saving during a journey preserves positions, money, cargo and reservations',()=>{const a=new CareerSimulation(graph);a.skipTutorial();a.wallet=200;a.buy('truck');a.tick(15);const b=roundtrip(a);assert.ok(b);assert.ok(b.paused);assert.equal(b.wallet,a.wallet);assert.deepEqual(b.trucks,a.trucks);assert.deepEqual([...b.edges.values()].map(e=>e.owner),[...a.edges.values()].map(e=>e.owner));b.paused=false;for(let i=0;i<100;i++){a.tick(.05);b.tick(.05)}assert.equal(a.deliveries,b.deliveries);assert.deepEqual(a.trucks,b.trucks)});

test('reload during unloading cannot grant the same delivery twice',()=>{const a=new CareerSimulation(graph);a.skipTutorial();while(a.trucks[0].state!==STATES.UNLOADING)a.tick(.05);a.tick(1);const b=roundtrip(a);assert.ok(b);b.paused=false;b.tick(3);assert.equal(b.wallet,100);const c=roundtrip(b);assert.equal(c.wallet,100);c.paused=false;c.tick(1);assert.equal(c.wallet,100)});

test('save restores simultaneous loading and corrupt data is rejected',()=>{const s=new CareerSimulation(graph);s.wallet=500;s.buy('excavator');const b=s.addTruck(true);s.skipTutorial();s.beginService(s.trucks[0]);s.beginService(b);const restored=roundtrip(s);assert.ok(restored);assert.deepEqual(restored.loaderSlots,s.loaderSlots);assert.equal(CareerSimulation.restore(graph,{version:99}),null);const data=s.snapshot();data.trucks[0].nodeId='missing';assert.equal(CareerSimulation.restore(graph,data),null)});

test('pause, skip and reset do not gift credits or preserve bought equipment on reset',()=>{const s=new CareerSimulation(graph);s.skipTutorial();s.tick(15);s.paused=true;const p=JSON.stringify(s.snapshot());s.tick(1000);assert.equal(JSON.stringify(s.snapshot()),p);const money=s.wallet;s.skipTutorial();assert.equal(s.wallet,money);s.wallet=700;s.buy('truck');s.buy('excavator');s.reset();assert.equal(s.wallet,0);assert.equal(s.trucks.length,1);assert.equal(s.excavators,1);assert.equal(s.stage,'welcome');assert.ok([...s.edges.values()].every(e=>!e.isOccupied))});
