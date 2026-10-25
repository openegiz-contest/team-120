import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {resolveQuarryMap,QUARRY_MAPS} from '../dist/quarry-maps.mjs';
import {installRudnyTerrain,rudnyOverview,RUDNY_MAPS} from '../dist/rudny-maps.mjs';
import {createSurfaceSampler} from '../dist/manual-controls.mjs';
import {buildGraph} from '../dist/dispatch-core.mjs';
import {CareerSimulation} from '../dist/career-core.mjs';
import {planQuarryScree} from '../dist/quarry-closeup.mjs';

const base=new URL('../dist/assets/rudny/',import.meta.url);
const json=name=>JSON.parse(fs.readFileSync(new URL(name,base)));
function terrain(kind){
  const buffer=fs.readFileSync(new URL(kind+'-terrain.glb',base)),length=buffer.readUInt32LE(12),data=JSON.parse(buffer.toString('utf8',20,20+length)),binary=28+length;
  const attribute=id=>{
    const a=data.accessors[id],v=data.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5121:1,5123:2,5125:4,5126:4}[a.componentType],read={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType],start=binary+(v.byteOffset||0)+(a.byteOffset||0),out=[];
    for(let i=0;i<a.count;i++)for(let j=0;j<n;j++)out.push(buffer[read](start+i*(v.byteStride||size*n)+j*size));return out;
  };
  const node=data.nodes.find(n=>n.extras?.asset_id==='GEO_001');assert.ok(node);
  const meshes=data.meshes[node.mesh].primitives.map(p=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(attribute(p.attributes.POSITION),3));g.setIndex(attribute(p.indices));return new THREE.Mesh(g)});
  return {meshes,sample:createSurfaceSampler(meshes)};
}

test('Rudny maps resolve independently and never reuse another location save',()=>{
  assert.equal(resolveQuarryMap('/sarbay.html'),QUARRY_MAPS.sarbay);assert.equal(resolveQuarryMap('/sokolov.html'),QUARRY_MAPS.sokolov);
  assert.equal(new Set(Object.values(QUARRY_MAPS).map(m=>m.saveKey)).size,4);
  assert.equal(resolveQuarryMap('/career.html').saveKey,'quarry-career-v1');assert.equal(resolveQuarryMap('/altai.html').saveKey,'quarry-career-altai-v1');
  assert.equal(resolveQuarryMap('/sarbay.html.bak'),QUARRY_MAPS.quarry);
});

for(const kind of ['sarbay','sokolov']){
  const asset=terrain(kind),route=json(kind+'-route.json'),design=json(kind+'-design.json'),profile=json(kind+'-profile.json');
  test(kind+': new haul road and graph follow the actual exported surface',()=>{
    assert.equal(design.map_id,kind);assert.equal(profile.nonManifoldEdges,0);assert.equal(profile.degenerateFaces,0);assert.ok(design.max_grade_percent<9);
    const graph=buildGraph(route,design);assert.equal(graph.hubs.length,10);
    for(const node of graph.nodes)assert.ok(Math.abs(asset.sample(node.position[0],node.position[2])-node.position[1])<.015,'off-ground graph node '+node.id);
    for(const [,x,y,z] of route.samples)assert.ok(Math.abs(asset.sample(x,z)-y)<.015,'off-ground centreline');
    for(const [x,z] of [[-10,30],[45,43],[235,-365],[310,-385]])assert.ok(Math.abs(asset.sample(x,z)-(z< -300?168:0))<.01,'service platform');
    for(const z of [-95,-100])assert.ok(Math.abs(asset.sample(40,z))<.01,'established mine approach must stay on the loading floor');
    assert.ok(asset.sample(40,-108)<5,'the mine mouth must remain inside the existing portal excavation');
  });
  test(kind+': exported pit remains closed across material boundaries',()=>{
    const edges=new Map();let triangles=0;
    for(const mesh of asset.meshes){const p=mesh.geometry.attributes.position,ix=mesh.geometry.index;for(let i=0;i<ix.count;i+=3){const points=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,ix.getX(i+j)));assert.ok(points.every(v=>v.toArray().every(Number.isFinite)));triangles++;for(let j=0;j<3;j++){const a=points[j].toArray().map(v=>v.toFixed(4)).join(','),b=points[(j+1)%3].toArray().map(v=>v.toFixed(4)).join(',');const key=[a,b].sort().join('|');edges.set(key,(edges.get(key)||0)+1)}}}
    assert.ok(triangles>30000&&triangles<80000);for(const n of edges.values())assert.equal(n,2,'open or non-manifold exported edge');
  });
  test(kind+': tutorial completes an ore delivery on its independent graph',()=>{
    const sim=new CareerSimulation(buildGraph(route,design));sim.tutorialAction();for(let i=0;i<200;i++)sim.tick(.1);assert.equal(sim.stage,'haul');sim.tutorialAction();for(let i=0;i<16000&&sim.deliveries<1;i++)sim.tick(.1);assert.equal(sim.deliveries,1);assert.equal(sim.wallet,100);
  });
  test(kind+': decorative scree stays on benches outside the road and mine approach',()=>{
    const rows=planQuarryScree(asset.sample,route.samples);assert.ok(rows.length>0&&rows.length<=750);
    for(const [x,y,z,,height] of rows){
      assert.ok(Math.abs(y-asset.sample(x,z)-.035)<1e-6);assert.ok(height<=.08);assert.ok(!(x>10&&x<75&&z>-175&&z<-65));
      for(let i=1;i<route.samples.length;i++){const a=route.samples[i-1],b=route.samples[i],dx=b[1]-a[1],dz=b[3]-a[3],t=Math.max(0,Math.min(1,((x-a[1])*dx+(z-a[3])*dz)/(dx*dx+dz*dz||1)));assert.ok(Math.hypot(x-a[1]-t*dx,z-a[3]-t*dz)>=24)}
    }
  });
}

test('Rudny models differ in pit shape, route geometry, bench count and palette',()=>{
  assert.notDeepEqual(json('sarbay-route.json').samples,json('sokolov-route.json').samples);
  assert.equal(json('sarbay-design.json').bench_intervals,10);assert.equal(json('sokolov-design.json').bench_intervals,12);
  const a=terrain('sarbay').sample,b=terrain('sokolov').sample;let differences=0;
  for(let x=-400;x<=400;x+=40)for(let z=-340;z<=340;z+=40)if(Math.abs(a(x,z)-b(x,z))>10)differences++;
  assert.ok(differences>100);assert.notEqual(RUDNY_MAPS.sarbay.rock,RUDNY_MAPS.sokolov.rock);
  for(const kind of ['sarbay','sokolov'])for(const aspect of [.65,1.4]){const view=rudnyOverview(kind,aspect);assert.ok(view.position.every(Number.isFinite));assert.ok(view.position[1]>view.target[1])}
});

test('installing a new pit preserves machinery and removes the superseded ground only',async()=>{
  const world=new THREE.Group(),old=new THREE.Group(),truck=new THREE.Group(),newGround=new THREE.Group(),outside=new THREE.Mesh();old.userData.asset_id='GEO_001';outside.userData.rudny_surface='outside';newGround.add(outside);world.add(old,truck);
  const result=await installRudnyTerrain({loadAsync:async()=>({scene:newGround})},world,'sarbay');assert.equal(result,newGround);assert.equal(old.parent,null);assert.equal(truck.parent,world);assert.equal(outside.name,'Continuous land outside quarry');assert.equal(await installRudnyTerrain({},world,'quarry'),null);
});
