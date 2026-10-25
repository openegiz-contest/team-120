// Decorative surroundings only. The road graph, vehicle FSM and GLB remain unchanged.
export const LANDSCAPE={halfX:500,halfZ:420,plateau:168,extent:14000,fogNear:3200,fogFar:8200};
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
const hills=[[-1050,-950,230,460,370],[1050,-1250,290,450,580],[-1300,800,130,550,440],[1400,500,140,540,420],[-2500,-2100,530,850,650],[1900,-2800,660,900,740],[3200,-900,480,800,1000],[-3400,400,540,900,900],[200,3400,390,1100,800],[-2200,3200,460,1000,900],[3900,2500,610,1200,1100]];
export function distanceFromQuarry(x,z){return Math.hypot(Math.max(0,Math.abs(x)-500),Math.max(0,Math.abs(z)-420))}
export function landscapeHeight(x,z){
  const distance=distanceFromQuarry(x,z);
  if(distance<=24)return 168;
  let h=0;
  for(const [cx,cz,height,sx,sz] of hills)h+=height*Math.exp(-(((x-cx)/sx)**2+((z-cz)/sz)**2)*1.6);
  const noise=15*Math.sin(x*.004+Math.sin(z*.002))+10*Math.sin(z*.006-x*.002)+5*Math.sin(x*.013+z*.011);
  // Broad dumps, with shallow working benches, blend into the surrounding ground.
  for(const [cx,cz,height,radius] of [[-780,-40,72,210],[770,-680,95,250]]){
    const r=Math.hypot((x-cx)/1.25,z-cz),q=Math.max(0,1-r/radius);
    h+=height*(q*.7+Math.floor(q*4)*.075);
  }
  return 168+smooth((distance-24)/330)*Math.max(-16,h+noise);
}
export function terrainAxes(half){
  const positive=[0,half];
  for(let v=50;v<=1800;v+=50)positive.push(v);
  for(let v=1950;v<=6000;v+=150)positive.push(v);
  for(let v=6600;v<14000;v+=600)positive.push(v);
  positive.push(14000);
  return [...new Set(positive.flatMap(v=>v?[v,-v]:[0]))].sort((a,b)=>a-b);
}
const surfaceX=terrainAxes(500),surfaceZ=terrainAxes(420);
export function landscapeSurfaceHeight(x,z){
  const cell=(axis,v)=>{let lo=0,hi=axis.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(axis[mid]<=v)lo=mid;else hi=mid}return Math.min(lo,axis.length-2)};
  const i=cell(surfaceX,x),j=cell(surfaceZ,z),x0=surfaceX[i],x1=surfaceX[i+1],z0=surfaceZ[j],z1=surfaceZ[j+1];
  const u=Math.max(0,Math.min(1,(x-x0)/(x1-x0))),v=Math.max(0,Math.min(1,(z-z0)/(z1-z0)));
  const a=landscapeHeight(x0,z0),b=landscapeHeight(x1,z0),c=landscapeHeight(x0,z1),d=landscapeHeight(x1,z1);
  return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}
export function buildLandscapeSurface(){
  const xs=terrainAxes(500),zs=terrainAxes(420),positions=[],uvs=[],colors=[],indices=[];
  for(const z of zs)for(const x of xs){
    const d=distanceFromQuarry(x,z),y=landscapeHeight(x,z);
    positions.push(x,y,z);uvs.push(x/18,1+z/18);
    const blend=smooth((d-24)/300),mottle=.90+.07*Math.sin(x*.009+z*.006)+.04*Math.sin(z*.019-x*.012);
    colors.push(1+blend*(mottle-1),1+blend*(mottle*.96-1),1+blend*(mottle*.88-1));
  }
  for(let j=0;j<zs.length-1;j++)for(let i=0;i<xs.length-1;i++){
    const x=(xs[i]+xs[i+1])/2,z=(zs[j]+zs[j+1])/2;
    if(Math.abs(x)<500&&Math.abs(z)<420)continue;
    const a=j*xs.length+i,b=a+1,c=a+xs.length,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  return {positions,uvs,colors,indices};
}
export function addQuarryLandscape(THREE,scene,world){
  let groundMaterial;
  world.traverse(o=>{for(const mat of (Array.isArray(o.material)?o.material:[o.material]))if(mat?.name==='04_Gravel')groundMaterial=mat});
  const group=new THREE.Group();group.name='GAME / surrounding landscape';
  const data=buildLandscapeSurface(),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(data.uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(data.colors,3));geometry.setIndex(data.indices);geometry.computeVertexNormals();
  const material=groundMaterial?groundMaterial.clone():new THREE.MeshStandardMaterial({color:0xb3a07b,roughness:1});material.vertexColors=true;material.side=THREE.FrontSide;
  const terrain=new THREE.Mesh(geometry,material);terrain.name='Continuous land outside quarry';group.add(terrain);
  // A narrow collar hides millimetre-scale Draco quantization at the old block edge.
  const collarPositions=[],collarUV=[],collarIndices=[];
  for(const offset of [-1,1])for(const [sx,sz] of [[-1,-1],[-1,1],[1,1],[1,-1]]){const x=sx*(500+offset),z=sz*(420+offset);collarPositions.push(x,168.045,z);collarUV.push(x/18,1+z/18)}
  for(let i=0;i<4;i++){const j=(i+1)%4;collarIndices.push(i,j,j+4,i,j+4,i+4)}
  const collarGeometry=new THREE.BufferGeometry();collarGeometry.setAttribute('position',new THREE.Float32BufferAttribute(collarPositions,3));collarGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(collarUV,2));collarGeometry.setIndex(collarIndices);collarGeometry.computeVertexNormals();
  const collarMaterial=material.clone();collarMaterial.vertexColors=false;collarMaterial.side=THREE.DoubleSide;const collar=new THREE.Mesh(collarGeometry,collarMaterial);collar.name='Quarry edge precision collar';group.add(collar);
  // A distant decorative access road; not a navigable segment or a new game endpoint.
  const curve=new THREE.CatmullRomCurve3([[260,168,-408],[290,168,-500],[460,168,-680],[700,168,-920],[780,168,-1330],[650,168,-1770],[450,168,-2200],[0,168,-2900],[400,168,-3900],[750,168,-5200],[950,168,-6500],[1100,168,-8500]].map(p=>new THREE.Vector3(...p)));
  function roadRibbon(width,offset,color){const p=[],ix=[];const count=1200;
    for(let i=0;i<=count;i++){const t=i/count,v=curve.getPoint(t),tangent=curve.getTangent(t),normal=new THREE.Vector3(-tangent.z,0,tangent.x).normalize();
      for(const sign of [-1,1]){const q=v.clone().addScaledVector(normal,width*.5*sign);p.push(q.x,landscapeSurfaceHeight(q.x,q.z)+offset,q.z)}
      if(i<count){const a=i*2;ix.push(a,a+2,a+1,a+1,a+2,a+3)}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,roughness:1,side:THREE.DoubleSide}));m.name='Decorative access road';group.add(m);
  }
  roadRibbon(27,.45,0x9d8968);roadRibbon(16,.65,0xb8a17b);
  let seed=842;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  const rockGeometry=new THREE.DodecahedronGeometry(1,0),rockMaterial=new THREE.MeshStandardMaterial({color:0x8b7e66,roughness:1,flatShading:true});
  const stones=new THREE.InstancedMesh(rockGeometry,rockMaterial,350),dummy=new THREE.Object3D(),color=new THREE.Color();let placed=0;
  while(placed<350){const angle=rand()*Math.PI*2,radius=650+rand()*1300,x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;
    if(distanceFromQuarry(x,z)<110)continue;
    // Leave the northern approach clear of boulders.
    if(z<-420&&x>150&&x<1100)continue;
    const s=2+rand()*6;dummy.position.set(x,landscapeSurfaceHeight(x,z)+s*.25,z);dummy.scale.set(s*(.7+rand()),s*.45,s);dummy.rotation.set(rand()*.3,rand()*6,rand()*.3);dummy.updateMatrix();stones.setMatrixAt(placed,dummy.matrix);color.setRGB(.7+rand()*.2,.68+rand()*.18,.57+rand()*.16);stones.setColorAt(placed,color);placed++;
  }
  stones.name='Distant rock outcrops';stones.instanceMatrix.needsUpdate=true;group.add(stones);scene.add(group);
  scene.background=new THREE.Color(0xdcd9ca);scene.fog=new THREE.Fog(0xdcd9ca,LANDSCAPE.fogNear,LANDSCAPE.fogFar);
  return {group,triangles:data.indices.length/3+350*36+1200*4+8};
}
export function configureLandscapeCamera(controls){controls.maxDistance=3300;controls.maxPolarAngle=Math.PI*.43;controls.minPolarAngle=.12;}
export function createQuarryCameraGuard(THREE,world){
  const surfaces=[];world.updateMatrixWorld(true);world.traverse(o=>{if(o.userData.asset_id==='GEO_001')o.traverse(m=>{if(m.isMesh)surfaces.push(m)})});
  const ray=new THREE.Raycaster(),origin=new THREE.Vector3(),direction=new THREE.Vector3();
  return (camera,controls)=>{
    if(!surfaces.length||camera.position.distanceToSquared(controls.target)>90000)return;
    // Manual panning must not leave the orbit target buried inside a higher terrace.
    origin.set(controls.target.x,3000,controls.target.z);direction.set(0,-1,0);ray.set(origin,direction);ray.near=0;ray.far=3100;
    const targetGround=ray.intersectObjects(surfaces,false)[0];
    if(targetGround&&targetGround.point.y>controls.target.y+.5)controls.target.y=targetGround.point.y+1;
    // Keep close cameras on the vehicle side of a bench, rather than behind the rock.
    origin.copy(controls.target);origin.y+=4;direction.subVectors(camera.position,origin);const length=direction.length();if(length<1)return;direction.divideScalar(length);
    ray.set(origin,direction);ray.near=.2;ray.far=length;
    const hit=ray.intersectObjects(surfaces,false)[0];
    if(hit){camera.position.copy(origin).addScaledVector(direction,Math.max(2,hit.distance-3));camera.lookAt(controls.target)}
  };
}
export function containLandscapeCamera(camera,controls){
  const x=Math.max(-610,Math.min(610,controls.target.x)),z=Math.max(-530,Math.min(530,controls.target.z)),y=Math.max(0,Math.min(195,controls.target.y));
  camera.position.x+=x-controls.target.x;camera.position.y+=y-controls.target.y;camera.position.z+=z-controls.target.z;controls.target.set(x,y,z);
  if(Math.abs(camera.position.x)>=500||Math.abs(camera.position.z)>=420)camera.position.y=Math.max(camera.position.y,landscapeSurfaceHeight(camera.position.x,camera.position.z)+22);
  else camera.position.y=Math.max(camera.position.y,3);
}
