import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {createRockfalls,findRockfallSite} from '../dist/manual-rockfalls.mjs';
import {createManualWorksite} from '../dist/manual-worksite.mjs';
import {ManualDrive} from '../dist/manual-core.mjs';
import {createExcavatorRig} from '../dist/excavator-rig.mjs';
const route=Array.from({length:81},(_,i)=>[i*3,(i-40)*3,0,0]);
const sample=(x,z)=>Math.abs(z)>7?12:0;
const drive={x:0,y:.08,z:0,yaw:0};
function setup(occupied=()=>false){const root=new THREE.Group(),messages=[];return {root,messages,falls:createRockfalls({root,sample,route,occupied,onNotice:t=>messages.push(t)})}}
function advance(falls,seconds){for(let i=0;i<Math.ceil(seconds*60);i++)falls.step(1/60)}
const vehicle=(p,y=p.y)=>({x:p.x,z:p.z,y,height:5.65,length:4.85,width:2.92,yaw:0});

test('rockfalls select a real road under a higher face, avoiding occupied zones and other terraces',()=>{
  const p=findRockfallSite(route,drive,sample,()=>false);assert.ok(p);assert.ok(p.x>0);assert.ok(p.source.y>=p.y+4);assert.equal(p.y,0);
  assert.equal(findRockfallSite(route,drive,sample,()=>true),null);
  assert.equal(findRockfallSite(route,{...drive,y:30},sample,()=>false),null);
  assert.equal(findRockfallSite(route,drive,()=>0,()=>false),null);
});
test('warning precedes gravity-driven fall; occupied warning zones delay the fall safely',()=>{
  let occupied=false;const {falls,root}=setup(()=>occupied);
  assert.equal(falls.request({drive}),true);assert.equal(falls.request({drive}),false);
  const p=falls.report().position;advance(falls,3);assert.equal(falls.report().phase,'warning');assert.equal(falls.collision(vehicle(p)),null);
  occupied=true;advance(falls,5);assert.equal(falls.report().phase,'warning');assert.equal(falls.report().remaining,0);
  occupied=false;advance(falls,.1);assert.equal(falls.report().phase,'falling');assert.ok(falls.collision(vehicle(p)));
  const rocks=root.children[0].children.filter(m=>m.geometry?.type==='DodecahedronGeometry'),height=rocks[0].position.y;
  advance(falls,.4);assert.ok(rocks[0].position.y<height);advance(falls,4);assert.equal(falls.report().phase,'blocked');
  assert.equal(falls.collision(vehicle(p,24)),null);assert.ok(falls.collision(vehicle(p)));
  falls.dispose();assert.equal(root.children.length,0);
});
test('rubble stays until excavated; partial scoops conserve finite volume and reopen the road',()=>{
  const {falls,root,messages}=setup();falls.request({drive});advance(falls,12);const initial=falls.report().remaining,p=falls.report().position;
  advance(falls,180);assert.equal(falls.report().remaining,initial);assert.ok(falls.collision(vehicle(p)));
  assert.equal(falls.dig({x:500,y:0,z:0},.9,1.2),0);
  const rocks=root.children[0].children.filter(m=>m.geometry?.type==='DodecahedronGeometry');let taken=0;
  for(const rock of rocks)for(let i=0;i<100;i++)taken+=falls.dig(rock.position,.9,.023);
  assert.ok(Math.abs(taken-initial)<1e-9);assert.equal(falls.report().remaining,0);assert.equal(falls.report().phase,'cleared');assert.equal(falls.collision(vehicle(p)),null);
  assert.ok(messages.some(m=>m.includes('Проезд открыт')));falls.dispose();
});
test('automatic hazards obey the practice toggle and never stack a second active blockage',()=>{
  const {falls}=setup();falls.focus({drive});falls.setAutomatic(false);advance(falls,180);assert.equal(falls.report().phase,'idle');
  falls.setAutomatic(true);advance(falls,110);assert.equal(falls.report().phase,'blocked');const added=falls.report().added;
  advance(falls,200);assert.equal(falls.report().added,added);falls.dispose();
});
test('worksite bucket collects rubble within capacity and collision blocks a driving truck',()=>{
  const scene=new THREE.Scene(),sessions=new Map(),orient=s=>{s.mesh.position.set(s.drive.x,s.drive.y,s.drive.z);s.mesh.updateMatrixWorld(true)};
  const site=createManualWorksite({scene,sessions,sample,orient,blockers:[],roadRoute:route,onNotice(){}});
  const mesh=new THREE.Group();scene.add(mesh);const s={kind:'excavator',label:'E1',mesh,drive:new ManualDrive('excavator',[0,.08,0]),gear:{step(){}},rig:createExcavatorRig(mesh)};sessions.set('E1',s);orient(s);site.attach(s);
  site.requestRockfall(s);for(let i=0;i<720;i++)site.step(1/60);
  const initial=site.inventory().loose,p=site.rockfallReport().position;
  const truck={kind:'truck',drive:new ManualDrive('truck',[p.x-15,.08,p.z])};truck.drive.setPayload(false);
  for(let i=0;i<600;i++)truck.drive.step(1/60,{throttle:1},site.surface,(x,z,yaw)=>!!site.collision(truck,x,z,yaw));
  assert.ok(truck.drive.x<p.x-4);assert.ok(truck.drive.blocked);
  const group=scene.getObjectByName('Rockfall / finite removable rubble');const rocks=group.children.filter(m=>m.geometry?.type==='DodecahedronGeometry');
  for(const rock of rocks){const center=s.rig.frames.bucket.localToWorld(new THREE.Vector3(-.8,-.35,0));s.drive.x+=rock.position.x-center.x;s.drive.y+=rock.position.y-center.y;s.drive.z+=rock.position.z-center.z;orient(s);for(let i=0;i<120;i++)site.dig(s,1/60,{bucket:-1})}
  assert.ok(Math.abs(s.bucketOre-1.2)<1e-8);assert.ok(Math.abs(site.inventory().loose+s.bucketOre-initial)<1e-8);assert.ok(site.rockfallReport().remaining>0);
  site.dispose();s.rig.dispose();
});
