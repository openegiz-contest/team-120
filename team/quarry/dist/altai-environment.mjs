import {buildAltaiSurface,altaiSurfaceHeight,createAltaiForest} from './altai-terrain.mjs';

export function createAltaiEnvironment({THREE,scene,world,renderer,surfaces,route,getFleet,landscapeProfile=null}){
  const group=new THREE.Group();group.name='ALTAI / night environment';scene.add(group);
  const data=buildAltaiSurface();let ground;
  scene.traverse(o=>{if(o.name==='Continuous land outside quarry')ground=o});
  if(ground&&!landscapeProfile){
    const positions=ground.geometry.attributes.position;positions.array.set(data.positions);positions.needsUpdate=true;ground.geometry.computeVertexNormals();ground.geometry.computeBoundingSphere();
    const material=new THREE.MeshStandardMaterial({color:0xffffff,map:surfaces.gravel.albedo,normalMap:surfaces.gravel.normal,normalScale:new THREE.Vector2(.3,.3),roughness:1});
    material.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vAltaiPosition;varying vec3 vAltaiNormal;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvAltaiPosition=(modelMatrix*vec4(transformed,1.)).xyz;vAltaiNormal=normalize(mat3(modelMatrix)*objectNormal);');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vAltaiPosition;varying vec3 vAltaiNormal;').replace('#include <map_fragment>',`
        #include <map_fragment>
        float fleck=sin(vAltaiPosition.x*.017+sin(vAltaiPosition.z*.01)*3.)*sin(vAltaiPosition.z*.021);
        float steep=1.-smoothstep(.52,.88,abs(vAltaiNormal.y));
        vec3 grass=mix(vec3(.15,.24,.105),vec3(.28,.40,.17),.5+.5*fleck);
        vec3 rock=mix(vec3(.36,.39,.40),vec3(.52,.52,.45),.5+.5*fleck);
        float snow=smoothstep(1430.,1740.,vAltaiPosition.y+100.*fleck)*smoothstep(.48,.83,abs(vAltaiNormal.y));
        diffuseColor.rgb*=mix(mix(grass,rock,steep),vec3(.93,.97,1.),snow)*1.65;
      `);
    };material.customProgramCacheKey=()=> 'altai-grass-rock-snow-v1';ground.material=material;ground.receiveShadow=true;
  }
  // Earth at the lip is worked gravel; a sparse green transition grows outward.
  world.traverse(o=>{if(!o.isMesh)return;const paint=m=>{if(!/^04_Gravel/.test(m.name))return m;const n=m.clone();n.onBeforeCompile=m.onBeforeCompile;n.customProgramCacheKey=m.customProgramCacheKey;n.color.set(0x9caa80);return n};o.material=Array.isArray(o.material)?o.material.map(paint):paint(o.material)});
  // Keep the existing access ribbon on the new distant mountain triangles.
  if(!landscapeProfile)scene.traverse(o=>{if(o.name!=='Decorative access road')return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,altaiSurfaceHeight(p.getX(i),p.getZ(i))+.7);p.needsUpdate=true;o.geometry.computeVertexNormals();o.geometry.computeBoundingSphere()});
  scene.background=new THREE.Color(0x0b1729);scene.fog=new THREE.FogExp2(0x132b3b,.000105);
  scene.traverse(o=>{if(o.isHemisphereLight){o.color.set(0x8da8c8);o.groundColor.set(0x253c2e);o.intensity=1.25}else if(o.isDirectionalLight){o.color.set(o.position.x<0?0xadcbef:0x719ba9);o.intensity=o.position.x<0?1.5:.38}});
  renderer.toneMappingExposure=1.3;

  const forest=landscapeProfile?[]:createAltaiForest(),dummy=new THREE.Object3D(),colour=new THREE.Color();
  const trunkGeo=new THREE.CylinderGeometry(.42,.68,1,5),pineGeo=new THREE.ConeGeometry(1,1,7);pineGeo.translate(0,.5,0);
  const trunks=new THREE.InstancedMesh(trunkGeo,new THREE.MeshStandardMaterial({color:0x524b3b,roughness:1}),forest.length);
  const needles=new THREE.InstancedMesh(pineGeo,new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,flatShading:true}),forest.length*2);
  forest.forEach((t,i)=>{
    dummy.position.set(t.x,t.y+t.height*.31,t.z);dummy.scale.set(1,t.height*.62,1);dummy.rotation.set(0,t.rotation,0);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
    for(let j=0;j<2;j++){dummy.position.set(t.x,t.y+t.height*(j?.43:.15),t.z);dummy.scale.set(t.width*(j?.74:1),t.height*(j?.56:.71),t.width*(j?.74:1));dummy.updateMatrix();needles.setMatrixAt(i*2+j,dummy.matrix);colour.setRGB(.07+t.tint*.06,.18+t.tint*.13,.13+t.tint*.05);needles.setColorAt(i*2+j,colour)}
  });trunks.name='Altai / larch and cedar trunks';needles.name='Altai / conifer canopy';group.add(trunks,needles);

  const sky=new THREE.Group();sky.name='Altai / starry night';scene.add(sky);
  const dome=new THREE.Mesh(new THREE.SphereGeometry(14500,32,20),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,vertexShader:'varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 dir;void main(){float h=normalize(dir).y;vec3 c=mix(vec3(.09,.16,.22),vec3(.012,.025,.065),smoothstep(-.05,.65,h));gl_FragColor=vec4(c,1.);}'}));dome.renderOrder=-1000;sky.add(dome);
  let seed=32891;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  const stars=[];for(let i=0;i<1250;i++){const y=.08+random()*.92,a=random()*Math.PI*2,r=Math.sqrt(1-y*y);stars.push(Math.cos(a)*r*13000,y*13000,Math.sin(a)*r*13000)}
  const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));const starPoints=new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xc4d8ee,size:2.1,sizeAttenuation:false,transparent:true,opacity:.8,depthWrite:false,fog:false}));sky.add(starPoints);
  const moonCanvas=document.createElement('canvas');moonCanvas.width=moonCanvas.height=256;const mc=moonCanvas.getContext('2d');mc.fillStyle='#dce7ed';mc.beginPath();mc.arc(128,128,118,0,Math.PI*2);mc.fill();
  for(let i=0;i<45;i++){const x=36+random()*184,y=36+random()*184;if(Math.hypot(x-128,y-128)>95)continue;mc.fillStyle='rgba(90,115,145,'+(.03+random()*.1)+')';mc.beginPath();mc.arc(x,y,2+random()*19,0,Math.PI*2);mc.fill()}
  const moonTex=new THREE.CanvasTexture(moonCanvas);moonTex.colorSpace=THREE.SRGBColorSpace;const moon=new THREE.Sprite(new THREE.SpriteMaterial({map:moonTex,color:0xddeafa,depthWrite:false,fog:false}));moon.position.set(-3900,5500,-8800).normalize().multiplyScalar(12000);moon.scale.set(450,450,1);sky.add(moon);

  const lampGeo=new THREE.BoxGeometry(1,1,1),metal=new THREE.MeshStandardMaterial({color:0x435a5e,metalness:.65,roughness:.55}),emissive=new THREE.MeshStandardMaterial({color:0xffdc91,emissive:0xffbd60,emissiveIntensity:4});
  const fixtures=[];
  const terrainMeshes=[];world.traverse(o=>{if(o.userData.asset_id==='GEO_001')o.traverse(m=>{if(m.isMesh)terrainMeshes.push(m)})});world.updateMatrixWorld(true);const ray=new THREE.Raycaster();
  function block(material,p,scale){const m=new THREE.Mesh(lampGeo,material);m.position.set(...p);m.scale.set(...scale);group.add(m);return m}
  function lamp(x,y,z,dx=1,dz=0){
    block(metal,[x,y+8.5,z],[.24,17,.24]);const arm=block(metal,[x+dx*1.6,y+17,z+dz*1.6],[3.6,.18,.18]);arm.rotation.y=-Math.atan2(dz,dx);
    block(emissive,[x+dx*3,y+16.8,z+dz*3],[1.2,.16,.75]);fixtures.push(new THREE.Vector3(x+dx*3,y+16,z+dz*3));
  }
  for(let i=15;i<route.length-5;i+=44){const a=route[i],b=route[i+3],dx=b[1]-a[1],dz=b[3]-a[3],len=Math.hypot(dx,dz)||1,nx=-dz/len,nz=dx/len;let base=null;
    for(const side of [1,-1]){const x=a[1]+nx*8.5*side,z=a[3]+nz*8.5*side;ray.set(new THREE.Vector3(x,300,z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObjects(terrainMeshes,false).find(h=>Math.abs(h.point.y-a[2])<3);if(hit){base={x,y:hit.point.y,z,side};break}}
    if(base)lamp(base.x,base.y,base.z,-nx*base.side,-nz*base.side);
  }
  // Loading and processing areas keep a useful pool of light even at a distance.
  for(const [x,y,z] of [[-23,0,31],[95,0,46],[40,168,-353],[-125,168,-358]])lamp(x,y,z);
  const roadLights=Array.from({length:6},()=>{const l=new THREE.PointLight(0xffcc88,1450,115,1.8);scene.add(l);return l});
  const vehicleLamps=new Map(),headlights=Array.from({length:2},()=>{const light=new THREE.SpotLight(0xffeac7,10000,110,.48,.65,1.8);scene.add(light,light.target);return light});
  function addVehicleLamps(item){
    const root=new THREE.Group();root.name='Altai / vehicle running lights';item.object.add(root);const truck=item.kind==='truck',box=new THREE.Box3().setFromObject(item.object),size=box.getSize(new THREE.Vector3());
    // Fleet models use local +X as forward; these lights remain attached in practice.
    const front=Math.min(6,size.x*.5),width=Math.min(3,size.z*.36),height=truck?2.6:2.8;
    for(const side of [-1,1]){const bulb=new THREE.Mesh(new THREE.SphereGeometry(.16,6,4),emissive);bulb.position.set(front,height,side*width);root.add(bulb);const tail=new THREE.Mesh(new THREE.SphereGeometry(.13,6,4),new THREE.MeshBasicMaterial({color:0xf86636}));tail.position.set(-front,height*.7,side*width);root.add(tail)}
    return {object:item.object,root,front,height};
  }
  let lightAt=-Infinity;
  return {group,update(time,camera){
    sky.position.copy(camera.position);
    if(!landscapeProfile&&(Math.abs(camera.position.x)>950||Math.abs(camera.position.z)>950)&&camera.position.y<altaiSurfaceHeight(camera.position.x,camera.position.z)+24){camera.position.y=altaiSurfaceHeight(camera.position.x,camera.position.z)+24;camera.updateMatrixWorld()}
    const fleet=getFleet();for(const [id,entry] of vehicleLamps)if(!fleet.some(item=>item.id===id&&item.object===entry.object)){entry.root.removeFromParent();vehicleLamps.delete(id)}
    for(const item of fleet)if(!vehicleLamps.has(item.id))vehicleLamps.set(item.id,addVehicleLamps(item));
    const nearest=[...vehicleLamps.values()].sort((a,b)=>a.object.getWorldPosition(new THREE.Vector3()).distanceToSquared(camera.position)-b.object.getWorldPosition(new THREE.Vector3()).distanceToSquared(camera.position));
    headlights.forEach((light,i)=>{const vehicle=nearest[i];light.visible=!!vehicle;if(!vehicle)return;vehicle.object.updateWorldMatrix(true,false);light.position.copy(vehicle.object.localToWorld(new THREE.Vector3(vehicle.front,vehicle.height,0)));light.target.position.copy(vehicle.object.localToWorld(new THREE.Vector3(vehicle.front+55,.3,0)));light.target.updateMatrixWorld()});
    if(time-lightAt>250){lightAt=time;const near=fixtures.slice().sort((a,b)=>a.distanceToSquared(camera.position)-b.distanceToSquared(camera.position));roadLights.forEach((l,i)=>{l.visible=!!near[i];if(near[i])l.position.copy(near[i])})}
  }};
}
