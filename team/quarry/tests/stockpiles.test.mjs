import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {createStockpileBlockers} from '../dist/stockpile-colliders.mjs';
import {ManualDrive} from '../dist/manual-core.mjs';
import {hull,boxContact} from '../dist/manual-physics-core.mjs';

function fixture(){
  const positions=[],indices=[];
  for(const cx of [0,45]){
    const offset=positions.length/3;positions.push(cx,12,0);
    for(let i=0;i<40;i++){const a=i/40*Math.PI*2;positions.push(cx+12*Math.cos(a),.25,8*Math.sin(a))}
    for(let i=0;i<40;i++)indices.push(offset,offset+1+i,offset+1+(i+1)%40);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);
  const mesh=new THREE.Mesh(g);mesh.userData.asset_id='STOCK_001';const world=new THREE.Group();world.add(mesh);
  world.add(new THREE.Mesh(new THREE.BoxGeometry(400,20,400)));return {world,mesh};
}
const contains=(boxes,x,z)=>boxes.some(b=>b.containsPoint(new THREE.Vector3(x,1,z)));
test('joined heaps block both footprints but preserve the gap and clear corners',()=>{
  const {world}=fixture(),boxes=createStockpileBlockers(world);
  assert.ok(boxes.length>10&&boxes.length<60);assert.ok(contains(boxes,0,0));assert.ok(contains(boxes,45,0));
  assert.ok(!contains(boxes,23,0),'gap must stay open');assert.ok(!contains(boxes,12,8),'empty bounding-box corner');assert.ok(!contains(boxes,100,100),'unrelated meshes ignored');
  for(let i=0;i<100;i++){const angle=i*Math.PI*2/100;assert.ok(contains(boxes,11.8*Math.cos(angle),7.85*Math.sin(angle)),'footprint cannot have holes')}
});
test('stockpile colliders honour world transforms without mutating render geometry',()=>{
  const {world,mesh}=fixture(),before=mesh.geometry.attributes.position.array.slice();world.position.set(50,168,-40);world.rotation.y=.6;
  const boxes=createStockpileBlockers(world),centre=world.localToWorld(new THREE.Vector3(45,1,0));assert.ok(boxes.some(b=>b.containsPoint(centre)));assert.deepEqual(mesh.geometry.attributes.position.array,before);
  assert.throws(()=>createStockpileBlockers(world,0),RangeError);
});
test('truck stops before a heap, remains outside it, and reverses away',()=>{
  const boxes=createStockpileBlockers(fixture().world),d=new ManualDrive('truck',[-30,.08,0]);
  const contact=(x,z,yaw)=>boxes.some(b=>boxContact(hull({...d,x,z,yaw},'truck'),{x:(b.min.x+b.max.x)/2,z:(b.min.z+b.max.z)/2,y:b.min.y,height:b.max.y-b.min.y,length:(b.max.x-b.min.x)/2,width:(b.max.z-b.min.z)/2,yaw:0}));
  for(let i=0;i<600;i++)d.step(1/60,{throttle:1},()=>0,contact);
  assert.equal(d.speed,0);assert.ok(d.x<-16);assert.ok(!contact(d.x,d.z,d.yaw));const stopped=d.x;
  for(let i=0;i<120;i++)d.step(1/60,{throttle:-1},()=>0,contact);
  assert.ok(d.x<stopped-1,'reverse remains possible');
});
