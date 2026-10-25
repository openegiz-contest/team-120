import {createMountainWatercourse} from './mountain-watercourse.mjs?v=relief-2';
// Blender-authored scenery. The working quarry, road graph and saves stay independent.
export function createMountainSampler(profile, heights) {
  const {xs,zs}=profile;
  if(heights.length!==xs.length*zs.length)throw new Error('Invalid mountain height field');
  const cell=(a,v)=>{let lo=0,hi=a.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(a[m]<=v)lo=m;else hi=m}return lo};
  return (x,z)=>{
    if(Math.abs(x)<500&&Math.abs(z)<420)return null;
    const i=cell(xs,x),j=cell(zs,z),u=Math.max(0,Math.min(1,(x-xs[i])/(xs[i+1]-xs[i]))),v=Math.max(0,Math.min(1,(z-zs[j])/(zs[j+1]-zs[j]))),n=xs.length;
    const a=heights[j*n+i],b=heights[j*n+i+1],c=heights[(j+1)*n+i],d=heights[(j+1)*n+i+1];
    return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
  };
}

export function mountainOverview(aspect) {
  const target=[-90,410,-160],scale=aspect<1?1.02/Math.max(.65,aspect):1;
  return {target,position:[900*scale,410+670*scale,1280*scale],fov:52};
}

export function mountainSceneryView(aspect) {
  const scale=aspect<1?1/Math.max(.75,aspect):1;
  return {target:[-600,370,200],position:[-600-850*scale,370+680*scale,200+1680*scale],fov:56};
}

export async function loadMountainLandscape({THREE,scene,world,renderer,loader,kind,surfaces,route}) {
  const base='./assets/mountains/',id=kind==='altai'?'altai':'quarry';
  const response=await fetch(base+id+'-profile.json?v=relief-2');if(!response.ok)throw new Error('Mountain profile '+response.status);
  const profile=await response.json();
  const [land,botany,heightResponse]=await Promise.all([loader.loadAsync(base+id+'-landscape.glb?v=relief-2'),loader.loadAsync(base+'botany.glb'),fetch(base+profile.heightFile+'?v=relief-2')]);
  if(!heightResponse.ok)throw new Error('Mountain elevations '+heightResponse.status);
  const heights=new Float32Array(await heightResponse.arrayBuffer()),heightAt=createMountainSampler(profile,heights);
  const group=new THREE.Group();group.name='BLENDER / mountain landscape';scene.add(group);group.add(land.scene);
  const old=scene.getObjectByName('GAME / surrounding landscape');if(old){old.visible=false;old.traverse(o=>{if(o.name==='Continuous land outside quarry')o.name='Legacy surrounding ground'})}
  const ground=land.scene.getObjectByName('MountainGround');ground.name='Continuous land outside quarry';ground.receiveShadow=true;
  const rockMap=surfaces.rock;
  // Triplanar rock detail avoids stretched textures on steep cliffs; vertex colours
  // retain Blender's grass, mineral, scree and snow masks at landscape scale.
  const terrainMaterial=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1});
  terrainMaterial.onBeforeCompile=shader=>{
    shader.uniforms.strataMap={value:rockMap.albedo};shader.uniforms.gravelMap={value:surfaces.gravel.albedo};shader.uniforms.soilRoughness={value:surfaces.gravel.roughness};shader.uniforms.strataNormal={value:rockMap.normal};shader.uniforms.lipTint={value:new THREE.Color(id==='altai'?0x9caa80:0xffffff)};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vMountainP;varying vec3 vMountainN;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvMountainP=(modelMatrix*vec4(transformed,1.)).xyz;vMountainN=normalize(mat3(modelMatrix)*objectNormal);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vMountainP;varying vec3 vMountainN;uniform sampler2D strataMap;uniform sampler2D gravelMap;').replace('#include <map_fragment>',`
      vec3 w=pow(abs(vMountainN),vec3(4.));w/=max(.0001,w.x+w.y+w.z);
      vec3 p=vMountainP/22.;
      vec3 rock=texture2D(strataMap,p.yz).rgb*w.x+texture2D(strataMap,p.xz).rgb*w.y+texture2D(strataMap,p.xy).rgb*w.z;
      float detail=dot(rock,vec3(.299,.587,.114));
      float soil=dot(texture2D(gravelMap,vMountainP.xz/19.).rgb,vec3(.299,.587,.114));
      float steep=1.-smoothstep(.55,.9,abs(vMountainN.y));
      diffuseColor.rgb*=mix(.18+soil*.53,.20+detail*.85,steep);
      float warp=texture2D(strataMap,vMountainP.xz/380.).g*8.;
      float joints=pow(.5+.5*sin(vMountainP.x*.135+vMountainP.z*.073+sin(vMountainP.y*.019)*.8+warp),16.);
      float beds=pow(.5+.5*sin(vMountainP.y*.19+sin(vMountainP.x*.012)*1.4+cos(vMountainP.z*.016)+warp*.4),18.);
      diffuseColor.rgb*=1.-steep*(joints*.17+beds*.06);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('uniform sampler2D gravelMap;','uniform sampler2D gravelMap;uniform sampler2D soilRoughness;uniform sampler2D strataNormal;uniform vec3 lipTint;').replace('#include <color_fragment>',`
      #include <color_fragment>
      float lip=length(max(abs(vMountainP.xz)-vec2(500.,420.),vec2(0.)));
      float mottling=texture2D(soilRoughness,vMountainP.xz/173.).g;
      float soilPatch=sin(vMountainP.x*.017+sin(vMountainP.z*.022)*2.)*sin(vMountainP.z*.013-vMountainP.x*.009);
      vec3 rim=texture2D(gravelMap,vMountainP.xz/16.).rgb*(.88+(mottling-.88)*2.+soilPatch*.13);
      diffuseColor.rgb=mix(rim*lipTint,diffuseColor.rgb,smoothstep(3.,170.,lip));
      float cliffFace=1.-smoothstep(.30,.72,abs(vMountainN.y));
      diffuseColor.rgb*=mix(vec3(1.),vec3(.48,.56,.60),cliffFace*.8*smoothstep(30.,170.,lip));
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
      vec2 nx=texture2D(strataNormal,p.yz).xy*2.-1.,ny=texture2D(strataNormal,p.xz).xy*2.-1.,nz=texture2D(strataNormal,p.xy).xy*2.-1.;
      vec3 detailNormal=vec3(0.,nx.x,nx.y)*w.x+vec3(ny.x,0.,ny.y)*w.y+vec3(nz.x,nz.y,0.)*w.z;
      vec3 baseNormal=normalize(vMountainN);detailNormal-=baseNormal*dot(baseNormal,detailNormal);
      normal=normalize(normal+mat3(viewMatrix)*detailNormal*steep*1.1);
    `);
  };terrainMaterial.customProgramCacheKey=()=> 'blender-mountain-triplanar-v2';ground.material=terrainMaterial;
  const road=land.scene.getObjectByName('ValleyAccessRoad');road.material=new THREE.MeshStandardMaterial({color:0xc4b28f,map:surfaces.road.albedo,normalMap:surfaces.road.normal,normalScale:new THREE.Vector2(.4,.4),roughness:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});road.receiveShadow=true;
  const dummy=new THREE.Object3D(),colour=new THREE.Color();
  function instances(name,geometry,material,rows,scale=[1,1,1],raise=0,tint=false) {
    const mesh=new THREE.InstancedMesh(geometry,material,rows.length);mesh.name=name;
    rows.forEach(([x,y,z,s,a],i)=>{dummy.position.set(x,y+raise*s,z);dummy.rotation.set(0,a,0);dummy.scale.set(s*scale[0],s*scale[1],s*scale[2]);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(tint){colour.setHSL(.19+(i%7)*.008,.22+(i%5)*.035,.22+(i%11)*.012);mesh.setColorAt(i,colour)}});
    mesh.computeBoundingSphere();group.add(mesh);return mesh;
  }
  botany.scene.updateMatrixWorld(true);
  const nearTrees=profile.trees.filter(t=>Math.hypot(t[0],t[2])<1600),farTrees=profile.trees.filter(t=>Math.hypot(t[0],t[2])>=1600);
  botany.scene.traverse(o=>{if(!o.isMesh)return;const rows=o.name.includes('near')?nearTrees:farTrees,geo=o.geometry.clone().applyMatrix4(o.matrixWorld),mat=o.material.clone();
    if(o.name.includes('needles')){mat.alphaTest=o.name.includes('near')?.18:.08;mat.transparent=false;mat.side=THREE.DoubleSide;mat.color.set(id==='altai'?0xd8ddbf:0xd0cca9);if(mat.map)mat.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy())}
    const trees=instances('Forest / '+o.name,geo,mat,rows);trees.receiveShadow=true;trees.castShadow=o.name.includes('near');
  });
  // Contact darkening under the foliage remains cheap even on mobile GPUs.
  const shadeCanvas=document.createElement('canvas');shadeCanvas.width=shadeCanvas.height=64;const ctx=shadeCanvas.getContext('2d'),shade=ctx.createRadialGradient(32,32,0,32,32,32);shade.addColorStop(0,'rgba(15,23,12,.35)');shade.addColorStop(1,'rgba(15,23,12,0)');ctx.fillStyle=shade;ctx.fillRect(0,0,64,64);
  const shadeGeo=new THREE.PlaneGeometry(15,15);shadeGeo.rotateX(-Math.PI/2);const shades=instances('Forest / soft ground contact',shadeGeo,new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadeCanvas),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),nearTrees.map(t=>[t[0],t[1]+.18,t[2],t[3],t[4]]));shades.renderOrder=1;
  const rockGeo=new THREE.IcosahedronGeometry(1,1),rp=rockGeo.attributes.position;
  for(let i=0;i<rp.count;i++){const x=rp.getX(i),y=rp.getY(i),z=rp.getZ(i),f=1+.18*Math.sin(x*7+z*11)*Math.cos(y*9);rp.setXYZ(i,x*f,y*f,z*f)}rockGeo.computeVertexNormals();
  const rocks=instances('Scree / fractured boulders',rockGeo,new THREE.MeshStandardMaterial({color:0x858071,map:rockMap.albedo,normalMap:rockMap.normal,normalScale:new THREE.Vector2(.5,.5),roughness:1,flatShading:true}),profile.rocks,[1,.58,.74],.25);rocks.receiveShadow=true;rocks.castShadow=true;
  const blades=[],bladeColours=[];
  for(let i=0;i<16;i++){const a=i*2.399,r=(i%4)*.14,x=Math.cos(a)*r,z=Math.sin(a)*r,h=.5+(i%5)*.18,w=.045,lean=.18;blades.push(x-w,0,z,x+w,0,z,x+Math.cos(a)*lean,h,z+Math.sin(a)*lean);for(let j=0;j<3;j++)bladeColours.push(.5+j*.12,.58+j*.09,.25+j*.05)}
  const grassGeo=new THREE.BufferGeometry();grassGeo.setAttribute('position',new THREE.Float32BufferAttribute(blades,3));grassGeo.setAttribute('color',new THREE.Float32BufferAttribute(bladeColours,3));grassGeo.computeVertexNormals();
  const grasses=instances('Meadow / tussocks',grassGeo,new THREE.MeshStandardMaterial({color:id==='altai'?0x84905b:0xaaa16c,vertexColors:true,side:THREE.DoubleSide,roughness:1}),profile.grass);grasses.receiveShadow=true;
  // Fit the shoreline to the same sampled triangles as the mountain mesh.
  const [lx,lz,rx,rz,level]=profile.lake,waterVertices=[lx,level,lz],waterFaces=[],shore=[];
  for(let i=0;i<128;i++){const a=i*Math.PI*2/128;let lo=0,hi=1.4;for(let j=0;j<16;j++){const m=(lo+hi)/2;if(heightAt(lx+Math.cos(a)*rx*m,lz+Math.sin(a)*rz*m)<level)lo=m;else hi=m}const x=lx+Math.cos(a)*rx*lo,z=lz+Math.sin(a)*rz*lo;waterVertices.push(x,level,z);shore.push([x,level,z,1,a]);waterFaces.push(0,(i+1)%128+1,i+1)}
  const waterGeo=new THREE.BufferGeometry();waterGeo.setAttribute('position',new THREE.Float32BufferAttribute(waterVertices,3));waterGeo.setIndex(waterFaces);waterGeo.computeVertexNormals();
  const waterTime={value:0},waterMat=new THREE.MeshStandardMaterial({color:id==='altai'?0x164348:0x376a69,metalness:.35,roughness:.22,side:THREE.DoubleSide});
  waterMat.onBeforeCompile=s=>{s.uniforms.lakeTime=waterTime;s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nuniform float lakeTime;').replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=normalize(normal+vec3(sin(vViewPosition.x*.21+lakeTime*.5)*.055,cos(vViewPosition.y*.23+lakeTime*.4)*.035,0.));')};
  const water=new THREE.Mesh(waterGeo,waterMat);water.name='Lake / fitted shoreline';group.add(water);
  // A simple sky environment supplies real PBR reflections to water and machinery.
  const envCanvas=document.createElement('canvas');envCanvas.width=256;envCanvas.height=128;const ec=envCanvas.getContext('2d'),gradient=ec.createLinearGradient(0,0,0,128);gradient.addColorStop(0,id==='altai'?'#1a345b':'#8ab3cd');gradient.addColorStop(.5,id==='altai'?'#72859b':'#e5e4d6');gradient.addColorStop(.53,id==='altai'?'#253b2c':'#787e60');gradient.addColorStop(1,'#242d25');ec.fillStyle=gradient;ec.fillRect(0,0,256,128);const env=new THREE.CanvasTexture(envCanvas);env.colorSpace=THREE.SRGBColorSpace;env.mapping=THREE.EquirectangularReflectionMapping;const pmrem=new THREE.PMREMGenerator(renderer);const envRT=pmrem.fromEquirectangular(env);scene.environment=envRT.texture;pmrem.dispose();env.dispose();
  const roadside=[];for(let i=0;i<profile.road.length;i+=3){const p=profile.road[i];if(p[0]>5200)break;const q=profile.road[Math.min(i+1,profile.road.length-1)],dx=q[1]-p[1],dz=q[3]-p[3],l=Math.hypot(dx,dz)||1;for(const side of [-1,1]){const x=p[1]-dz/l*10.4*side,z=p[3]+dx/l*10.4*side;roadside.push([x,heightAt(x,z)??168,z,1,Math.atan2(dx,dz)])}}
  const posts=instances('Road / delineator posts',new THREE.BoxGeometry(.25,1.6,.25),new THREE.MeshStandardMaterial({color:0xd9d3b8,roughness:.8}),roadside,[1,1,1],.8);posts.castShadow=true;
  instances('Road / amber reflectors',new THREE.BoxGeometry(.28,.18,.28),new THREE.MeshStandardMaterial({color:0xdd9b42,emissive:0xaa641b,emissiveIntensity:id==='altai'?.7:.1}),roadside,[1,1,1],1.4);
  // Parallel tyre wear adds scale to the existing haul road without moving it.
  if(route?.length){const tracks=[],indices=[];for(const offset of [-2.1,2.1]){const start=tracks.length/3;route.forEach((p,i)=>{const a=route[Math.max(0,i-1)],b=route[Math.min(route.length-1,i+1)],dx=b[1]-a[1],dz=b[3]-a[3],l=Math.hypot(dx,dz)||1;for(const width of [-.35,.35])tracks.push(p[1]-dz/l*(offset+width),p[2]+.065,p[3]+dx/l*(offset+width));if(i<route.length-1){const n=start+i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3)}})}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(tracks,3));geo.setIndex(indices);geo.computeVertexNormals();const wear=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0x574d3e,transparent:true,opacity:.17,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1}));wear.name='Haul road / tyre wear';group.add(wear)}
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  world.traverse(o=>{if(o.isMesh){o.receiveShadow=true;o.castShadow=true}});
  scene.traverse(o=>{if(o.isDirectionalLight&&o.position.x<0){o.castShadow=true;o.shadow.mapSize.set(2048,2048);Object.assign(o.shadow.camera,{left:-850,right:850,top:850,bottom:-850,near:20,far:4200});o.shadow.normalBias=1.2;o.shadow.bias=-.00015;o.shadow.camera.updateProjectionMatrix()}});
  if(id==='quarry'){scene.background=new THREE.Color(0xbdccd0);scene.fog=new THREE.FogExp2(0xbdccd0,.00011);scene.traverse(o=>{if(o.isHemisphereLight){o.intensity=1.55;o.color.set(0xd7e8f1);o.groundColor.set(0x6f7054)}else if(o.isDirectionalLight)o.intensity=o.position.x<0?2.4:.45});renderer.toneMappingExposure=1.03}
  const watercourse=createMountainWatercourse(THREE,group,profile,heightAt,id==='altai');
  scene.updateMatrixWorld(true);
  return {group,profile,heightAt,contain(camera,controls){const target=controls.target,next=target.clone();next.x=Math.max(-610,Math.min(610,next.x));next.z=Math.max(-530,Math.min(530,next.z));next.y=Math.max(0,Math.min(400,next.y));camera.position.add(next.clone().sub(target));target.copy(next)},guardCamera(camera){const y=heightAt(camera.position.x,camera.position.z);if(y!==null&&camera.position.y<y+24){camera.position.y=y+24;camera.updateMatrixWorld()}},update(time,camera){waterTime.value=time*.001;watercourse?.update(time);grasses.visible=camera.position.y<2100;shades.visible=camera.position.y<2100}};
}
