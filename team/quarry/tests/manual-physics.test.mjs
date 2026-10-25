import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {boxContact,contactImpulse,OrePatch,advanceOre,bedEntry} from '../dist/manual-physics-core.mjs';
import {createManualWorksite} from '../dist/manual-worksite.mjs';
import {createExcavatorRig} from '../dist/excavator-rig.mjs';
import {ManualDrive} from '../dist/manual-core.mjs';

test('oriented contacts include corners and reject objects on another terrace',()=>{
  const a={x:0,z:0,y:0,height:5,length:4.85,width:2.92,yaw:0},b={...a,x:9.5};
  assert.ok(boxContact(a,b));assert.equal(boxContact(a,{...b,x:10}),null);
  assert.ok(boxContact(a,{...b,x:7,yaw:Math.PI/4}));assert.equal(boxContact(a,{...b,y:24}),null);
});
test('mass-weighted impulse conserves momentum and separates a collision',()=>{
  const a={vx:10,vz:0,mass:48000},b={vx:0,vz:0,mass:22000};const momentum=a.vx*a.mass;
  const impact=contactImpulse(a,b,{x:-1,z:0});assert.ok(impact.energy>0);assert.ok(b.vx>a.vx);assert.ok(Math.abs(a.vx*a.mass+b.vx*b.mass-momentum)<1e-6);
  const old=a.vx;assert.equal(contactImpulse(a,b,{x:-1,z:0}).energy,0);assert.equal(a.vx,old);
  const wall={vx:0,vz:0,mass:Infinity};a.vx=10;contactImpulse(a,wall,{x:-1,z:0});assert.ok(a.vx<0);assert.equal(wall.vx,0);
});
test('digging removes finite volume locally and stops at bedrock and bucket capacity',()=>{
  const p=new OrePatch(0,0,0),initial=p.initial,far=p.heightAt(2,0),center=p.heightAt(0,0);
  const volume=p.dig({x:0,y:1,z:0},.9,.3);assert.ok(volume>.29&&volume<=.3);assert.ok(p.heightAt(0,0)<=center);assert.equal(p.heightAt(2,0),far);
  for(let i=0;i<100;i++)p.dig({x:0,y:0,z:0},10,1);
  assert.ok(p.heights.every(x=>x>=-1e-10));assert.ok(Math.abs(initial-p.removed)<1e-8);assert.equal(p.dig({x:0,y:0,z:0},10,1),0);
});
test('ballistic parcels cross a bed only from above and only through its opening',()=>{
  const p={x:0,y:8,z:0,vx:0,vy:0,vz:0};advanceOre(p,1);assert.ok(Math.abs(p.y-3.095)<1e-9);assert.equal(p.vy,-9.81);
  assert.ok(bedEntry({x:-2,y:6,z:0},{x:-2,y:3,z:0}));
  assert.equal(bedEntry({x:2,y:6,z:0},{x:2,y:3,z:0}),null);
  assert.equal(bedEntry({x:-2,y:3,z:0},{x:-2,y:6,z:0}),null);
  assert.equal(bedEntry({x:-2,y:4,z:0},{x:-2,y:3,z:0}),null);
});
function fixture(){
  const scene=new THREE.Scene(),sessions=new Map(),flat=()=>0;
  const orient=s=>{s.mesh.position.set(s.drive.x,s.drive.y,s.drive.z);s.mesh.rotation.set(0,s.drive.yaw,0);s.mesh.updateMatrixWorld(true)};
  const site=createManualWorksite({scene,sessions,sample:flat,orient,blockers:[],onNotice(){}});
  for(const [id,kind,x] of [['E1','excavator',0],['T1','truck',40]]){
    const mesh=new THREE.Group();scene.add(mesh);const drive=new ManualDrive(kind,[x,.08,0]);
    const s={id,label:id,kind,mesh,drive,initial:{position:[x,.08,0],yaw:0},gear:{step(){}},rig:kind==='excavator'?createExcavatorRig(mesh):null};
    sessions.set(id,s);orient(s);site.attach(s);s.rig?.setContactCheck(()=>site.armClear(s));
  }
  site.prepare();return {scene,sessions,site,orient,flat};
}
test('complete scoop, lift, slew and discharge cycle loads real falling ore and conserves volume',()=>{
  const {sessions,site,flat}=fixture(),exc=sessions.get('E1'),truck=sessions.get('T1');
  const total=()=>Object.values(site.inventory()).reduce((a,b)=>a+b,0),initial=total();
  const run=(keys,seconds)=>{for(let i=0;i<Math.round(seconds*60);i++){exc.armBlocked=exc.rig.step(1/60,keys,flat);site.dig(exc,1/60,keys);site.step(1/60)}};
  run({bucket:-1},3);assert.ok(exc.bucketOre>.5,'soil must enter the actual bucket');
  assert.ok(Math.abs(total()-initial)<1e-8);run({boom:1,stick:1},3);
  run({slew:1},Math.PI);assert.ok(exc.rig.state.slew>1.5,'raised equipment must clear bed sides');
  run({bucket:1},7);run({},2);
  assert.ok(truck.ore>.3,`truck received ${truck.ore} m3; bucket ${exc.bucketOre}; ${JSON.stringify(exc.rig.state)}`);
  assert.ok(exc.bucketOre<.01);assert.ok(Math.abs(total()-initial)<1e-7);assert.ok(truck.drive.payload>0&&truck.drive.payload<1);
  site.dispose();for(const s of sessions.values())s.rig?.dispose();
});
test('missed discharge remains on ground and never credits a remote truck',()=>{
  const {sessions,site,flat,orient}=fixture(),exc=sessions.get('E1'),truck=sessions.get('T1');truck.drive.x=50;orient(truck);
  for(let i=0;i<180;i++){const keys={bucket:-1};exc.armBlocked=exc.rig.step(1/60,keys,flat);site.dig(exc,1/60,keys);site.step(1/60)}
  for(let i=0;i<180;i++){exc.rig.step(1/60,{boom:1,stick:1},flat);site.step(1/60)}
  for(let i=0;i<600;i++){const keys={bucket:1};exc.armBlocked=exc.rig.step(1/60,keys,flat);site.dig(exc,1/60,keys);site.step(1/60)}
  assert.equal(truck.ore,0);assert.ok(site.inventory().loose>.5);site.dispose();exc.rig.dispose();
});
test('vehicle impact pushes the parked machine, produces damage and stops overlap',()=>{
  const {sessions,site,orient}=fixture(),exc=sessions.get('E1'),truck=sessions.get('T1');
  Object.assign(truck.drive,{x:-8.35,z:0,yaw:0});orient(truck);
  const contact=site.collision(truck,-8.2,0,0);assert.ok(contact);site.impact(truck,contact,10);
  for(let i=0;i<20;i++)site.step(1/60);
  assert.ok(exc.drive.x>.1);assert.ok(truck.physics.damage>0);assert.ok(exc.physics.damage>0);
  assert.equal(site.collision(truck,truck.drive.x,truck.drive.z,0),null);site.dispose();exc.rig.dispose();
});

test('impact dents belong to the practice copy and cannot mutate the original asset',()=>{
  const {sessions,site,orient}=fixture(),truck=sessions.get('T1'),exc=sessions.get('E1');
  const source=new THREE.BoxGeometry(9,3,5).translate(0,1.5,0),original=source.attributes.position.array.slice();
  const body=new THREE.Mesh(source,new THREE.MeshStandardMaterial());body.name='painted chassis';truck.mesh.add(body);
  Object.assign(truck.drive,{x:-8.35,z:0,yaw:0});orient(truck);
  site.impact(truck,site.collision(truck,-8.2,0,0),12);
  assert.notEqual(body.geometry,source);assert.deepEqual(source.attributes.position.array,original);assert.notDeepEqual(body.geometry.attributes.position.array,original);
  assert.ok(truck.mesh.children.some(o=>o.name==='Impact scratches'));site.dispose();exc.rig.dispose();source.dispose();body.material.dispose();
});

test('partly loaded trucks gain mass and slow progressively instead of switching instantly to full',()=>{
  const d=new ManualDrive('truck',[0,.08,0]);d.setLoadFraction(0);const empty=d.performance;
  d.setLoadFraction(.5);assert.ok(d.performance.forward<empty.forward&&d.performance.forward>35/3.6);
  assert.ok(d.performance.acceleration<empty.acceleration&&d.performance.acceleration>1.35);
  d.setLoadFraction(9);assert.equal(d.payload,1);d.setLoadFraction(NaN);assert.equal(d.payload,0);
});

test('metal blocks working equipment and impact shake never accumulates camera drift',()=>{
  const {sessions,site,orient,flat}=fixture(),truck=sessions.get('T1'),exc=sessions.get('E1');
  truck.drive.x=6;truck.drive.z=0;orient(truck);const state={...exc.rig.state};
  assert.equal(exc.rig.step(.1,{bucket:-1},flat),true);assert.deepEqual(exc.rig.state,state);
  const camera=new THREE.PerspectiveCamera();camera.position.set(10,12,14);const initial=camera.position.clone();
  exc.physics.shock=1;
  for(let i=0;i<20;i++){site.clearShake(camera);site.step(.01);site.shake(camera,exc)}
  site.clearShake(camera);assert.ok(camera.position.distanceTo(initial)<1e-8);site.dispose();exc.rig.dispose();
});

test('full trucks reject excess material and conserve the spilled ore',()=>{
  const {sessions,site,flat}=fixture(),exc=sessions.get('E1'),truck=sessions.get('T1');site.setCargo(truck,true);
  const total=()=>Object.values(site.inventory()).reduce((a,b)=>a+b,0),initial=total(),full=truck.ore;
  const run=(keys,n)=>{for(let i=0;i<n;i++){exc.armBlocked=exc.rig.step(1/60,keys,flat);site.dig(exc,1/60,keys);site.step(1/60)}};
  run({bucket:-1},180);run({boom:1,stick:1},180);run({slew:1},188);run({bucket:1},600);
  assert.equal(truck.ore,full);assert.ok(site.inventory().loose>.5);assert.ok(Math.abs(total()-initial)<1e-7);site.dispose();exc.rig.dispose();
});

test('holding the turret against an empty or loaded truck stalls without accumulating impulse',()=>{
  for(const full of [false,true]){
    const {sessions,site,flat}=fixture(),exc=sessions.get('E1'),truck=sessions.get('T1');site.setCargo(truck,full);
    const positions=[exc,truck].map(s=>[s.drive.x,s.drive.y,s.drive.z]);let contactPose=null;
    for(let i=0;i<600;i++){
      exc.armBlocked=exc.rig.step(1/60,{slew:1},flat);
      if(exc.armBlocked){assert.ok(exc.armContact);contactPose??={...exc.rig.state};site.armImpact(exc);assert.deepEqual(exc.rig.state,contactPose)}
      site.step(1/60);
    }
    assert.ok(contactPose,'turret must actually reach truck metal');
    assert.deepEqual([exc,truck].map(s=>[s.drive.x,s.drive.y,s.drive.z]),positions);
    for(const s of [exc,truck]){assert.equal(s.physics.vx,0);assert.equal(s.physics.vz,0);assert.equal(s.physics.damage,0)}
    assert.equal(exc.rig.step(1/60,{slew:-1},flat),false,'reverse motion must release the stall');
    site.dispose();exc.rig.dispose();
  }
});
