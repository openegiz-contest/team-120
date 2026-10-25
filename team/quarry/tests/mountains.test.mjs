import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMountainSampler,mountainOverview} from '../dist/mountain-landscape.mjs';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {createAltaiEnvironment} from '../dist/altai-environment.mjs';

const dir=new URL('../dist/assets/mountains/',import.meta.url);
function glb(name){
  const b=fs.readFileSync(new URL(name,dir)),length=b.readUInt32LE(12),json=JSON.parse(b.toString('utf8',20,20+length)),binary=28+length;
  function attribute(id){const a=json.accessors[id],v=json.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5121:1,5123:2,5125:4,5126:4}[a.componentType],read={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType],start=binary+(v.byteOffset||0)+(a.byteOffset||0),out=[];for(let i=0;i<a.count;i++)for(let k=0;k<n;k++)out.push(b[read](start+i*(v.byteStride||size*n)+k*size));return out}
  return {json,attribute};
}
for(const kind of ['quarry','altai']){
  const profile=JSON.parse(fs.readFileSync(new URL(kind+'-profile.json',dir))),raw=fs.readFileSync(new URL(profile.heightFile,dir)),heights=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4),sample=createMountainSampler(profile,heights),asset=glb(kind+'-landscape.glb'),primitive=asset.json.meshes.find(m=>m.name==='MountainGround').primitives[0],p=asset.attribute(primitive.attributes.POSITION),indices=asset.attribute(primitive.indices);
  test(kind+': exported Blender mesh has a clean opening and no internal cracks',()=>{
    const edges=new Map();assert.ok(indices.length/3<250000);
    for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3),v=ids.map(n=>p.slice(n*3,n*3+3)),x=v.reduce((s,a)=>s+a[0],0)/3,z=v.reduce((s,a)=>s+a[2],0)/3;assert.ok(!(Math.abs(x)<500&&Math.abs(z)<420));assert.ok((v[1][2]-v[0][2])*(v[2][0]-v[0][0])-(v[1][0]-v[0][0])*(v[2][2]-v[0][2])>0);for(let j=0;j<3;j++){const key=[ids[j],ids[(j+1)%3]].sort((a,b)=>a-b).join(':');edges.set(key,(edges.get(key)||0)+1)}}
    for(const [key,count] of edges){assert.ok(count===1||count===2);if(count!==1)continue;const v=key.split(':').map(n=>p.slice(n*3,n*3+3));const inner=v.every(([x,,z])=>(Math.abs(x)===500&&Math.abs(z)<=420)||(Math.abs(z)===420&&Math.abs(x)<=500));assert.ok(inner||v.every(([x,,z])=>Math.abs(x)===14000||Math.abs(z)===14000),'interior crack');if(inner)for(const [,y] of v)assert.equal(y,168)}
  });
  test(kind+': collision and camera elevations match exported triangles',()=>{
    for(let i=0;i<indices.length;i+=243){const v=indices.slice(i,i+3).map(n=>p.slice(n*3,n*3+3)),avg=k=>v.reduce((s,a)=>s+a[k],0)/3;assert.ok(Math.abs(sample(avg(0),avg(2))-avg(1))<.003)}assert.equal(sample(0,0),null);
    for(let x=-500;x<=500;x+=10)for(const z of [-420,420])assert.equal(sample(x,z),168);
  });
  test(kind+': broad graded approach stays on ground and is continuous',()=>{
    const road=asset.json.meshes.find(m=>m.name==='ValleyAccessRoad').primitives[0],v=asset.attribute(road.attributes.POSITION);let worst=0;
    // Export deduplicates vertices; use their stored UV station to recover sections.
    const uv=asset.attribute(road.attributes.TEXCOORD_0),sections=new Map();for(let i=0;i<v.length/3;i++){const a=v.slice(i*3,i*3+3);const ground=sample(a[0],a[2]);if(ground!==null)assert.ok(Math.abs(a[1]-ground-.12)<.004);const key=uv[i*2+1];if(!sections.has(key))sections.set(key,[]);sections.get(key).push(a)}
    const rows=[...sections].sort((a,b)=>a[0]-b[0]).map(([,a])=>[0,1,2].map(k=>a.reduce((s,p)=>s+p[k],0)/a.length));for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i];worst=Math.max(worst,Math.abs(b[1]-a[1])/Math.hypot(b[0]-a[0],b[2]-a[2]))}assert.ok(worst<.11,'road grade '+worst);
    assert.ok(profile.roadWidth>=16);assert.ok(profile.road.length>400);
  });
  test(kind+': forest and rocks remain rooted and outside the vehicle practice perimeter',()=>{
    for(const row of [...profile.trees,...profile.rocks]){const [x,y,z]=row;assert.ok(Math.abs(x)>910||Math.abs(z)>810);assert.ok(Math.abs(sample(x,z)-y)<.003);let d=Infinity;for(const p of profile.road)d=Math.min(d,Math.hypot(x-p[1],z-p[3]));assert.ok(d>29)}assert.ok(profile.trees.length>=1000);assert.ok(profile.grass.length>=2500);
    assert.ok(primitive.attributes.COLOR_0!==undefined,'Blender surface masks missing');const c=asset.attribute(primitive.attributes.COLOR_0);assert.ok(new Set(c.slice(0,4000)).size>50,'uniform terrain colour');
  });
}
test('overview keeps the quarry prominent while showing mountains on desktop and portrait',()=>{for(const aspect of [.65,1,1.8]){const v=mountainOverview(aspect);assert.ok(v.position.every(Number.isFinite));assert.ok(v.fov>=40&&v.fov<=60);assert.ok(v.position[1]>v.target[1])}});

test('night environment preserves Blender geometry and never lifts an underground camera',()=>{
  const previous=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({beginPath(){},arc(){},fill(){}})})};
  try{const scene=new THREE.Scene(),world=new THREE.Group(),ground=new THREE.Mesh(new THREE.PlaneGeometry(5,5),new THREE.MeshStandardMaterial());ground.name='Continuous land outside quarry';scene.add(ground,world);const before=ground.geometry.attributes.position.array.slice(),material=ground.material;
    const environment=createAltaiEnvironment({THREE,scene,world,renderer:{},surfaces:{gravel:{}},route:[],getFleet:()=>[],landscapeProfile:{heightAt:()=>1900}}),camera=new THREE.PerspectiveCamera();camera.position.set(-2500,-150,-2000);environment.update(100,camera);
    assert.deepEqual(ground.geometry.attributes.position.array,before);assert.equal(ground.material,material);assert.equal(camera.position.y,-150);assert.equal(scene.getObjectByName('Altai / conifer canopy').count,0);
  }finally{globalThis.document=previous}
});
