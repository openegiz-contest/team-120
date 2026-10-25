import * as THREE from './vendor/three/build/three.module.js';

export const TRACK_LENGTH=7+2*Math.PI*.55;
export function trackPoint(distance){
  let s=((distance%TRACK_LENGTH)+TRACK_LENGTH)%TRACK_LENGTH;
  if(s<3.5)return {x:-1.75+s,y:1.19,angle:0};s-=3.5;
  if(s<Math.PI*.55){const a=Math.PI/2-s/.55;return {x:1.75+.55*Math.cos(a),y:.64+.55*Math.sin(a),angle:a-Math.PI/2}}s-=Math.PI*.55;
  if(s<3.5)return {x:1.75-s,y:.09,angle:Math.PI};s-=3.5;
  const a=-Math.PI/2-s/.55;return {x:-1.75+.55*Math.cos(a),y:.64+.55*Math.sin(a),angle:a-Math.PI/2};
}

// Split only the index buffers. Position/normal/UV attributes and PBR materials stay shared.
function splitWheelMesh(mesh,centers,groups,geometries,studs=false){
  const g=mesh.geometry,p=g.attributes.position,ix=g.index,lists=groups.map(()=>[]);
  for(let i=0;i<(ix?ix.count:p.count);i+=3){
    const ids=[0,1,2].map(j=>ix?ix.getX(i+j):i+j),v=new THREE.Vector3();
    for(const id of ids)v.add(new THREE.Vector3().fromBufferAttribute(p,id));v.multiplyScalar(1/3);
    let best=0,distance=Infinity;centers.forEach((c,k)=>{const d=v.distanceToSquared(c);if(d<distance){distance=d;best=k}});
    if(studs){const c=centers[best];if(Math.hypot(v.x-c.x,v.y-c.y)>.65||Math.abs(Math.abs(v.z-c.z)-.48)>.10)best=6}lists[best].push(...ids);
  }
  lists.forEach((indices,i)=>{if(!indices.length)return;const part=new THREE.BufferGeometry();for(const [key,value] of Object.entries(g.attributes))part.setAttribute(key,value);part.setIndex(indices);part.computeBoundingSphere();geometries.push(part);const object=new THREE.Mesh(part,mesh.material);if(i<6)object.position.copy(centers[i]).negate();groups[i].add(object)});
  mesh.visible=false;
}

export function createTruckRunningGear(object){
  let root;object.traverse(o=>{if(!root&&o.userData.asset_type==='mining_dump_truck')root=o});root||=object;
  for(const child of [...root.children])if(child.userData.wheelAnimation)child.removeFromParent();
  const sources=[];root.traverse(o=>{if(o.isMesh&&/tyre carcasses|chevron tread|wheel rims/.test(o.userData.part||o.name))sources.push(o)});
  if(!sources.length){for(const child of root.children)if(/tyre carcasses|chevron tread|wheel rims/.test(child.userData.part||child.name))child.traverse(o=>{if(o.isMesh)sources.push(o)})}
  // GLTF splits materials into child meshes, which may inherit a shortened name.
  for(const child of [...root.children])if(/tyre carcasses|chevron tread|wheel rims/.test(child.userData.part||child.name))child.traverse(o=>{if(o.isMesh&&!sources.includes(o))sources.push(o)});
  const tyre=sources.find(m=>/tyre/.test(m.name))||sources[0];let height=1.463;
  if(tyre){tyre.geometry.computeBoundingBox();const b=tyre.geometry.boundingBox;height=(b.min.y+b.max.y)/2}
  const centers=[[2.45,2.13],[2.45,-2.13],[-2.6,2.33],[-2.6,1.19],[-2.6,-1.19],[-2.6,-2.33]].map(([x,z])=>new THREE.Vector3(x,height,z));
  const geometry=[],steering=[],spinning=[];
  centers.forEach(c=>{const steer=new THREE.Group(),spin=new THREE.Group();steer.userData.wheelAnimation=true;root.add(steer);steer.position.copy(c);steer.add(spin);steering.push(steer);spinning.push(spin)});
  for(const mesh of sources)splitWheelMesh(mesh,centers,spinning,geometry);
  const fixed=new THREE.Group();fixed.userData.wheelAnimation=true;root.add(fixed);
  const studs=[];for(const child of [...root.children])if(/fasteners wheel studs/.test(child.userData.part||child.name))child.traverse(o=>{if(o.isMesh)studs.push(o)});
  for(const mesh of studs)splitWheelMesh(mesh,centers,[...spinning,fixed],geometry,true);
  let angle=0;
  return {wheels:spinning,step(distance,steer=0){angle=(angle-distance/1.463)%(Math.PI*2);spinning.forEach(w=>w.rotation.z=angle);steering[0].rotation.y=steer;steering[1].rotation.y=steer},dispose(){geometry.forEach(g=>g.dispose());steering.forEach(g=>g.removeFromParent());fixed.removeFromParent();[...sources,...studs].forEach(m=>m.visible=true)}};
}

export function createCrawlerRunningGear(root){
  const hidden=[];root.traverse(o=>{if(/104 individual crawler shoes/.test(o.userData.part||o.name)){hidden.push(o);o.visible=false}});
  const group=new THREE.Group();group.name='Manual / moving track links';root.add(group);
  const mat=new THREE.MeshStandardMaterial({color:0x626966,metalness:.6,roughness:.72});
  const wear=new THREE.MeshStandardMaterial({color:0x939a93,metalness:.7,roughness:.55});
  const shoeGeo=new THREE.BoxGeometry(.181,.085,.69),lugGeo=new THREE.BoxGeometry(.046,.052,.705),pinGeo=new THREE.CylinderGeometry(.034,.034,.12,8);
  const shoes=new THREE.InstancedMesh(shoeGeo,mat,104),lugs=new THREE.InstancedMesh(lugGeo,wear,104),pins=new THREE.InstancedMesh(pinGeo,wear,208);
  for(const m of [shoes,lugs,pins]){m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.frustumCulled=false;group.add(m)}
  const dummy=new THREE.Object3D(),phases=[0,0];
  function draw(){
    for(let side=0;side<2;side++)for(let i=0;i<52;i++){
      const p=trackPoint((i+.5)*TRACK_LENGTH/52+phases[side]),z=side===0?1.22:-1.22,k=side*52+i;
      dummy.position.set(p.x,p.y,z);dummy.rotation.set(0,0,p.angle);dummy.updateMatrix();shoes.setMatrixAt(k,dummy.matrix);
      dummy.position.x-=Math.sin(p.angle)*.067;dummy.position.y+=Math.cos(p.angle)*.067;dummy.updateMatrix();lugs.setMatrixAt(k,dummy.matrix);
      for(let j=0;j<2;j++){dummy.position.set(p.x+Math.sin(p.angle)*.035,p.y-Math.cos(p.angle)*.035,z+(j?-.24:.24));dummy.rotation.set(Math.PI/2,0,0);dummy.updateMatrix();pins.setMatrixAt(k*2+j,dummy.matrix)}
    }
    for(const m of [shoes,lugs,pins])m.instanceMatrix.needsUpdate=true;
  }
  draw();
  return {phases,step(distance,turnAngle){phases[0]=(phases[0]+distance+turnAngle*1.22)%TRACK_LENGTH;phases[1]=(phases[1]+distance-turnAngle*1.22)%TRACK_LENGTH;draw()},dispose(){group.removeFromParent();shoeGeo.dispose();lugGeo.dispose();pinGeo.dispose();mat.dispose();wear.dispose();hidden.forEach(m=>m.visible=true)}};
}
