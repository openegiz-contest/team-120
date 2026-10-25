import {createMountainSampler} from './mountain-landscape.mjs?v=relief-2';

export const RUDNY_MAPS=Object.freeze({
  sarbay:Object.freeze({id:'sarbay',title:'Сарбайский',description:'Вытянутая чаша · 10 уступов · охристые породы',rock:0xd4b692,earth:0xddc6a1,road:0xe0cba4,sky:0xded9c9}),
  sokolov:Object.freeze({id:'sokolov',title:'Соколовский',description:'Асимметричная чаша · 12 уступов · серые руды',rock:0x9faeba,earth:0xc3c1b1,road:0xbcb6a5,sky:0xc3d1d8})
});

export function rudnyOverview(kind,aspect,wide=false){
  const scale=(aspect<1?1.03/Math.max(.62,aspect):1)*(wide?1.3:1);
  return {target:[0,75,-10],position:[(kind==='sarbay'?670:760)*scale,75+730*scale,950*scale],fov:46};
}

export async function installRudnyTerrain(loader,world,kind){
  if(!RUDNY_MAPS[kind])return null;
  const asset=await loader.loadAsync('./assets/rudny/'+kind+'-terrain.glb?v=rudny-1'),previous=[];
  world.traverse(o=>{if(o.userData.asset_id==='GEO_001')previous.push(o)});
  world.traverse(o=>{if(/^ROAD_TRACK_|^SITE_00[23]$/.test(o.userData.asset_id||''))o.visible=false});
  for(const o of previous)o.removeFromParent();
  asset.scene.traverse(o=>{if(o.userData.rudny_surface==='outside'||o.name==='Continuous_land_outside_quarry')o.name='Continuous land outside quarry'});
  world.add(asset.scene);world.userData.rudnyMap=kind;world.updateMatrixWorld(true);
  return asset.scene;
}

export function styleRudnyMaterials(world,kind){
  const cfg=RUDNY_MAPS[kind];if(!cfg)return;
  const done=new Set();
  world.traverse(o=>{if(!o.isMesh)return;for(const mat of Array.isArray(o.material)?o.material:[o.material]){
    if(!mat||done.has(mat))continue;done.add(mat);
    const rock=mat.name==='16_Continuous_geology',earth=/^04_Gravel|earth berm/.test(mat.name),road=mat.name==='Navigation / compacted road';
    if(!(rock||earth||road))continue;
    mat.color.set(rock?cfg.rock:road?cfg.road:cfg.earth);
    if(rock&&kind==='sokolov'){
      const compile=mat.onBeforeCompile,cache=mat.customProgramCacheKey();
      mat.onBeforeCompile=shader=>{compile(shader);shader.fragmentShader=shader.fragmentShader.replace('diffuseColor.rgb*=qc;',`float oxide=pow(.5+.5*sin(vQuarryPosition.y*.145+sin(vQuarryPosition.x*.016)*1.7),8.);qc=mix(qc,qc*vec3(1.33,.68,.43),oxide*.45);diffuseColor.rgb*=qc;`)};
      mat.customProgramCacheKey=()=>cache+'-sokolov-oxide';
    }
    mat.needsUpdate=true;
  }});
}

export async function loadRudnyLandscape({THREE,scene,world,renderer,kind,surfaces,route=[],design={}}){
  const cfg=RUDNY_MAPS[kind],base='./assets/rudny/';
  const response=await fetch(base+kind+'-profile.json?v=rudny-1');if(!response.ok)throw new Error('Rudny profile '+response.status);
  const profile=await response.json(),raw=await fetch(base+profile.heightFile+'?v=rudny-1');if(!raw.ok)throw new Error('Rudny heights '+raw.status);
  const heightAt=createMountainSampler(profile,new Float32Array(await raw.arrayBuffer()));
  scene.getObjectByName('GAME / surrounding landscape')?.removeFromParent();
  const ground=world.getObjectByName('Continuous land outside quarry');
  let rim;world.traverse(o=>{for(const mat of Array.isArray(o.material)?o.material:[o.material])if(mat?.name==='04_Gravel')rim=mat});
  if(rim){ground.material=rim.clone();ground.material.onBeforeCompile=rim.onBeforeCompile;ground.material.customProgramCacheKey=rim.customProgramCacheKey;ground.material.vertexColors=true}
  ground.receiveShadow=true;
  const group=new THREE.Group();group.name='RUDNY / '+kind+' industrial steppe';scene.add(group);
  const dummy=new THREE.Object3D(),colour=new THREE.Color();
  const smooth=x=>{const v=Math.max(0,Math.min(1,x));return v*v*(3-2*v)};
  const postRows=[];for(let i=0;i<route.length-1;i+=25){const p=route[i],q=route[i+1],dx=q[1]-p[1],dz=q[3]-p[3],length=Math.hypot(dx,dz)||1;let extra=0;for(const bay of design.passing_bays||[])extra=Math.max(extra,10*smooth((57.5-Math.abs(p[0]-bay.station_m))/30));const fade=smooth((p[0]-60)/55)*smooth((route.at(-1)[0]-100-p[0])/65);for(const side of [-1,1]){const off=side*(6.9+(side>0?extra:0));postRows.push([p[1]-dz/length*off,p[2]+.7+1.4*fade,p[3]+dx/length*off])}}
  const posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.18,1.4,.18),new THREE.MeshStandardMaterial({color:0xe4d8be,roughness:.9}),postRows.length);
  postRows.forEach((p,i)=>{dummy.position.set(...p);dummy.updateMatrix();posts.setMatrixAt(i,dummy.matrix)});group.add(posts);
  const stones=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:cfg.rock,roughness:1,flatShading:true}),650);
  let seed=kind==='sarbay'?33077:59023;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  for(let i=0;i<650;i++){
    const angle=random()*Math.PI*2,r=1030+random()*2200,x=Math.cos(angle)*r,z=Math.sin(angle)*r,size=1.5+random()*5;
    dummy.position.set(x,(heightAt(x,z)??168)+size*.2,z);dummy.rotation.set(0,random()*6.28,0);dummy.scale.set(size,size*.45,size*.8);dummy.updateMatrix();stones.setMatrixAt(i,dummy.matrix);colour.setHSL(kind==='sarbay'?.09:.58,.10+random()*.1,.3+random()*.12);stones.setColorAt(i,colour);
  }group.add(stones);
  // Separate industrial rail sidings provide scale; these are scenery, not new traffic logic.
  const railZ=kind==='sarbay'?-720:720,railX=kind==='sarbay'?-600:-1000;
  const ties=new THREE.InstancedMesh(new THREE.BoxGeometry(.35,.18,3.5),new THREE.MeshStandardMaterial({color:0x655b4e,roughness:1}),300);
  const rails=new THREE.InstancedMesh(new THREE.BoxGeometry(6.1,.22,.12),new THREE.MeshStandardMaterial({color:0x63666b,metalness:.65,roughness:.55}),600);
  for(let i=0;i<300;i++){
    const x=railX+i*6,y=heightAt(x,railZ)??168;dummy.position.set(x,y+.15,railZ);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();ties.setMatrixAt(i,dummy.matrix);
    for(let side=0;side<2;side++){dummy.position.set(x,y+.35,railZ+(side?1:-1)*.76);dummy.updateMatrix();rails.setMatrixAt(i*2+side,dummy.matrix)}
  }group.add(ties,rails);
  scene.background=new THREE.Color(cfg.sky);scene.fog=new THREE.Fog(cfg.sky,2400,8500);renderer.toneMappingExposure=kind==='sarbay'?1.06:.98;
  scene.traverse(o=>{if(o.isHemisphereLight){o.color.set(kind==='sarbay'?0xfff1d5:0xdcecf5);o.groundColor.set(kind==='sarbay'?0x82704e:0x66736a);o.intensity=1.65}if(o.isDirectionalLight&&o.position.x<0){o.color.set(kind==='sarbay'?0xffedcd:0xf0f5ff);o.intensity=2.5;o.castShadow=true;o.shadow.mapSize.set(2048,2048);Object.assign(o.shadow.camera,{left:-650,right:650,top:650,bottom:-650,near:20,far:3000});o.shadow.normalBias=.8;o.shadow.camera.updateProjectionMatrix()}});
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;world.traverse(o=>{if(o.isMesh){o.receiveShadow=true;o.castShadow=o!==ground}});
  return {group,profile,heightAt,contain(camera,controls){const before=controls.target.clone();controls.target.x=Math.max(-610,Math.min(610,controls.target.x));controls.target.z=Math.max(-530,Math.min(530,controls.target.z));controls.target.y=Math.max(0,Math.min(400,controls.target.y));camera.position.add(controls.target.clone().sub(before))},guardCamera(camera){const y=heightAt(camera.position.x,camera.position.z);if(y!==null&&camera.position.y<y+24)camera.position.y=y+24},update(){}};
}
