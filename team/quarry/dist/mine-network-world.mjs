import * as THREE from './vendor/three/build/three.module.js';

export function inNetworkChamber(p,tracks){
  return (tracks.junctions||[]).some(j=>{const d=p.clone().sub(j.position),x=d.dot(j.right),z=-d.dot(j.tangent);return Math.abs(x)<14.05&&z<6.1&&z>-18.1&&Math.abs(d.y)<3});
}

export function addNetworkJunctions({tracks,scene,ownGeo,mat,texture,lamps,sign}){
  const stone=mat(0x63695f,{map:texture,side:THREE.DoubleSide}),floor=mat(0x44473c),metal=mat(0x465f57,{metalness:.6}),glow=mat(0xeacb85,{emissive:0xffd085,emissiveIntensity:2});
  const boxGeo=ownGeo(new THREE.BoxGeometry(1,1,1)),signals=[];
  for(const j of tracks.junctions||[]){
    const root=new THREE.Group();root.position.copy(j.position);root.rotation.y=Math.atan2(-j.tangent.x,-j.tangent.z);scene.add(root);root.updateMatrixWorld(true);
    const block=(material,p,size)=>{const m=new THREE.Mesh(boxGeo,material);m.position.set(...p);m.scale.set(...size);root.add(m);return m};
    block(floor,[0,-.25,-6],[28,.4,24]);block(stone,[0,5.25,-6],[29,.7,25]);block(stone,[0,2.6,-18.3],[28,5.2,.6]);
    for(const x of [-14.3,14.3]){block(stone,[x,2.6,.5],[.6,5.2,11]);block(stone,[x,2.6,-15.5],[.6,5.2,5]);block(stone,[x,4.95,-9],[.6,.6,8])}
    for(const x of [-9,9])block(stone,[x,2.6,6.3],[10,5.2,.6]);block(stone,[0,4.95,6.3],[8,.6,.6]);
    for(const x of [-11,11])for(const z of [3,-15])block(metal,[x,2.4,z],[.22,4.8,.22]);
    for(const z of [3,-15])block(metal,[0,4.8,z],[22,.2,.2]);
    function collar(position,rotation){
      const shape=new THREE.Shape();shape.moveTo(-4.5,-.25);shape.lineTo(4.5,-.25);shape.lineTo(4.5,5.2);shape.lineTo(-4.5,5.2);shape.closePath();
      const hole=new THREE.Path(),profile=[[-3.3,-.15],[-3.3,2]];hole.moveTo(-3.3,-.15);hole.lineTo(-3.3,2);
      for(let i=0;i<=24;i++){const a=Math.PI-i*Math.PI/24,x=3.3*Math.cos(a),y=2+2.55*Math.sin(a);hole.lineTo(x,y);profile.push([x,y])}hole.lineTo(3.3,-.15);hole.closePath();shape.holes.push(hole);profile.push([3.3,-.15]);
      const g=new THREE.Group();g.position.set(...position);g.rotation.y=rotation;root.add(g);g.add(new THREE.Mesh(ownGeo(new THREE.ShapeGeometry(shape)),stone));
      const p=[],ix=[];for(const z of [0,4])for(const [x,y] of profile)p.push(x,y,z);for(let i=0;i<profile.length-1;i++){const n=profile.length;ix.push(i,i+1,i+n,i+1,i+n+1,i+n)}
      const geo=ownGeo(new THREE.BufferGeometry());geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setIndex(ix);geo.computeVertexNormals();g.add(new THREE.Mesh(geo,stone));
    }
    collar([0,0,6],0);collar([-13.8,0,-9],-Math.PI/2);collar([13.8,0,-9],Math.PI/2);
    const colour=j.parent.split('_').length===1?'#edc885':'#85d9d2';
    function label(text,p,width,rotation=0){const o=sign(text,[0,0,0],width,colour);o.material.side=THREE.FrontSide;root.add(o);o.position.set(...p);o.rotation.y=rotation}
    label('← '+tracks.labels[j.children[0]]+'   /   '+tracks.labels[j.children[1]]+' →',[0,4,-17.9],11);
    label('РАЗВИЛКА / '+Math.abs(Math.round(j.position.y))+' М',[0,3.9,5.8],5);
    label('К ВЫХОДУ / S',[0,3.7,5.7],4,Math.PI);
    block(glow,[0,4.8,-6],[1.3,.1,.35]);lamps.push({position:new THREE.Vector3(...j.toWorld([0,4.5,-6])),color:0xffd9b0});
    const signalMat=mat(0xffad5b,{emissive:0xffa348,emissiveIntensity:2});block(metal,[2.5,1.1,9],[.12,2.2,.12]);const lamp=block(signalMat,[2.5,2.2,9],[.35,.4,.3]);signals.push({parent:j.parent,material:lamp.material});
  }
  return {update(drive){for(const s of signals){const i=drive.path?.indexOf(s.parent)??-1;const selected=i>=0&&!!drive.path[i+1];s.material.color.set(selected?0x62d2a2:0xffad5b);s.material.emissive.copy(s.material.color)}}};
}
