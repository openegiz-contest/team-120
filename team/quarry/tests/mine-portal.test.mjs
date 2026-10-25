import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {MINE_PORTAL,cutPortalGeometry} from '../dist/mine-portal-core.mjs';
import {createMineTracks,MineRailDrive} from '../dist/mine-core.mjs';

test('entrance cut opens a real hole, retaining the surrounding rock and UVs',()=>{
  const original=new THREE.PlaneGeometry(20,20),bounds={min:[-2,-2,-1],max:[2,2,1]};
  const {geometry,removed}=cutPortalGeometry(original,new THREE.Matrix4(),bounds);assert.equal(removed,2);
  const wall=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));wall.updateMatrixWorld();
  const hits=(x,y)=>new THREE.Raycaster(new THREE.Vector3(x,y,5),new THREE.Vector3(0,0,-1)).intersectObject(wall).length;
  assert.equal(hits(0,0),0);assert.equal(hits(1.99,1.99),0);assert.ok(hits(2.01,0));assert.ok(hits(0,-2.01));assert.ok(hits(8,8));
  const p=geometry.attributes.position,uv=geometry.attributes.uv;let area=0;
  for(let i=0;i<p.count;i++){assert.ok(Math.abs(uv.getX(i)-(p.getX(i)/20+.5))<1e-6);assert.ok(Math.abs(uv.getY(i)-(p.getY(i)/20+.5))<1e-6)}
  for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);const triangle=b.sub(a).cross(c.sub(a)).length()/2;assert.ok(triangle>0);area+=triangle}
  assert.ok(Math.abs(area-384)<1e-4);assert.equal(original.attributes.position.count,4);
});

test('world-space cuts support transformed meshes and preserve material groups',()=>{
  const g=new THREE.PlaneGeometry(20,20);g.clearGroups();g.addGroup(0,3,2);g.addGroup(3,3,5);
  const matrix=new THREE.Matrix4().makeTranslation(40,4,-110),r=cutPortalGeometry(g,matrix,{min:[38,2,-111],max:[42,6,-109]});
  assert.equal(r.removed,2);assert.deepEqual([...new Set(r.geometry.groups.map(g=>g.materialIndex))],[2,5]);
  for(const attr of Object.values(r.geometry.attributes))assert.ok([...attr.array].every(Number.isFinite));
  const unchanged=cutPortalGeometry(g,matrix,{min:[100,100,100],max:[110,110,110]});assert.equal(unchanged.geometry,g);assert.equal(unchanged.removed,0);
});

test('entrance is clear of all haul-road lanes and passing bays',()=>{
  const route=JSON.parse(readFileSync(new URL('../dist/assets/road-route.json',import.meta.url)));
  const {min,max}=MINE_PORTAL.cut;let clearance=Infinity;
  for(const [,x,y,z] of route.samples){const dx=Math.max(min[0]-x,0,x-max[0]),dz=Math.max(min[2]-z,0,z-max[2]);clearance=Math.min(clearance,Math.hypot(dx,dz))}
  assert.ok(clearance>20,`road clearance ${clearance} m`);
});

test('the same rail drive crosses the outdoor portal and returns without a coordinate jump',()=>{
  const tracks=createMineTracks(),drive=new MineRailDrive(tracks),origin=new THREE.Vector3(...MINE_PORTAL.origin);
  const start=drive.pose().position.clone().add(origin);assert.ok(start.z>-105);
  let last=start,crossed=false;drive.choose('deep');
  for(let i=0;i<600;i++){drive.step(1/60,{throttle:1});const p=drive.pose().position.clone().add(origin);assert.ok(p.distanceTo(last)<.14);if(p.z<-125)crossed=true;last=p}
  assert.equal(crossed,true);
  for(let i=0;i<1800;i++)drive.step(1/60,{throttle:-1});
  assert.equal(drive.distance,8);assert.ok(drive.pose().position.clone().add(origin).z>-105);
});

test('reversing gently away from an unselected switch clears the waiting hint',()=>{
  const drive=new MineRailDrive(createMineTracks());
  for(let i=0;i<1800;i++)drive.step(1/60,{throttle:1});assert.equal(drive.waiting,true);
  for(let i=0;i<1800;i++)drive.step(1/60,{throttle:-1});
  assert.equal(drive.distance,8);assert.equal(drive.waiting,false);
});
