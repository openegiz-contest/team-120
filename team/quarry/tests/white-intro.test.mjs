import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {introPose,INTRO_DURATION} from '../dist/intro-choreography.mjs';
import {createExcavatorRig,JOINT_LIMITS} from '../dist/excavator-rig.mjs';

test('intro enters from the left, stops before digging, and settles before reveal',()=>{
  assert.equal(introPose(0).phase,'blank');assert.equal(introPose(.54).x,-23);
  let previous=-Infinity;
  for(let t=0;t<INTRO_DURATION;t+=1/120){const p=introPose(t);assert.ok(p.x>=previous-1e-9);previous=p.x;for(const key of ['boom','stick','bucket'])assert.ok(p[key]>=JOINT_LIMITS[key][0]&&p[key]<=JOINT_LIMITS[key][1]);if(t>3.45)assert.ok(Math.abs(p.x+1.4)<1e-8)}
  assert.equal(introPose(5.54).cut,0);assert.equal(introPose(6.6).cut,1);assert.equal(introPose(8.6).fade,0);assert.equal(introPose(INTRO_DURATION).done,true);assert.equal(introPose(100).fade,1);
  // No velocity jump at the two ends of the drive or at a joint keyframe.
  for(const t of [.55,3.45,3.7,5.6,6.55,7.45,8.55])for(const key of ['x','boom','stick','bucket']){
    const h=.0001,a=(introPose(t)[key]-introPose(t-h)[key])/h,b=(introPose(t+h)[key]-introPose(t)[key])/h;
    assert.ok(Math.abs(a-b)<.001,`${key} jumps at ${t}`);
  }
});

test('rigged bucket stays clear during travel, penetrates at digging, and lifts out',()=>{
  const root=new THREE.Group(),rig=createExcavatorRig(root);
  const tip=new THREE.Vector3(4.4-6.21,.35-1.04,0);
  const heightAt=t=>{const pose=introPose(t);rig.step(1,Object.fromEntries(['boom','stick','bucket'].map(k=>[k,(pose[k]-rig.state[k])/.38])),()=>-100);return rig.frames.bucket.localToWorld(tip.clone()).y};
  assert.ok(heightAt(2)>1,'travel clearance');assert.ok(heightAt(5.6)>-.05,'no early penetration');
  assert.ok(heightAt(6.55)<-.4,'teeth must enter ground');assert.ok(heightAt(8.55)>.5,'loaded bucket lifts clear');rig.dispose();
});
