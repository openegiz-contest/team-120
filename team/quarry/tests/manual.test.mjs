import test from 'node:test';
import assert from 'node:assert/strict';
import {ManualDrive,groundPose} from '../dist/manual-core.mjs';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {createSurfaceSampler} from '../dist/manual-controls.mjs';
import {createExcavatorRig,JOINT_LIMITS} from '../dist/excavator-rig.mjs';
import {createTruckRunningGear,createCrawlerRunningGear,trackPoint,TRACK_LENGTH} from '../dist/running-gear.mjs';

const flat=()=>0;
const run=(drive,input,seconds,sample=flat,obstacle)=>{for(let i=0;i<seconds*60;i++)drive.step(1/60,input,sample,obstacle)};
test('truck accelerates, steers, brakes and reverses without exceeding speed bounds',()=>{
  const d=new ManualDrive('truck',[0,.08,0]);run(d,{throttle:1},4);assert.ok(d.x>20);assert.ok(d.speed<=11);
  run(d,{throttle:1,turn:1},1);assert.ok(d.yaw>.1);assert.ok(d.z<0);
  run(d,{brake:true},2);assert.equal(d.speed,0);
  const x=d.x;run(d,{throttle:-1},2);assert.ok(d.x<x);assert.ok(d.speed>=-4);
});
test('excavator turns in place and travels at crawler speed',()=>{
  const d=new ManualDrive('excavator',[0,.08,0]);run(d,{turn:1},2);assert.ok(d.yaw>1);assert.equal(d.x,0);assert.equal(d.z,0);
  run(d,{throttle:1},4);assert.equal(d.speed,2);assert.ok(d.z<-4);
});
test('contacts follow a road grade and reject cliff edges, cross slopes and missing terrain',()=>{
  const slope=(x)=>x*.06;const pose=groundPose(0,0,0,'truck',slope);assert.ok(Math.abs(pose.pitch-Math.atan(.06))<1e-8);
  assert.equal(groundPose(0,0,0,'truck',(x)=>x*.4),null);
  assert.equal(groundPose(0,0,0,'truck',(x,z)=>z*.4),null);
  assert.equal(groundPose(0,0,0,'truck',()=>null),null);
  const d=new ManualDrive('truck',[0,.08,0]);run(d,{throttle:1},5,(x)=>x<12?0:-24);assert.ok(d.x<10);assert.ok(d.blocked);assert.equal(d.speed,0);
});
test('substeps prevent crossing barriers and parked vehicles at speed',()=>{
  const d=new ManualDrive('truck',[0,.08,0]);run(d,{throttle:1},5,flat,(x)=>x>=8);assert.ok(d.x<8);assert.equal(d.speed,0);
  run(d,{throttle:-1},2);assert.ok(d.x<5,'reverse must escape obstacle');
});
test('invalid time and released controls cannot produce runaway movement',()=>{
  const d=new ManualDrive('truck',[0,.08,0]);d.step(NaN,{throttle:1},flat);assert.equal(d.x,0);
  run(d,{throttle:1},2);run(d,{},5);assert.equal(d.speed,0);assert.ok(Number.isFinite(d.x));
});

test('surface sampler respects transformed triangles, triangle edges and the highest support surface',()=>{
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,10,1,0,0,2,10],3));
  const mesh=new THREE.Mesh(g);mesh.position.set(25,3,40);
  const sample=createSurfaceSampler([mesh]);
  assert.ok(Math.abs(sample(27,42)-3.6)<1e-6);assert.equal(sample(25,40),3);assert.equal(sample(34,49),null);
  const high=mesh.clone();high.position.y=8;assert.ok(Math.abs(createSurfaceSampler([mesh,high])(27,42)-8.6)<1e-6);
});

test('excavator pivots preserve authored rest positions and move bucket with the boom',()=>{
  const root=new THREE.Group();root.position.set(-29,.08,37);
  const names=['EXC / boxed boom welds and reinforcements','EXC / dipper arm and pivot housings','EXC / hollow digging bucket and wear liners','EXC / lower chassis and swing bearing'];
  const meshes=names.map(name=>{const m=new THREE.Mesh(new THREE.BoxGeometry());m.name=name;root.add(m);return m});
  root.updateMatrixWorld(true);const before=meshes.map(m=>m.localToWorld(new THREE.Vector3(6,1,-.36)));
  const rig=createExcavatorRig(root);
  meshes.forEach((m,i)=>assert.ok(m.localToWorld(new THREE.Vector3(6,1,-.36)).distanceTo(before[i])<1e-8));
  const lower=meshes[3].matrixWorld.clone();rig.step(.5,{boom:1},flat);assert.ok(rig.state.boom>0);
  assert.ok(meshes[2].localToWorld(new THREE.Vector3(6,1,-.36)).y>before[2].y+.5);
  assert.ok(meshes[3].matrixWorld.equals(lower));
  for(let i=0;i<100;i++)rig.step(.1,{boom:1,bucket:1},()=>-100);
  assert.equal(rig.state.boom,JOINT_LIMITS.boom[1]);assert.equal(rig.state.bucket,JOINT_LIMITS.bucket[1]);
  rig.reset();assert.equal(rig.step(.1,{boom:-1},()=>100),true);assert.equal(rig.state.boom,0);rig.dispose();
});

test('truck wheels roll according to distance, reverse and remain stopped without travel',()=>{
  const root=new THREE.Group();root.userData.asset_type='mining_dump_truck';
  const tire=new THREE.Mesh(new THREE.BoxGeometry(.3,.3,.3).translate(2.45,1.463,2.13));tire.name='six heavy duty tyre carcasses';root.add(tire);
  const original=tire.geometry.attributes.position.array.slice(),gear=createTruckRunningGear(root);
  assert.equal(gear.wheels.length,6);assert.equal(tire.visible,false);
  gear.step(1.463,.2);assert.ok(Math.abs(gear.wheels[0].rotation.z+1)<1e-8);assert.equal(gear.wheels[0].parent.rotation.y,.2);
  gear.step(-1.463);assert.ok(Math.abs(gear.wheels[0].rotation.z)<1e-8);gear.step(0);assert.equal(gear.wheels[0].rotation.z,0);
  assert.deepEqual(tire.geometry.attributes.position.array,original);
  const clone=root.clone(true),copy=createTruckRunningGear(clone);assert.equal(clone.children.filter(o=>o.userData.wheelAnimation).length,7,'cloning must not duplicate animated wheels');copy.dispose();gear.dispose();assert.equal(tire.visible,true);
});

test('crawler belt is a closed continuous loop and opposite tracks move oppositely during pivot turns',()=>{
  const a=trackPoint(0),b=trackPoint(TRACK_LENGTH);assert.deepEqual(a,b);
  for(const s of [3.5,3.5+Math.PI*.55,7+Math.PI*.55,TRACK_LENGTH]){const left=trackPoint(s-1e-6),right=trackPoint(s+1e-6);assert.ok(Math.hypot(left.x-right.x,left.y-right.y)<.00001)}
  const root=new THREE.Group(),gear=createCrawlerRunningGear(root);
  const size=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());assert.ok(size.x<5&&size.y<1.5&&size.z<3.3,'track pins must stay within the chassis footprint');
  gear.step(1,0);assert.deepEqual(gear.phases,[1,1]);gear.step(-1,0);assert.deepEqual(gear.phases,[0,0]);gear.step(0,.5);assert.ok(gear.phases[0]>0);assert.ok(gear.phases[1]<0);
  const before=[...gear.phases];gear.step(0,0);assert.deepEqual(gear.phases,before);gear.dispose();assert.equal(root.children.length,0);
});
