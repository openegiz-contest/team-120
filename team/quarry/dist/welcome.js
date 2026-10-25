import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {createWhiteExcavatorIntro} from './white-excavator-intro.mjs?v=2';

const $=s=>document.querySelector(s);
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const whiteStudio=document.body.classList.contains('welcome-white');
let whiteIntro,whiteIntroPromise,whiteStartToken=0,whiteClockReady=false;
const draco=new DRACOLoader().setDecoderPath('./vendor/three/examples/jsm/libs/draco/');
const loader=new GLTFLoader().setDRACOLoader(draco);
const assets=new Map();
const loadModel=name=>{if(!assets.has(name))assets.set(name,loader.loadAsync(`./assets/${name}.glb`).catch(e=>{assets.delete(name);throw e}));return assets.get(name)};
let heroRender=()=>{},heroResize=()=>{},heroRunning=true,heroVisible=true,heroScene;
let introActive=false,introStart=0,introRenderer,introScene,introCamera,soil,bucket,rockField,dust,cutUniform;
let introReady=false,introFinished=false,halfWidth=10,soilFallback=$('.earth-fallback');
const rocks=[],dustMotes=[],carried=[];
let previous=performance.now(),heroTime=0;
const ease=t=>t*t*(3-2*t);
const clamp=t=>Math.max(0,Math.min(1,t));
let seed=91;
function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
function rendererFor(element,alpha=true){const r=new THREE.WebGLRenderer({antialias:true,alpha,powerPreference:'high-performance'});r.setPixelRatio(Math.min(devicePixelRatio,1.5));r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=1.1;element.append(r.domElement);return r}
function lighting(scene){scene.add(new THREE.HemisphereLight(0xe9e9d4,0x242119,2.1));const key=new THREE.DirectionalLight(0xffdfaf,4.2);key.position.set(-5,12,8);scene.add(key);const rim=new THREE.DirectionalLight(0xd3e6da,3);rim.position.set(8,8,-6);scene.add(rim);return key}
function mesh(geo,mat,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);parent.add(m);return m}
const textureLoader=new THREE.TextureLoader();
const soilMap=textureLoader.load('./assets/intro/soil-color.png');soilMap.colorSpace=THREE.SRGBColorSpace;soilMap.wrapS=soilMap.wrapT=THREE.RepeatWrapping;soilMap.repeat.set(3,3);
const soilNormal=textureLoader.load('./assets/intro/soil-normal.png');soilNormal.wrapS=soilNormal.wrapT=THREE.RepeatWrapping;soilNormal.repeat.set(3,3);

async function initHero(){
  const el=$('#machine-canvas'),r=rendererFor(el);r.shadowMap.enabled=true;r.shadowMap.type=THREE.PCFShadowMap;
  const scene=new THREE.Scene();heroScene=scene;
  const camera=new THREE.PerspectiveCamera(34,1,.1,100);camera.position.set(12,8.4,16);camera.lookAt(0,2,0);
  const key=lighting(scene);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-12;key.shadow.camera.right=12;key.shadow.camera.top=12;key.shadow.camera.bottom=-12;key.shadow.normalBias=.04;
  const groundMat=new THREE.MeshStandardMaterial({color:0x33382a,roughness:1,map:soilMap,normalMap:soilNormal,normalScale:new THREE.Vector2(.5,.5)});
  const groundGeo=new THREE.CylinderGeometry(7.1,7.7,.42,80,1);
  const ground=mesh(groundGeo,groundMat,scene,0,-.27,0);ground.receiveShadow=true;
  const shadow=mesh(new THREE.PlaneGeometry(70,70),new THREE.ShadowMaterial({opacity:.27}),scene,0,-.49,0);shadow.rotation.x=-Math.PI/2;shadow.receiveShadow=true;
  // Small pieces of blasted rock anchor the machinery to a physical surface.
  const stoneGeo=new THREE.DodecahedronGeometry(1,0),stoneMat=new THREE.MeshStandardMaterial({color:0x64604c,roughness:1});
  for(let i=0;i<80;i++){const angle=rand()*Math.PI*2,radius=4.9+rand()*2;const m=mesh(stoneGeo,stoneMat,scene,Math.cos(angle)*radius,rand()*.04,Math.sin(angle)*radius);const s=.04+rand()*.14;m.scale.set(s*1.5,s*.8,s);m.rotation.set(rand(),rand()*6,rand())}
  if(whiteStudio){
    ground.visible=false;shadow.position.y=-.015;shadow.material.opacity=.16;
    scene.children.filter(o=>o.geometry===stoneGeo).forEach(o=>o.visible=false);
    scene.children.filter(o=>o.isLight).forEach(o=>{o.color.set(0xffffff);if(o.isHemisphereLight){o.groundColor.set(0xa4a7ad);o.intensity=2.7}else o.intensity=o===key?3:1.4});
    r.shadowMap.type=THREE.PCFSoftShadowMap;key.shadow.radius=4;
  }
  const turntable=new THREE.Group();scene.add(turntable);
  let active,chosen='excavator',request=0,pointerX=0,pointerY=0;
  const descriptions={excavator:['Гидравлический экскаватор','Всё большое начинается с него.'],truck:['Карьерный самосвал','Каждый рейс приближает следующую покупку.']};
  async function choose(name){const token=++request;$('#model-status').textContent='Подготавливаем технику…';
    try{const gltf=await loadModel(name);if(token!==request)return;const group=gltf.scene.clone(true);const box=new THREE.Box3().setFromObject(group),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());const scale=10/Math.max(size.x,size.y,size.z);group.scale.setScalar(scale);group.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
      if(active)turntable.remove(active);active=group;turntable.add(group);chosen=name;turntable.rotation.y=name==='excavator'?-.36:.42;heroTime=0;
      $('#machine-poster').hidden=true;$('#model-status').textContent='';$('#model-name').firstChild.textContent=descriptions[name][0];$('#model-detail').textContent=descriptions[name][1];
      for(const b of document.querySelectorAll('[data-model]'))b.setAttribute('aria-pressed',String(b.dataset.model===name));
    }catch(e){console.error(e);$('#model-status').textContent='3D не загрузилась. Можно повторить выбор модели.'}
  }
  for(const b of document.querySelectorAll('[data-model]'))b.onclick=()=>choose(b.dataset.model);
  const toggle=$('#model-motion');heroRunning=!motion.matches;
  function syncMotion(){toggle.setAttribute('aria-pressed',String(heroRunning));toggle.textContent=heroRunning?'Ⅱ':'▷';toggle.setAttribute('aria-label',heroRunning?'Остановить вращение модели':'Включить вращение модели')}
  toggle.onclick=()=>{heroRunning=!heroRunning;syncMotion()};syncMotion();
  motion.addEventListener('change',()=>{heroRunning=!motion.matches;syncMotion();if(motion.matches&&introActive)finishIntro(false)});
  el.addEventListener('pointermove',e=>{if(e.pointerType==='touch'||motion.matches)return;const b=el.getBoundingClientRect();pointerX=(e.clientX-b.left)/b.width-.5;pointerY=(e.clientY-b.top)/b.height-.5});el.addEventListener('pointerleave',()=>{pointerX=pointerY=0});
  heroResize=()=>{const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;r.setSize(w,h);camera.aspect=w/h;camera.position.set(12,8.4,16).multiplyScalar(camera.aspect<1.1?1.22:1);camera.updateProjectionMatrix();camera.lookAt(0,1.9,0)};new ResizeObserver(heroResize).observe(el);heroResize();
  new IntersectionObserver(entries=>{heroVisible=entries[0].isIntersecting},{rootMargin:'150px'}).observe(el);
  r.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();heroVisible=false;$('#machine-poster').hidden=false;$('#model-status').textContent='3D приостановлена. Обновите страницу для повторного запуска.'});
  heroRender=dt=>{if(!heroVisible)return;if(heroRunning&&!motion.matches)heroTime+=dt;const base=chosen==='excavator'?-.36:.42;turntable.rotation.y=THREE.MathUtils.lerp(turntable.rotation.y,base+Math.sin(heroTime*.18)*.23+(motion.matches?0:pointerX*.16),.04);turntable.rotation.x=THREE.MathUtils.lerp(turntable.rotation.x,motion.matches?0:pointerY*.025,.04);r.render(scene,camera)};
  await choose('excavator');
}

function buildBucket(){
  // A separate cinematic scoop: open curved shell, reinforcing ribs, replaceable teeth.
  const root=new THREE.Group(),scoop=new THREE.Group();root.add(scoop);root.userData.scoop=scoop;
  const steel=new THREE.MeshStandardMaterial({color:0x535753,roughness:.4,metalness:.82});
  const paint=new THREE.MeshStandardMaterial({color:0xd77829,roughness:.39,metalness:.45});
  const wear=new THREE.MeshStandardMaterial({color:0xa4a49a,roughness:.29,metalness:.88});
  const dark=new THREE.MeshStandardMaterial({color:0x212822,roughness:.55,metalness:.7});
  // Scoop profile in Y/Z, mouth points down the screen, soil gathers on its concave bed.
  const profile=[[-.42,.10],[-.08,.03],[.34,.13],[.77,.44],[1.06,.96],[1.13,1.55]];
  const verts=[],indices=[];const width=7.9;
  for(const [y,z] of profile)verts.push(-width/2,y,z,width/2,y,z);
  for(let i=0;i<profile.length-1;i++){let k=i*2;indices.push(k,k+1,k+3,k,k+3,k+2)}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setIndex(indices);geo.computeVertexNormals();
  const shell=mesh(geo,steel.clone(),scoop);shell.material.side=THREE.DoubleSide;
  const sideShape=new THREE.Shape();sideShape.moveTo(profile[0][0],profile[0][1]);for(const p of profile.slice(1))sideShape.lineTo(...p);sideShape.lineTo(1.25,1.57);sideShape.lineTo(1.24,.12);sideShape.lineTo(-.42,-.08);sideShape.closePath();
  const sideGeo=new THREE.ExtrudeGeometry(sideShape,{depth:.14,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:2,steps:1});
  // Shape XY -> world YZ; extrusion thickness lies along world X.
  sideGeo.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0)));
  mesh(sideGeo,paint,scoop,-width/2-.1);mesh(sideGeo,paint,scoop,width/2-.04);
  mesh(new THREE.BoxGeometry(width,.22,.18),wear,scoop,0,-.35,.08);
  for(let i=0;i<9;i++){
    const x=-width/2+.35+i*(width-.7)/8;
    const tooth=new THREE.CylinderGeometry(.11,.24,.67,4,1);const m=mesh(tooth,wear,scoop,x,-.76,.12);m.rotation.z=Math.PI;
    for(const z of [.2,.9]){const bolt=mesh(new THREE.CylinderGeometry(.08,.08,.07,6),dark,scoop,x,.75,z);bolt.rotation.x=Math.PI/2}
    mesh(new THREE.BoxGeometry(.08,.75,.08),wear,scoop,x,.45,.23).rotation.x=.5;
  }
  const arm=new THREE.Group();root.add(arm);
  mesh(new THREE.BoxGeometry(1.05,10,.7),paint,arm,0,5.9,.12);
  mesh(new THREE.BoxGeometry(.32,9,.3),dark,arm,0,6,.55);
  mesh(new THREE.CylinderGeometry(.17,.17,6,16),wear,arm,0,5,.78);
  mesh(new THREE.CylinderGeometry(.3,.3,3.2,20),paint,arm,0,8,.78);
  mesh(new THREE.BoxGeometry(1.55,.4,.72),paint,arm,0,1.5,.25);
  const hinge=mesh(new THREE.CylinderGeometry(.32,.32,1.8,24),steel,arm,0,1.25,.6);hinge.rotation.z=Math.PI/2;
  root.userData.arm=arm;
  const cargoMat=new THREE.MeshStandardMaterial({color:0x65503a,roughness:1,map:soilMap}),cargoGeo=new THREE.DodecahedronGeometry(1,0);
  for(let i=0;i<85;i++){const m=mesh(cargoGeo,cargoMat,scoop,(rand()-.5)*7.1,rand()*.8,.25+rand()*.35);const s=.10+rand()*.22;m.scale.set(s*1.2,s,s);m.rotation.set(rand()*5,rand()*5,rand()*5);carried.push(m)}
  return root;
}
function initIntro(){
  if(introReady)return;
  introRenderer=rendererFor($('#intro-canvas'));introRenderer.setClearColor(0x000000,0);
  introScene=new THREE.Scene();introCamera=new THREE.OrthographicCamera(-10,10,6,-6,.1,100);introCamera.position.set(0,0,30);
  introScene.add(new THREE.AmbientLight(0xe5d6bb,1.6));const l=new THREE.DirectionalLight(0xffd9a3,4);l.position.set(-6,8,14);introScene.add(l);const rim=new THREE.DirectionalLight(0xd5e7ef,1.2);rim.position.set(8,-4,5);introScene.add(rim);
  const mat=new THREE.MeshStandardMaterial({color:0x806347,map:soilMap,normalMap:soilNormal,normalScale:new THREE.Vector2(1.2,1.2),roughness:1});cutUniform={value:20};
  mat.onBeforeCompile=shader=>{shader.uniforms.cutY=cutUniform;shader.vertexShader='varying vec3 vSoilPosition;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSoilPosition=position;');shader.fragmentShader='varying vec3 vSoilPosition; uniform float cutY;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfloat edgeNoise=sin(vSoilPosition.x*17.0)*0.035+sin(vSoilPosition.x*7.3)*0.075; if(vSoilPosition.y>cutY+edgeNoise) discard;');};
  soil=mesh(new THREE.PlaneGeometry(50,16,180,70),mat,introScene,0,0,-.4);const p=soil.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);p.setZ(i,Math.sin(x*3+y*2)*.045+Math.sin(x*8-y*9)*.02+rand()*.06)}p.needsUpdate=true;soil.geometry.computeVertexNormals();
  rockField=new THREE.Group();introScene.add(rockField);const rockGeo=new THREE.DodecahedronGeometry(1,0);
  const rockMats=[0x645442,0x7d7058,0x514937,0x95826b].map(color=>new THREE.MeshStandardMaterial({color,roughness:1}));
  for(let i=0;i<680;i++){const m=mesh(rockGeo,rockMats[i%4],rockField,(rand()-.5)*48,(rand()-.5)*14,-.12);const s=.035+Math.pow(rand(),3)*.23;m.scale.set(s*(.6+rand()),s,s*.7);m.rotation.set(rand()*5,rand()*5,rand()*5);rocks.push({mesh:m,x:m.position.x,y:m.position.y,z:m.position.z,s,k:rand()})}
  bucket=buildBucket();introScene.add(bucket);
  dust=new THREE.Group();introScene.add(dust);const dustGeo=new THREE.IcosahedronGeometry(.08,0),dustMat=new THREE.MeshStandardMaterial({color:0xa78e64,transparent:true,opacity:.65,roughness:1});
  for(let i=0;i<85;i++){const m=mesh(dustGeo,dustMat,dust);dustMotes.push({mesh:m,k:rand(),x:rand()*2-1,s:rand()});}
  introRenderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();finishIntro(false)});
  introReady=true;resizeIntro();
}
function resizeIntro(){if(whiteStudio){whiteIntro?.resize();return}if(!introReady)return;const w=innerWidth,h=innerHeight;halfWidth=w/h*6;introCamera.left=-halfWidth;introCamera.right=halfWidth;introCamera.updateProjectionMatrix();introRenderer.setSize(w,h);const scale=(2*halfWidth+1.2)/7.9;bucket.scale.set(scale,Math.min(1.65,scale),Math.min(1.4,scale));}
function finishIntro(focus=true){whiteStartToken++;whiteClockReady=false;introActive=false;introFinished=true;clearTimeout(window.quarryIntroWatchdog);window.quarryDismissIntro();$('#earth-intro').style.opacity='';if(focus)$('#replay').focus({preventScroll:true});}
async function startWhiteIntro(){
  const token=++whiteStartToken,overlay=$('#earth-intro');
  introActive=true;introFinished=false;whiteClockReady=false;overlay.hidden=false;overlay.style.opacity='1';
  overlay.dataset.phase='blank';$('#site').inert=true;soilFallback.hidden=false;
  document.body.classList.remove('intro-revealing');document.body.classList.add('intro-active');
  $('#skip-intro').focus({preventScroll:true});clearTimeout(window.quarryIntroWatchdog);
  window.quarryIntroWatchdog=setTimeout(()=>finishIntro(false),22000);
  try{
    whiteIntroPromise||=createWhiteExcavatorIntro({element:$('#intro-canvas'),loadModel,onContextLost:()=>finishIntro(false)}).catch(error=>{whiteIntroPromise=null;throw error});
    whiteIntro=await whiteIntroPromise;if(token!==whiteStartToken||overlay.hidden)return;
    whiteIntro.resize();whiteIntro.reset();introStart=performance.now();whiteClockReady=true;soilFallback.hidden=true;
  }catch(error){console.error(error);finishIntro(false)}
}
function startIntro(){
  if(motion.matches){finishIntro(false);return}
  if(whiteStudio){startWhiteIntro();return}
  try{initIntro()}catch(e){console.error(e);finishIntro(false);return}
  introFinished=false;introActive=true;introStart=performance.now();$('#earth-intro').hidden=false;$('#site').inert=true;document.body.classList.remove('intro-revealing');document.body.classList.add('intro-active');soilFallback.hidden=false;$('#skip-intro').focus({preventScroll:true});
  clearTimeout(window.quarryIntroWatchdog);window.quarryIntroWatchdog=setTimeout(()=>finishIntro(false),11000);
}
function renderIntro(time){
  if(!introActive)return;
  if(whiteStudio){
    if(!whiteClockReady)return;
    const pose=whiteIntro.render((time-introStart)/1000),overlay=$('#earth-intro');
    overlay.dataset.phase=pose.phase;overlay.style.opacity=String(1-pose.fade);
    $('#intro-percent').textContent=String(Math.round(pose.progress*100)).padStart(2,'0');$('#intro-progress').style.width=pose.progress*100+'%';
    $('#intro-label').textContent=pose.phase==='arrive'?'Большое начинается с малого.':pose.phase==='lower'||pose.phase==='dig'?'Первый ковш. Первый шаг.':'Ваш карьер начинается здесь.';
    if(pose.phase==='reveal')document.body.classList.add('intro-revealing');
    if(pose.done)finishIntro(false);return;
  }
  // 6.2 seconds. The teeth lead the cut; debris follows the shovel, revealing the live page.
  const t=(time-introStart)/1000,p=clamp((t-.65)/4.6),s=ease(p),edge=8.6-18.2*s;
  cutUniform.value=t<.65?20:edge+.10;
  bucket.position.set(Math.sin(s*Math.PI)*.22,edge+.78,1.6);
  bucket.rotation.x=s>.84?-(s-.84)*2.1:0;
  bucket.rotation.z=Math.sin(s*Math.PI)*-.025;
  for(const [i,r] of rocks.entries()){const delta=r.y-edge;if(delta>0){const fall=clamp(delta/4);r.mesh.visible=delta<2.2;r.mesh.position.set(r.x+(r.k-.5)*fall*.7,edge+delta*.12,-.1+Math.sin(fall*Math.PI)*1.5);r.mesh.rotation.x=r.k*5+s*10;r.mesh.scale.setScalar(r.s*(1-fall*.3))}else{r.mesh.visible=true;r.mesh.position.set(r.x,r.y,r.z);r.mesh.scale.set(r.s*(.6+r.k),r.s,r.s*.7)}}
  carried.forEach((m,i)=>{m.visible=s>.05&&i<Math.min(85,s*140);m.rotation.x+=.006});
  dustMotes.forEach((d,i)=>{const life=(t*1.2+d.k)%1;d.mesh.visible=p>.03&&p<.98;d.mesh.position.set(d.x*halfWidth,edge+.2+life*1.7,1+Math.sin(life*Math.PI)*1.7);d.mesh.scale.setScalar((1-life)*(1+d.s*2));d.mesh.rotation.x=t+d.k});
  $('#intro-percent').textContent=String(Math.min(100,Math.round(clamp(t/6.2)*100))).padStart(2,'0');$('#intro-progress').style.width=clamp(t/6.2)*100+'%';
  introRenderer.render(introScene,introCamera);soilFallback.hidden=true;
  // Background opacity is restored as soon as the first soil is removed.
  if(p>.15)document.body.classList.add('intro-revealing');
  if(t>=6.2)finishIntro(false);
}
$('#replay').hidden=false;$('#replay').onclick=()=>{if(motion.matches){$('#model-status').textContent='Вступление отключено настройкой «Уменьшение движения».';return}window.scrollTo({top:0,behavior:'instant'});startIntro()};
$('#skip-intro').onclick=()=>finishIntro(true);
window.addEventListener('keydown',e=>{if(!introActive)return;if(e.key==='Escape'){finishIntro(true);return}if(e.key==='Tab'){e.preventDefault();$('#skip-intro').focus()}});
window.addEventListener('resize',resizeIntro);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&introActive)finishIntro(false);previous=performance.now()});
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-previous)/1000);previous=now;if(document.hidden)return;if(!whiteStudio||!introActive)heroRender(dt);if(!$('#earth-intro').hidden)renderIntro(now);else if(introActive)introActive=false;}
initHero().catch(e=>{console.error(e);$('#model-status').textContent='Показываем превью. Открыть интерактивную модель можно в разделе «Исследовать карьер».';for(const b of document.querySelectorAll('[data-model],#model-motion'))b.disabled=true});
if(window.quarryIntroRequested&&!$('#earth-intro').hidden)startIntro();
requestAnimationFrame(frame);
