import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {createManualCamera} from '../dist/manual-camera.mjs';
import {ManualDrive} from '../dist/manual-core.mjs';

function fixture(){
  const camera=new THREE.PerspectiveCamera(39,1,2,20000);camera.position.set(900,1100,1100);
  const controls={target:new THREE.Vector3(0,85,0),enabled:true,enablePan:true,enableDamping:true,minDistance:18,maxDistance:3300,minPolarAngle:.12,maxPolarAngle:1.35,update(){}};
  const mesh=new THREE.Group(),session={kind:'truck',mesh,drive:{yaw:0}};
  const rig=createManualCamera(camera,controls);rig.begin();rig.select(session);
  return {camera,controls,session,rig};
}
test('orbit remains centred after drag, vehicle translation and turn, without follow lag',()=>{
  const {camera,controls,session,rig}=fixture();
  camera.position.copy(controls.target).add(new THREE.Vector3(15,8,-20));
  const offset=camera.position.clone().sub(controls.target);
  session.mesh.position.set(27,8,35);session.mesh.rotation.y=1.2;rig.update();
  assert.ok(controls.target.distanceTo(session.mesh.localToWorld(new THREE.Vector3(0,2,0)))<1e-8);
  assert.ok(camera.position.clone().sub(controls.target).distanceTo(offset)<1e-8);
  assert.equal(controls.enablePan,false);
});
test('cab follows chassis pose, permits looking, and restores exterior lens and controls',()=>{
  const {camera,controls,session,rig}=fixture();const orbit=camera.position.clone().sub(controls.target);
  rig.setMode('cab');assert.equal(camera.near,.05);assert.equal(controls.enabled,false);
  session.mesh.position.set(20,6,12);session.mesh.rotation.set(.04,1.2,.08);rig.update();
  assert.ok(camera.position.distanceTo(session.mesh.localToWorld(new THREE.Vector3(2.1,4.48,1.4)))<1e-8);
  const position=camera.position.clone(),orientation=camera.quaternion.clone();rig.look(100,40);
  assert.ok(camera.position.distanceTo(position)<1e-8);assert.ok(camera.quaternion.angleTo(orientation)>.2);
  rig.setMode('follow');assert.equal(camera.near,2);assert.equal(camera.fov,39);
  assert.ok(camera.position.clone().sub(controls.target).distanceTo(orbit)<1e-8);
  rig.end();assert.equal(controls.enablePan,true);assert.equal(controls.enableDamping,true);assert.equal(controls.maxDistance,3300);
  assert.deepEqual(camera.position.toArray(),[900,1100,1100]);
});
test('excavator cab follows independent upper rotation and switching machines retains view mode',()=>{
  const {camera,session,rig}=fixture();const upper=new THREE.Group();session.mesh.add(upper);
  session.kind='excavator';session.rig={frames:{upper}};rig.select(session);rig.setMode('cab');
  upper.rotation.y=Math.PI/2;rig.update();
  assert.ok(camera.position.distanceTo(upper.localToWorld(new THREE.Vector3(.18,2.98,.66)))<1e-8);
  const direction=camera.getWorldDirection(new THREE.Vector3());assert.ok(direction.z<-.9);
  const next={kind:'truck',mesh:new THREE.Group(),drive:{yaw:0}};next.mesh.position.x=50;rig.select(next);
  assert.equal(rig.mode,'cab');assert.ok(camera.position.x>50);rig.end();
});
test('empty truck accelerates faster and reaches 55 km/h, loaded truck is limited to 35 km/h on flat ground',()=>{
  const empty=new ManualDrive('truck',[0,.08,0]),full=new ManualDrive('truck',[0,.08,0]);empty.setPayload(false);full.setPayload(true);
  for(let i=0;i<120;i++){empty.step(1/60,{throttle:1},()=>0);full.step(1/60,{throttle:1},()=>0)}
  assert.ok(empty.speed>full.speed*1.9);assert.ok(empty.x>full.x*1.9);
  for(let i=0;i<600;i++){empty.step(1/60,{throttle:1},()=>0);full.step(1/60,{throttle:1},()=>0)}
  assert.ok(Math.abs(empty.speed*3.6-55)<1e-8);assert.ok(Math.abs(full.speed*3.6-35)<1e-8);
  const speed=empty.speed;empty.setPayload(true);assert.equal(empty.speed,speed);empty.step(.1,{throttle:1},()=>0);assert.ok(empty.speed<speed&&empty.speed>speed-.2);
  for(let i=0;i<120;i++)full.step(1/60,{brake:true},()=>0);assert.equal(full.speed,0);
});

test('driving framing has its own lens and restores the overview after cab and vehicle changes',()=>{
  const {camera,controls,session,rig}=fixture();rig.useDrivingFraming();
  assert.equal(camera.fov,46);assert.ok(camera.position.distanceTo(controls.target)<22);
  rig.setMode('cab');assert.equal(camera.fov,72);
  const excavator={kind:'excavator',mesh:new THREE.Group(),drive:{yaw:1},rig:{frames:{}}};
  rig.select(excavator);assert.equal(camera.fov,72);rig.setMode('follow');assert.equal(camera.fov,49);
  rig.select(session);assert.equal(camera.fov,46);rig.end();assert.equal(camera.fov,39);assert.equal(camera.near,2);
  assert.deepEqual(camera.position.toArray(),[900,1100,1100]);assert.deepEqual(controls.target.toArray(),[0,85,0]);
});

test('truck framing fits the full chassis on desktop and phone with room around it',()=>{
  for(const aspect of [1.6,390/372]){
    const {camera,controls,rig}=fixture();camera.aspect=aspect;controls.update=()=>camera.lookAt(controls.target);rig.useDrivingFraming();
    const corners=[];for(const x of [-5.8,5.8])for(const y of [0,6.2])for(const z of [-3.2,3.2])corners.push(new THREE.Vector3(x,y,z).project(camera));
    assert.ok(corners.every(p=>Math.abs(p.x)<.88&&Math.abs(p.y)<.78&&p.z<1),'vehicle clipped at aspect '+aspect);
    assert.ok(Math.max(...corners.map(p=>p.y))-Math.min(...corners.map(p=>p.y))>.55,'vehicle too small');rig.end();
  }
});
