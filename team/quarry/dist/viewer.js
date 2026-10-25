import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createExcavatorInspection} from './excavator-inspection.js';

const container=document.querySelector('#canvas-container');
const loading=document.querySelector('#loader');
const status=document.querySelector('#model-status');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer,scene,camera,controls,model,transition=null;
let currentView='hero',inspection,truckInspection;
function updateInspection(){
  if(currentView!=='excavator')inspection.update(model,false);
  if(currentView!=='truck')truckInspection.update(model,false);
  if(currentView==='excavator')inspection.update(model,true);
  if(currentView==='truck')truckInspection.update(model,true);
}
const views={
  terrain:{position:[1040,1200,1310],target:[0,65,0],label:'РЕЛЬЕФ / ДОРОГИ И КАРМАНЫ'},
  hero:{position:[1130,1100,1380],target:[0,65,0],label:'ОБЩИЙ ВИД'},
  top:{position:[0,1900,1],target:[0,65,0],label:'ВИД СВЕРХУ'},
  plant:{position:[440,405,-80],target:[110,184,-365],label:'ПРОИЗВОДСТВЕННЫЙ КОМПЛЕКС'},
  floor:{position:[340,320,430],target:[-25,28,20],label:'ДНО КАРЬЕРА'},
  excavator:{position:[-18.95,7.63,49.18],target:[-26.2,2.4,36.7],label:'ЭКСКАВАТОР / ДЕТАЛЬНЫЙ ОСМОТР'},
  truck:{position:[-16,180,-337],target:[-31,171.4,-356],label:'САМОСВАЛ / ДЕТАЛЬНЫЙ ОСМОТР'}
};
function fail(error){console.error(error);loading.hidden=true;loading.style.display='none';document.querySelector('#error').hidden=false;status.textContent='3D НЕДОСТУПНО'}
try{
  renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(container.clientWidth,container.clientHeight);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  container.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','3D-модель: перетащите для вращения, используйте колесо для масштабирования');renderer.domElement.tabIndex=0;
  scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xeaf0f5,0x8e8272,2.2));
  const key=new THREE.DirectionalLight(0xfff7e9,2.6);key.position.set(-500,1100,650);scene.add(key);
  const fill=new THREE.DirectionalLight(0xe3ecf3,.9);fill.position.set(650,450,-600);scene.add(fill);
  inspection=createExcavatorInspection(renderer,scene);
  truckInspection=createExcavatorInspection(renderer,scene,{assetId:'TRUCK_04',panelId:'#truck-detail',className:'inspecting-truck'});
  camera=new THREE.PerspectiveCamera(39,container.clientWidth/container.clientHeight,1,10000);
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.09;controls.minDistance=80;controls.maxDistance=4000;controls.maxPolarAngle=Math.PI*.88;controls.autoRotateSpeed=.45;
  function adjusted(view){const p=new THREE.Vector3(...view.position),t=new THREE.Vector3(...view.target);if(camera.aspect<1.2&&(view===views.hero||view===views.terrain||view===views.excavator||view===views.truck))p.sub(t).multiplyScalar(1.2/Math.max(camera.aspect,.55)).add(t);return[p,t]}
  function setView(name,animate=true){
    currentView=name;
    const detail=name==='excavator'||name==='truck';
    controls.minDistance=detail?2:80;
    camera.near=detail?.05:1;camera.updateProjectionMatrix();
    updateInspection();
    document.querySelector('#terrain-detail').hidden=name!=='terrain';
    const view=views[name];const [p,t]=adjusted(view);
    if(animate&&!reduced)transition={from:camera.position.clone(),to:p,targetFrom:controls.target.clone(),targetTo:t,start:performance.now()};
    else{camera.position.copy(p);controls.target.copy(t);controls.update()}
    document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===name);b.setAttribute('aria-pressed',String(b.dataset.view===name))});
    const selected=document.querySelector('[data-view="'+name+'"]');
    selected.parentElement.scrollLeft=Math.max(0,selected.offsetLeft-(selected.parentElement.clientWidth-selected.clientWidth)/2);
    document.querySelector('.viewport-label').innerHTML='<span class="cross">+</span> ОБЪЕКТ 01 <span class="slash">/</span> '+view.label;
  }
  const requestedView=new URLSearchParams(location.search).get('view');
  setView(Object.hasOwn(views,requestedView)?requestedView:'terrain',false);
  if(currentView==='terrain')document.querySelectorAll('[data-layer]').forEach(input=>input.checked=false);
  if(currentView==='excavator')document.querySelector('#loader img').src='./assets/excavator-preview.png';
  if(currentView==='truck')document.querySelector('#loader img').src='./assets/truck-preview.png';
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  document.querySelector('#reset').addEventListener('click',()=>{controls.autoRotate=false;document.querySelector('#rotate').setAttribute('aria-pressed','false');setView('hero')});
  document.querySelector('#rotate').addEventListener('click',e=>{controls.autoRotate=!controls.autoRotate;e.currentTarget.setAttribute('aria-pressed',String(controls.autoRotate))});
  controls.addEventListener('start',()=>{transition=null});
  renderer.domElement.addEventListener('keydown',e=>{if(e.key==='Home'){e.preventDefault();setView('hero')}if(e.key==='+'||e.key==='='){camera.position.sub(controls.target).multiplyScalar(.9).add(controls.target)}if(e.key==='-'){camera.position.sub(controls.target).multiplyScalar(1.1).add(controls.target)}});
  const loader=new GLTFLoader();const draco=new DRACOLoader();draco.setDecoderPath('./vendor/three/examples/jsm/libs/draco/');loader.setDRACOLoader(draco);
  const layerObjects={plant:[],fleet:[],details:[]};
  loader.load('./assets/quarry-v4.glb',gltf=>{
    model=gltf.scene;scene.add(model);let triangles=0;
    model.traverse(o=>{
      if(o.isMesh){triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){for(const key of ['map','normalMap','roughnessMap'])if(m[key])m[key].anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8)}}
      const id=o.userData.asset_id;if(!id)return;
      if(/^(PLANT|CONV|STOCK|SITE_001)/.test(id))layerObjects.plant.push(o);
      else if(/^(TRUCK|EXCAVATOR)/.test(id))layerObjects.fleet.push(o);
      else if(/^(SITE_002|SITE_003|GEO_002)/.test(id))layerObjects.details.push(o);
    });
    const applyLayers=()=>document.querySelectorAll('[data-layer]').forEach(input=>layerObjects[input.dataset.layer].forEach(o=>o.visible=input.checked));
    document.querySelectorAll('[data-layer]').forEach(input=>input.addEventListener('change',applyLayers));applyLayers();
    loading.style.display='none';status.textContent='WEBGL · '+Math.round(triangles/1000)+' ТЫС. ТРЕУГОЛЬНИКОВ · PBR';
    let truck;model.traverse(o=>{if(o.userData.asset_id==='TRUCK_04')truck=o});
    if(truck){
      const bounds=new THREE.Box3().setFromObject(truck),center=bounds.getCenter(new THREE.Vector3());
      const distance=bounds.getSize(new THREE.Vector3()).length()*1.5;
      center.y-=.35;
      views.truck.target=center.toArray();
      views.truck.position=center.clone().add(new THREE.Vector3(1,.55,1.3).normalize().multiplyScalar(distance)).toArray();
    }
    setView(currentView,false);
    document.body.dataset.loaded='true';draco.dispose();
  },event=>{
    const percent=Math.min(100,Math.round(event.loaded/(event.total||23973548)*100));document.querySelector('#progress').textContent=percent+'%';document.querySelector('#progress-bar').style.width=percent+'%';
    if(percent===100)document.querySelector('#load-label').textContent='Подготавливаем сцену';
  },fail);
  new ResizeObserver(()=>{camera.aspect=container.clientWidth/container.clientHeight;camera.updateProjectionMatrix();renderer.setSize(container.clientWidth,container.clientHeight)}).observe(container);
  if(innerWidth<=650)document.querySelector('.instructions').textContent='Один палец — вращение · Два пальца — масштаб';
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();fail(new Error('WebGL context lost'))});
  function frame(time){
    requestAnimationFrame(frame);
    if(transition){const a=Math.min((time-transition.start)/800,1);const s=a*a*(3-2*a);camera.position.lerpVectors(transition.from,transition.to,s);controls.target.lerpVectors(transition.targetFrom,transition.targetTo,s);if(a===1)transition=null}
    controls.update();renderer.render(scene,camera);
  }
  requestAnimationFrame(frame);
}catch(error){fail(error)}
