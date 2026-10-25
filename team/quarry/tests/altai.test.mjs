import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {resolveQuarryMap,QUARRY_MAPS} from '../dist/quarry-maps.mjs';
import {buildAltaiSurface,altaiHeight,altaiSurfaceHeight,createAltaiForest} from '../dist/altai-terrain.mjs';
import {buildLandscapeSurface,landscapeHeight,distanceFromQuarry} from '../dist/quarry-landscape.mjs';
import {createAltaiEnvironment} from '../dist/altai-environment.mjs';

test('Altai is an explicit separate map with an isolated save; original routes retain their save key',()=>{
  assert.equal(resolveQuarryMap('/altai.html'),QUARRY_MAPS.altai);
  for(const path of ['/career.html','/','/altai.html.bak','/something.html'])assert.equal(resolveQuarryMap(path).saveKey,'quarry-career-v1');
  assert.notEqual(QUARRY_MAPS.altai.saveKey,QUARRY_MAPS.quarry.saveKey);
});

test('Altai preserves working ground and quarry seams while adding mountains with the same closed exterior topology',()=>{
  const a=buildAltaiSurface(),b=buildLandscapeSurface();assert.deepEqual(a.indices,b.indices);assert.equal(a.positions.length,b.positions.length);
  let maximum=0;
  for(let i=0;i<a.positions.length;i+=3){const [x,y,z]=a.positions.slice(i,i+3);assert.ok(Number.isFinite(y));maximum=Math.max(maximum,y);if(distanceFromQuarry(x,z)<=900)assert.equal(y,b.positions[i+1]);if(distanceFromQuarry(x,z)===0)assert.equal(y,168)}
  assert.ok(maximum>2200);
  for(let x=-850;x<=850;x+=50)for(let z=-750;z<=750;z+=50)assert.equal(altaiHeight(x,z),landscapeHeight(x,z));
  // The surface sampler must agree with rendered triangles, including peaks.
  for(let i=0;i<a.indices.length;i+=303){const v=a.indices.slice(i,i+3).map(k=>a.positions.slice(k*3,k*3+3)),x=v.reduce((s,p)=>s+p[0],0)/3,z=v.reduce((s,p)=>s+p[2],0)/3,y=v.reduce((s,p)=>s+p[1],0)/3;assert.ok(Math.abs(altaiSurfaceHeight(x,z)-y)<1e-7)}
});

test('the forest is repeatable, rooted on terrain, below the tree line, and clear of working areas and the approach',()=>{
  const forest=createAltaiForest();assert.equal(forest.length,2100);assert.deepEqual(forest,createAltaiForest());
  for(const t of forest){assert.equal(t.y,altaiSurfaceHeight(t.x,t.z));assert.ok(t.y<=1390);assert.ok(Math.abs(t.x)>=950||Math.abs(t.z)>=850);assert.ok(!(t.z<-420&&t.x>140&&t.x<1120));assert.ok(t.height>=13&&t.height<=31)}
});

test('night scene follows fleet replacement and camera movement with bounded lights',()=>{
  const oldDocument=globalThis.document;
  globalThis.document={createElement:()=>({getContext:()=>({fillStyle:'',beginPath(){},arc(){},fill(){}})})};
  try{
    const scene=new THREE.Scene(),world=new THREE.Group(),geometry=new THREE.BoxGeometry(12,6,6),truck=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());world.add(truck);scene.add(world);
    const hemisphere=new THREE.HemisphereLight();scene.add(hemisphere,new THREE.DirectionalLight());
    let fleet=[{id:'T1',kind:'truck',object:truck}];const renderer={toneMappingExposure:1.08};
    const environment=createAltaiEnvironment({THREE,scene,world,renderer,surfaces:{gravel:{}},route:[],getFleet:()=>fleet});
    const camera=new THREE.PerspectiveCamera();camera.position.set(100,100,100);environment.update(0,camera);
    assert.ok(truck.getObjectByName('Altai / vehicle running lights'));assert.equal(scene.getObjectByName('Altai / starry night').position.distanceTo(camera.position),0);
    for(let i=0;i<30;i++)environment.update(i*300,camera);
    let count=0;scene.traverse(o=>{if(o.isLight)count++});assert.equal(count,10);
    fleet=[];environment.update(10000,camera);assert.equal(truck.getObjectByName('Altai / vehicle running lights'),undefined);
    camera.position.set(-2700,0,-2000);environment.update(11000,camera);assert.ok(camera.position.y>=altaiSurfaceHeight(camera.position.x,camera.position.z)+24);
    assert.equal(truck.geometry,geometry);
  }finally{globalThis.document=oldDocument}
});
