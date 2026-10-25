import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {createMountainSampler,mountainSceneryView} from '../dist/mountain-landscape.mjs';
import {createMountainWatercourse} from '../dist/mountain-watercourse.mjs';

const baseline={quarry:'5244535e47e57dfaa1cf555f031b2b007a1015077a66d6dd15ec176d403bd540',altai:'d38f89cbd1b248e6b49c5932f2439b7bd63c217d7cb79d8cbe0c1129e175ccb9'};
for(const kind of ['quarry','altai']){
  const base=new URL('../dist/assets/mountains/',import.meta.url),profile=JSON.parse(fs.readFileSync(new URL(kind+'-profile.json',base))),raw=fs.readFileSync(new URL(profile.heightFile,base));
  const heights=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4),sample=createMountainSampler(profile,heights);
  test(kind+': sculpting preserves every pre-release vertex of the driving perimeter',()=>{
    const hash=createHash('sha256');let checked=0;
    profile.zs.forEach((z,j)=>profile.xs.forEach((x,i)=>{if(Math.abs(x)<=900&&Math.abs(z)<=800){const at=4*(j*profile.xs.length+i);hash.update(raw.subarray(at,at+4));checked++}}));
    assert.equal(checked,19257);assert.equal(hash.digest('hex'),baseline[kind]);
  });
  test(kind+': stream is grounded, has a cascade and stays outside the playable area',()=>{
    assert.equal(profile.landformVersion,2);const rows=profile.watercourse.points;assert.ok(rows.length>100);
    let grade=0;for(let i=0;i<rows.length;i++){
      const [x,y,z,width]=rows[i];assert.ok(rows[i].every(Number.isFinite));assert.ok(x<-1000);assert.ok(width>3&&width<15);
      assert.ok(Math.abs(y-Math.max(147.14,sample(x,z)+.9))<.004);if(i)grade=Math.max(grade,(rows[i-1][1]-y)/Math.hypot(rows[i-1][0]-x,rows[i-1][2]-z));
    }
    assert.ok(grade>2,'cascade must descend through the cliff');assert.ok(rows[0][1]-rows.at(-1)[1]>100);
    for(const [x,,z] of [...profile.trees,...profile.rocks,...profile.grass])if(z>-710&&z<880)assert.ok(Math.abs(x-(-1160+62*Math.sin((z-830)/235)))>=34);
  });
  test(kind+': water visual adds bounded geometry with finite upward-wound surfaces',()=>{
    const parent=new THREE.Group(),water=createMountainWatercourse(THREE,parent,profile,sample,kind==='altai');
    const river=water.group.getObjectByName('Ravine / flowing water'),mist=water.group.getObjectByName('Cascade / drifting spray');
    assert.equal(river.geometry.index.count/3,(profile.watercourse.points.length-1)*2);assert.equal(mist.geometry.attributes.position.count,96);
    const position=river.geometry.attributes.position,index=river.geometry.index;
    for(let i=0;i<index.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(position,index.getX(i)),b=new THREE.Vector3().fromBufferAttribute(position,index.getX(i+1)),c=new THREE.Vector3().fromBufferAttribute(position,index.getX(i+2));assert.ok(new THREE.Vector3().crossVectors(b.sub(a),c.sub(a)).y>0)}
    for(const v of position.array)assert.ok(Number.isFinite(v));water.update(120000);assert.equal(parent.children.length,1);
  });
}
test('older landscape profiles remain usable without a watercourse',()=>{
  const parent=new THREE.Group();assert.equal(createMountainWatercourse(THREE,parent,{},()=>null),null);assert.equal(parent.children.length,0);
});
test('scenic camera remains inside the established target bounds on both layouts',()=>{
  for(const aspect of [.65,1.4]){const view=mountainSceneryView(aspect);assert.ok(view.position.every(Number.isFinite));assert.ok(Math.abs(view.target[0])<=610&&Math.abs(view.target[2])<=530&&view.target[1]<=400);assert.ok(view.fov>=40&&view.fov<=60)}
});
