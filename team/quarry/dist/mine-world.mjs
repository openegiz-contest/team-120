import * as THREE from './vendor/three/build/three.module.js';
import {MINE_PORTAL} from './mine-portal-core.mjs';
import {inNetworkChamber,addNetworkJunctions} from './mine-network-world.mjs';

export function createMineWorld(tracks,{connected=false}={}){
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x101719);scene.fog=new THREE.Fog(0x101719,28,95);
  const geometries=new Set(),materials=new Set(),textures=new Set(),batches=new Map(),lamps=[];
  const ownGeo=g=>(geometries.add(g),g),mat=(color,options={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.8,...options});materials.add(m);return m};
  const rock=mat(0x696c65,{side:THREE.DoubleSide,vertexColors:true}),floor=mat(0x49483d),steel=mat(0x737c7a,{metalness:.8,roughness:.38}),dark=mat(0x222e30,{metalness:.5}),wood=mat(0x504639),orange=mat(0xc86c29,{metalness:.4}),light=mat(0xffebc5,{emissive:0xffc66b,emissiveIntensity:3}),blue=mat(0x8de5df,{emissive:0x22c3c1,emissiveIntensity:2}),red=mat(0xb34229,{emissive:0xd13212,emissiveIntensity:.6});
  const loader=new THREE.TextureLoader();
  // Reuse the quarry's locally supplied rock maps with tunnel UVs.
  const texture=loader.load('./assets/surfaces/rock-albedo.png');texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;textures.add(texture);rock.map=texture;
  const normal=loader.load('./assets/surfaces/rock-normal.png');normal.wrapS=normal.wrapT=THREE.RepeatWrapping;textures.add(normal);rock.normalMap=normal;rock.normalScale.set(.6,.6);
  const gravel=loader.load('./assets/surfaces/gravel-albedo.png');gravel.colorSpace=THREE.SRGBColorSpace;gravel.wrapS=gravel.wrapT=THREE.RepeatWrapping;textures.add(gravel);floor.map=gravel;
  const box=ownGeo(new THREE.BoxGeometry(1,1,1)),cylinder=ownGeo(new THREE.CylinderGeometry(1,1,1,10));
  function mesh(geometry,material,parent=scene){const o=new THREE.Mesh(geometry,material);parent.add(o);return o}
  function block(material,position,scale,parent=scene){const o=mesh(box,material,parent);o.position.set(...position);o.scale.set(...scale);return o}
  function instance(geometry,material,position,scale,quaternion=new THREE.Quaternion()){
    const key=geometry.uuid+material.uuid;if(!batches.has(key))batches.set(key,{geometry,material,matrices:[]});
    batches.get(key).matrices.push(new THREE.Matrix4().compose(position,quaternion,scale));
  }
  function beam(a,b,width,material,depth=width){const d=b.clone().sub(a);instance(box,material,a.clone().add(b).multiplyScalar(.5),new THREE.Vector3(width,d.length(),depth),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()))}
  function local(p,t,x,y){return p.clone().add(new THREE.Vector3(-t.z,0,t.x).normalize().multiplyScalar(x)).add(new THREE.Vector3(0,y,0))}
  function chamber(p){return (Math.abs(p.x)<14.05&&p.z<-52.9&&p.z>-77.1)||inNetworkChamber(p,tracks)}
  function widthAt(name,s){const length=tracks[name].length;return name==='entry'?3.5+Math.max(0,1-s/25)*1.4:tracks.children?.[name]?3.5:3.5+Math.max(0,1-(length-s)/22)*2}
  function tunnel(name){
    const track=tracks[name],steps=Math.ceil(track.length/1.5),arc=16,positions=[],colors=[],uv=[],indices=[],floorPositions=[],floorIndices=[],floorUV=[];
    for(let i=0;i<=steps;i++){
      const s=track.length*i/steps,{position:p,tangent:t}=track.at(s),w=widthAt(name,s);
      for(let j=0;j<=arc+2;j++){
        const angle=(j-1)/arc*Math.PI,x=j===0?w:j===arc+2?-w:w*Math.cos(angle),y=(j===0||j===arc+2)?-.12:2+w*.82*Math.sin(angle);
        const noise=(j===0||j===arc+2)?0:.09*Math.sin(i*13+j*7)+.045*Math.cos(i*4+j*19),v=local(p,t,x+Math.sign(x)*noise,y+noise);
        positions.push(v.x,v.y,v.z);uv.push(s/7,j/5);const c=.64+.24*(.5+.5*Math.sin(i*.7+j*1.9));colors.push(c,c*.98,c*.9);
      }
      const a=local(p,t,-w,-.14),b=local(p,t,w,-.14);floorPositions.push(...a.toArray(),...b.toArray());floorUV.push(-w/3,s/3,w/3,s/3);
      if(i<steps&&!chamber(track.at(s+track.length/steps*.5).position)){
        if(!(connected&&name==='entry'&&s<MINE_PORTAL.roofStart))for(let j=0;j<arc+2;j++){const a=i*(arc+3)+j,b=a+arc+3;indices.push(a,b,a+1,a+1,b,b+1)}
        const a=i*2;floorIndices.push(a,a+1,a+2,a+1,a+3,a+2);
      }
    }
    const g=ownGeo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();mesh(g,rock).name='Rock tunnel '+name;
    const f=ownGeo(new THREE.BufferGeometry());f.setAttribute('position',new THREE.Float32BufferAttribute(floorPositions,3));f.setAttribute('uv',new THREE.Float32BufferAttribute(floorUV,2));f.setIndex(floorIndices);f.computeVertexNormals();mesh(f,floor);
    // Two continuous rails and a line of sleepers follow the same track used by the driver.
    for(const side of [-.72,.72]){const points=[];for(let s=0;s<track.length;s+=.65){const {position:p,tangent:t}=track.at(s);points.push(local(p,t,side,.13))}const end=track.at(track.length);points.push(local(end.position,end.tangent,side,.13));mesh(ownGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),Math.ceil(track.length*2),.055,5,false)),steel)}
    for(let s=0;s<track.length;s+=1.25){const {position:p,tangent:t}=track.at(s);beam(local(p,t,-1.03,0),local(p,t,1.03,0),.13,wood,.21)}
    for(let s=4;s<track.length;s+=5.5){const {position:p,tangent:t}=track.at(s);if(chamber(p)||(connected&&name==='entry'&&s<MINE_PORTAL.roofStart))continue;const w=widthAt(name,s)-.15;
      let previous=local(p,t,w,0);for(let j=0;j<=10;j++){const angle=Math.PI*j/10,next=local(p,t,w*Math.cos(angle),2+w*.82*Math.sin(angle));beam(previous,next,.13,steel);previous=next}beam(previous,local(p,t,-w,0),.13,steel);
      for(const side of [-1,1]){const a=local(p,t,side*w,.35);instance(box,orange,a,new THREE.Vector3(.17,.5,.22));}
    }
    for(let s=2;s<track.length;s+=2){const a=track.at(s),b=track.at(Math.min(track.length,s+2));if(chamber(a.position)||(connected&&name==='entry'&&s<MINE_PORTAL.roofStart))continue;for(const y of [2.4,2.58])beam(local(a.position,a.tangent,widthAt(name,s)-.17,y),local(b.position,b.tangent,widthAt(name,Math.min(track.length,s+2))-.17,y),.035,dark)}
    for(let s=8;s<track.length;s+=13){const {position:p,tangent:t}=track.at(s);if(chamber(p)||(connected&&name==='entry'&&s<MINE_PORTAL.roofStart))continue;const v=local(p,t,0,4.55);instance(box,dark,v,new THREE.Vector3(.66,.16,.3));instance(box,name==='deep'?blue:light,v.clone().add(new THREE.Vector3(0,-.1,0)),new THREE.Vector3(.48,.06,.2));lamps.push({position:v.clone().add(new THREE.Vector3(0,-.3,0)),color:name==='deep'?0x9ddcdb:0xffd6a0})}
  }
  for(const name of tracks.names||['entry','ore','deep'])tunnel(name);
  // A shared hall has explicit openings; no tunnel shell crosses the junction.
  block(floor,[0,-2.25,-65],[28,.4,24]);
  const hallRock=mat(0x73766b,{roughness:1,map:texture});
  block(hallRock,[0,5.15,-65],[29,.7,25]);block(hallRock,[0,1.5,-77.3],[28,7,.6]);
  for(const x of [-14.3,14.3]){block(hallRock,[x,1.5,-58.5],[.6,7,11]);block(hallRock,[x,1.5,-74.5],[.6,7,5]);block(hallRock,[x,4.3,-68],[.6,1.4,8])}
  for(const x of [-9,9])block(hallRock,[x,1.5,-52.7],[10,7,.6]);block(hallRock,[0,4.3,-52.7],[8,1.4,.6]);
  if(connected){
    // The old dark backdrop hid gaps at the hall's rectangular doorways.
    // Arched collars now join all three openings to their actual tunnel shells.
    const collarMaterial=mat(0x62665c,{map:texture,side:THREE.DoubleSide});
    function collar(position,rotation){
      const shape=new THREE.Shape();shape.moveTo(-4.5,-.25);shape.lineTo(4.5,-.25);shape.lineTo(4.5,7);shape.lineTo(-4.5,7);shape.closePath();
      const hole=new THREE.Path();hole.moveTo(-3.3,-.15);hole.lineTo(-3.3,2);
      const profile=[[-3.3,-.15],[-3.3,2]];
      for(let i=0;i<=24;i++){const a=Math.PI-i*Math.PI/24,x=3.3*Math.cos(a),y=2+2.55*Math.sin(a);hole.lineTo(x,y);profile.push([x,y])}hole.lineTo(3.3,-.15);hole.closePath();profile.push([3.3,-.15]);shape.holes.push(hole);
      const root=new THREE.Group();root.position.set(...position);root.rotation.y=rotation;scene.add(root);mesh(ownGeo(new THREE.ShapeGeometry(shape)),collarMaterial,root);
      const p=[],ix=[];for(const z of [0,4])for(const [x,y] of profile)p.push(x,y,z);
      for(let i=0;i<profile.length-1;i++){const n=profile.length;ix.push(i,i+1,i+n,i+1,i+n+1,i+n)}
      const g=ownGeo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();mesh(g,collarMaterial,root);
    }
    collar([0,-2,-53],0);collar([-13.8,-2,-68],-Math.PI/2);collar([13.8,-2,-68],Math.PI/2);
  }
  for(const x of [-11,11]){beam(new THREE.Vector3(x,-2,-56),new THREE.Vector3(x,4.7,-56),.24,steel);beam(new THREE.Vector3(x,-2,-74),new THREE.Vector3(x,4.7,-74),.24,steel)}
  for(const z of [-56,-74])beam(new THREE.Vector3(-11,4.7,z),new THREE.Vector3(11,4.7,z),.22,steel);
  lamps.push({position:new THREE.Vector3(0,3.8,-65),color:0xffd9b0});
  const signalMaterial=mat(0xc76b31,{emissive:0xff7a22,emissiveIntensity:2});
  block(dark,[2.5,-.8,-52],[.12,2.4,.12]);block(dark,[2.5,.5,-52],[.6,.65,.35]);
  const signal=mesh(ownGeo(new THREE.SphereGeometry(.16,12,8)),signalMaterial);signal.position.set(2.5,.5,-51.77);
  const lever=new THREE.Group();lever.position.set(2.5,-1.8,-52);scene.add(lever);block(steel,[0,.45,0],[.06,.9,.06],lever);block(orange,[0,.92,0],[.22,.12,.15],lever);
  function sign(text,position,width=3,color='#ffc56e',rotation=0){
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;const c=canvas.getContext('2d');c.fillStyle='#182a2a';c.fillRect(0,0,768,192);c.strokeStyle=color;c.lineWidth=8;c.strokeRect(7,7,754,178);c.fillStyle=color;c.font='bold 46px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,384,96,720);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;textures.add(tex);const m=new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide});materials.add(m);const o=mesh(ownGeo(new THREE.PlaneGeometry(width,width/4)),m);o.position.set(...position);o.rotation.y=rotation;return o;
  }
  if(!connected)sign('ШТРЕК 01 / ВХОД',[0,3.4,2],4);sign(tracks.names?'← ЗАПАДНЫЕ ЛИНИИ     ВОСТОЧНЫЕ ЛИНИИ →':'← РУДНАЯ ЖИЛА     ГОРИЗОНТ −18 →',[0,2.2,-76.9],9);
  const networkWorld=tracks.junctions?addNetworkJunctions({tracks,scene,ownGeo,mat,texture,lamps,sign}):null;
  for(const name of tracks.terminals||['ore','deep']){
    const track=tracks[name],{position:p,tangent:t}=track.at(track.length-1);
    const wall=block(hallRock,[p.x,p.y+2.5,p.z],[12,6,.8]);wall.rotation.y=Math.atan2(-t.x,-t.z);
    const stop=track.at(track.length-3);beam(local(stop.position,stop.tangent,-1.3,.7),local(stop.position,stop.tangent,1.3,.7),.22,red,.3);
    sign(tracks.labels?tracks.labels[name]+' / НАЗАД S':name==='ore'?'РУДНАЯ КАМЕРА / НАЗАД S':'ГОРИЗОНТ −18 / НАЗАД S',[p.x,p.y+3,p.z+.5],4.8,name==='ore'?'#ffc56e':'#8fe9e2',Math.atan2(-t.x,-t.z));
    const vein=mat(name==='ore'?0xc08a48:0x51978d,{metalness:.45,roughness:.65});const stone=ownGeo(new THREE.DodecahedronGeometry(1,0));
    for(let i=0;i<45;i++){const a=i*2.4,r=1+Math.sqrt(i/45)*2.1;instance(stone,vein,new THREE.Vector3(p.x+Math.sin(a)*r,p.y+.1+(i%4)*.18,p.z-1+Math.cos(a)*r),new THREE.Vector3(.3+(i%3)*.12,.3,.4))}
  }
  // Entrance platform and parked wagons establish a working underground railway.
  block(floor,[-3.1,.18,4],[2.5,.5,18]);for(const z of [-4,0,4,8,12])instance(box,orange,new THREE.Vector3(-1.85,.47,z),new THREE.Vector3(.15,.025,1.5));
  sign('СТАНЦИЯ / КАРЬЕР',[-3.4,2.8,10],3.5);
  if(!connected){block(dark,[0,2.6,14.4],[10,5.8,.5]);for(let y=.2;y<5.5;y+=.4)block(steel,[0,y,14.05],[8,.08,.12]);sign('КАРЬЕР / ВЫХОД',[0,3.5,13.9],4.5,'#ffc56e',Math.PI)}
  if(connected){block(red,[0,.45,13.3],[2.3,.2,.2]);sign('КАРЬЕР / СТАНЦИЯ',[-3.4,2.8,10],3.5,'#ffc56e',Math.PI)}
  for(const x of [-3.72,-2.28])beam(new THREE.Vector3(x,.56,-1),new THREE.Vector3(x,.56,13),.08,steel);
  function cart(powered=false){
    const root=new THREE.Group();scene.add(root);const wheels=[];
    block(dark,[0,.48,0],[1.6,.3,2.6],root);
    for(const z of [-.85,.85]){const axle=mesh(cylinder,steel,root);axle.position.set(0,.48,z);axle.scale.set(.07,1.9,.07);axle.rotation.z=Math.PI/2;
      for(const x of [-.76,.76]){const pivot=new THREE.Group();pivot.position.set(x,.48,z);root.add(pivot);const wheel=mesh(cylinder,dark,pivot);wheel.scale.set(.29,.16,.29);wheel.rotation.z=Math.PI/2;const rim=mesh(cylinder,steel,pivot);rim.scale.set(.32,.035,.32);rim.rotation.z=Math.PI/2;rim.position.x=x>0?-.09:.09;wheels.push(pivot)}}
    block(orange,[0,.78,.15],[1.55,.16,2.15],root);
    for(const side of [-1,1]){const wall=block(orange,[side*.78,1.22,.25],[.1,.85,1.95],root);wall.rotation.z=-side*.08;for(const z of [-.55,.15,.85])block(dark,[side*.85,1.2,z],[.055,.85,.055],root)}
    block(orange,[0,1.22,1.22],[1.65,.85,.1],root);block(orange,[0,1.22,-.72],[1.65,.85,.1],root);
    for(const z of [-1.52,1.52])block(steel,[0,.48,z],[.25,.16,.4],root);
    if(powered){
      block(dark,[0,.95,-.93],[1.35,.4,.46],root);block(steel,[0,1.45,-1.05],[1.15,.12,.24],root);
      for(const x of [-.5,.5])block(light,[x,.9,-1.36],[.22,.19,.1],root);
      for(const x of [-.85,.85]){beamCart(x)}
      function beamCart(x){block(steel,[x,1.35,-.95],[.055,1.1,.055],root);block(steel,[x,1.9,-.95],[.055,.055,.8],root)}
    }
    return {root,wheels};
  }
  const train=[cart(true),cart(false)];
  for(let i=0;i<2;i++){const parked=cart(false);parked.root.position.set(-3,.425,4+i*4)}
  for(const {geometry,material,matrices} of batches.values()){const o=new THREE.InstancedMesh(geometry,material,matrices.length);matrices.forEach((m,i)=>o.setMatrixAt(i,m));o.computeBoundingSphere();scene.add(o)}
  scene.add(new THREE.AmbientLight(0xb7c7c3,.58));
  const outdoorLight=new THREE.PointLight(0xfff1ce,160,36,1.4);if(connected){outdoorLight.position.set(0,7,4);scene.add(outdoorLight)}
  const pool=Array.from({length:5},()=>{const l=new THREE.PointLight(0xffd5a1,110,25,1.8);scene.add(l);return l});
  const headlight=new THREE.SpotLight(0xffe8bc,160,60,.62,.65,1.4);scene.add(headlight,headlight.target);
  function update(drive){
    networkWorld?.update(drive);
    lever.rotation.z=drive.released?(drive.branch==='ore'?.6:-.6):0;signalMaterial.emissive.set(drive.released?0x56d3a2:0xff7a22);signalMaterial.color.set(drive.released?0x56d3a2:0xff7a22);
    train.forEach((cart,i)=>{const {position:p,tangent:t}=drive.pose(-i*3.45);cart.root.position.copy(p);cart.root.rotation.order='YXZ';cart.root.rotation.y=Math.atan2(-t.x,-t.z);cart.root.rotation.x=Math.atan2(t.y,Math.hypot(t.x,t.z));for(const w of cart.wheels)w.rotation.x=-drive.travelled/.29});
    const {position:p,tangent:t}=drive.pose(),near=lamps.map(l=>({...l,distance:l.position.distanceToSquared(p)})).sort((a,b)=>a.distance-b.distance);
    pool.forEach((l,i)=>{l.position.copy(near[i].position);l.color.set(near[i].color)});
    headlight.position.copy(p).add(new THREE.Vector3(0,1.3,0)).addScaledVector(t,1.2);headlight.target.position.copy(p).addScaledVector(t,20).add(new THREE.Vector3(0,1.3,0));
  }
  return {scene,train,update,dispose(){for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();scene.traverse(o=>{if(o.isInstancedMesh)o.dispose()})}};
}
