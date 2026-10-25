import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLandscapeSurface,landscapeHeight,landscapeSurfaceHeight,distanceFromQuarry,containLandscapeCamera} from '../dist/quarry-landscape.mjs';

test('surroundings preserve a clear rectangular opening and meet every quarry edge at 168m',()=>{
  const {positions:p,indices,uvs,colors}=buildLandscapeSurface();
  assert.ok(indices.length/3<60000);
  const edges=new Map();
  for(let i=0;i<indices.length;i+=3){
    const ids=indices.slice(i,i+3),v=ids.map(k=>p.slice(k*3,k*3+3));
    const cx=v.reduce((s,a)=>s+a[0],0)/3,cz=v.reduce((s,a)=>s+a[2],0)/3;
    assert.ok(!(Math.abs(cx)<500&&Math.abs(cz)<420),'surroundings cover game terrain');
    const area=(v[1][2]-v[0][2])*(v[2][0]-v[0][0])-(v[1][0]-v[0][0])*(v[2][2]-v[0][2]);
    assert.ok(area>0,'degenerate or downward face');
    for(let j=0;j<3;j++){const e=[ids[j],ids[(j+1)%3]].sort((a,b)=>a-b).join(':');edges.set(e,(edges.get(e)||0)+1)}
  }
  for(const [key,count] of edges){assert.ok(count===1||count===2);if(count!==1)continue;
    const vertices=key.split(':').map(Number).map(k=>p.slice(k*3,k*3+3));
    const onInner=vertices.every(([x,,z])=>(Math.abs(x)===500&&Math.abs(z)<=420)||(Math.abs(z)===420&&Math.abs(x)<=500));
    const onOuter=vertices.every(([x,,z])=>Math.abs(x)===14000||Math.abs(z)===14000);
    assert.ok(onInner||onOuter,'unexpected open seam');
    if(onInner)for(const [,y] of vertices)assert.equal(y,168);
  }
  assert.equal(uvs.length,p.length/3*2);assert.equal(colors.length,p.length);assert.ok(p.every(Number.isFinite));
});

test('boundary collar remains level and the pit is not filled by landscape heights',()=>{
  for(let z=-420;z<=420;z+=10)for(const x of [-500,500])assert.equal(landscapeHeight(x,z),168);
  for(let x=-500;x<=500;x+=10)for(const z of [-420,420])assert.equal(landscapeHeight(x,z),168);
  assert.equal(distanceFromQuarry(0,0),0);
  assert.ok(landscapeHeight(-1050,-950)>300);
});

test('camera bounds preserve view offset when panning and prevent travel underneath exterior ground',()=>{
  const camera={position:{x:2200,y:20,z:1100}};
  const controls={target:{x:1000,y:220,z:900,set(x,y,z){Object.assign(this,{x,y,z})}}};
  containLandscapeCamera(camera,controls);
  assert.equal(controls.target.x,610);assert.equal(controls.target.z,530);assert.equal(controls.target.y,195);
  assert.equal(camera.position.x-controls.target.x,1200);
  assert.ok(camera.position.y>=landscapeSurfaceHeight(camera.position.x,camera.position.z)+22);
});

test('road and camera height sampling follows the rendered triangles, including distant hills',()=>{
  const {positions:p,indices}=buildLandscapeSurface();
  for(let i=0;i<indices.length;i+=111){const v=indices.slice(i,i+3).map(k=>p.slice(k*3,k*3+3));const x=v.reduce((s,a)=>s+a[0],0)/3,z=v.reduce((s,a)=>s+a[2],0)/3,y=v.reduce((s,a)=>s+a[1],0)/3;assert.ok(Math.abs(landscapeSurfaceHeight(x,z)-y)<1e-8)}
});

test('a close camera stops before a quarry wall, while the overview stays unchanged',async()=>{
  const THREE=await import('../dist/vendor/three/build/three.module.js');
  const {createQuarryCameraGuard}=await import('../dist/quarry-landscape.mjs');
  const world=new THREE.Group(),wall=new THREE.Mesh(new THREE.BoxGeometry(100,100,10),new THREE.MeshBasicMaterial());wall.position.set(0,30,25);wall.userData.asset_id='GEO_001';world.add(wall);
  const protect=createQuarryCameraGuard(THREE,world),camera=new THREE.PerspectiveCamera(),controls={target:new THREE.Vector3()};
  camera.position.set(0,35,60);protect(camera,controls);assert.ok(camera.position.z<20,'camera is behind wall');assert.ok(camera.position.z>0);
  camera.position.set(900,1100,1100);const before=camera.position.clone();protect(camera,controls);assert.ok(camera.position.equals(before));
});
