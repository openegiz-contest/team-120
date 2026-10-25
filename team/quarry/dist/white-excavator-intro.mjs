import * as THREE from './vendor/three/build/three.module.js';
import {createExcavatorRig} from './excavator-rig.mjs';
import {createCrawlerRunningGear} from './running-gear.mjs';
import {introPose} from './intro-choreography.mjs';

// Independent cinematic scene: it only rigs a clone, never a game asset.
export async function createWhiteExcavatorIntro({element,loadModel,onContextLost}){
  const gltf=await loadModel('excavator');
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xffffff);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden','true');element.append(renderer.domElement);
  const camera=new THREE.OrthographicCamera(-9,9,6,-6,.1,150);
  camera.position.set(9,7,20);camera.lookAt(.8,1.8,0);
  scene.add(new THREE.HemisphereLight(0xffffff,0xa4a7ad,2.7));
  const key=new THREE.DirectionalLight(0xfff5e9,3.0);key.position.set(-3,10,7);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-30,right:16,top:14,bottom:-14,near:.5,far:60});
  key.shadow.normalBias=.025;key.shadow.bias=-.00015;key.shadow.radius=4;scene.add(key);
  const rim=new THREE.DirectionalLight(0xe4edff,1.4);rim.position.set(5,6,-8);scene.add(rim);
  const machine=gltf.scene.clone(true);scene.add(machine);
  let root;machine.traverse(o=>{if(o.userData.asset_type==='hydraulic_excavator')root=o});
  if(!root)throw new Error('Excavator rig root missing');
  const rig=createExcavatorRig(root),gear=createCrawlerRunningGear(root);
  machine.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
  const cut={value:0},centre=new THREE.Vector2(3.8,-.36);
  // A cut-out in the shadow catcher exposes a shallow, closed excavation below it.
  const floorMat=new THREE.ShadowMaterial({opacity:.14});
  floorMat.onBeforeCompile=shader=>{
    shader.uniforms.whiteCut=cut;shader.uniforms.cutCentre={value:centre};
    shader.vertexShader='varying vec2 floorXZ;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloorXZ=(modelMatrix*vec4(position,1.0)).xz;');
    shader.fragmentShader='varying vec2 floorXZ; uniform float whiteCut; uniform vec2 cutCentre;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nvec2 q=(floorXZ-cutCentre)/vec2(1.45,0.91); float edge=1.0+sin(atan(q.y,q.x)*9.0)*0.035; if(length(q)<whiteCut*edge) discard;');
  };
  const floorGeo=new THREE.PlaneGeometry(180,180);
  const whiteGround=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});
  whiteGround.onBeforeCompile=floorMat.onBeforeCompile;
  const ground=new THREE.Mesh(floorGeo,whiteGround);ground.rotation.x=-Math.PI/2;scene.add(ground);
  const floor=new THREE.Mesh(floorGeo,floorMat);floor.rotation.x=-Math.PI/2;floor.position.y=.004;floor.receiveShadow=true;scene.add(floor);
  const pitGroup=new THREE.Group();pitGroup.position.set(centre.x,0,centre.y);scene.add(pitGroup);
  const positions=[0,-.53,0],indices=[],segments=64;
  for(let ring=0;ring<3;ring++)for(let i=0;i<segments;i++){
    const a=i/segments*Math.PI*2,r=[.32,.82,1][ring]*(1+Math.sin(a*9)*.035);
    positions.push(Math.cos(a)*r*1.45,[-.5,-.31,.003][ring],Math.sin(a)*r*.91);
  }
  for(let i=0;i<segments;i++){
    const j=(i+1)%segments;indices.push(0,1+j,1+i);
    for(let r=0;r<2;r++){const a=1+r*segments+i,b=1+r*segments+j,c=a+segments,d=b+segments;indices.push(a,b,d,a,d,c)}
  }
  const pitGeo=new THREE.BufferGeometry();pitGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));pitGeo.setIndex(indices);pitGeo.computeVertexNormals();
  const plaster=new THREE.MeshStandardMaterial({color:0xf3f1ed,roughness:1,side:THREE.DoubleSide});
  const pit=new THREE.Mesh(pitGeo,plaster);pit.receiveShadow=true;pitGroup.add(pit);
  const chipGeo=new THREE.DodecahedronGeometry(1,0),chips=[];
  for(let i=0;i<34;i++){
    const chip=new THREE.Mesh(chipGeo,plaster);chip.castShadow=true;chip.receiveShadow=true;scene.add(chip);
    chips.push({mesh:chip,angle:i*2.399963,radius:.9+(i%7)*.13,size:.055+(i%5)*.021,delay:(i%6)*.045});
  }
  const fill=new THREE.Group();rig.frames.bucket.add(fill);
  for(let i=0;i<15;i++){
    const chip=new THREE.Mesh(chipGeo,plaster);chip.position.set(-.35-(i%5)*.23,-.32+Math.floor(i/5)*.10,(i%3-1)*.25);chip.scale.set(.17,.13,.19);chip.rotation.set(i,.2*i,.4*i);chip.castShadow=true;fill.add(chip);
  }
  let previousX=null,lastPose=null,entryX=-23;
  function resize(){
    const w=element.clientWidth||innerWidth,h=element.clientHeight||innerHeight,aspect=w/h;
    const halfW=aspect<.75?6.25:Math.max(7.4,5.6*aspect);
    camera.left=-halfW;camera.right=halfW;camera.top=halfW/aspect;camera.bottom=-halfW/aspect;
    camera.updateProjectionMatrix();renderer.setSize(w,h);
    entryX=-halfW/Math.cos(Math.atan2(8.2,20))-12;
  }
  function render(time){
    const pose=introPose(time,entryX);machine.position.x=pose.x;
    const target={boom:pose.boom,stick:pose.stick,bucket:pose.bucket};
    if(!lastPose||Object.keys(target).some(k=>Math.abs(target[k]-lastPose[k])>1e-6)){
      rig.step(1,Object.fromEntries(Object.entries(target).map(([k,v])=>[k,(v-rig.state[k])/.38])),()=>-100);
    }
    if(previousX!==null&&Math.abs(pose.x-previousX)>1e-7)gear.step(pose.x-previousX,0);
    previousX=pose.x;lastPose=pose;
    machine.visible=pose.phase!=='blank';cut.value=pose.cut;
    pitGroup.visible=pose.cut>.001;pitGroup.scale.set(pose.cut,1,pose.cut);
    fill.visible=time>6.85;
    for(const c of chips){
      const age=time-5.7-c.delay;c.mesh.visible=age>0;
      const k=Math.min(1,Math.max(0,age/.75)),r=c.radius*(.35+.65*k);
      c.mesh.position.set(centre.x+Math.cos(c.angle)*r*1.4,.04+Math.sin(k*Math.PI)*(.22+c.size),centre.y+Math.sin(c.angle)*r*.95);
      c.mesh.scale.setScalar(c.size*Math.min(1,Math.max(0,age*8)));c.mesh.rotation.set(c.angle+k*2,c.angle,age<.75?k:1);
    }
    renderer.render(scene,camera);return pose;
  }
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();onContextLost()});
  resize();render(0);
  return {render,resize,reset(){previousX=null;lastPose=null;render(0)}};
}
