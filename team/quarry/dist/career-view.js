import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {buildGraph,STATES} from './dispatch-core.mjs';
import {CareerSimulation,ECONOMY} from './career-core.mjs';
import {addQuarryLandscape,configureLandscapeCamera,containLandscapeCamera,createQuarryCameraGuard} from './quarry-landscape.mjs';
import {loadQuarrySurfaceMaps,applyQuarrySurfaceMaterials} from './quarry-materials.mjs';
import {createManualControls} from './manual-controls.mjs?v=stockpiles-1';
import {createTruckRunningGear} from './running-gear.mjs?v=2';
import {createMineRide} from './mine-ride.mjs?v=network-1';
import {createQuarryMineConnection} from './quarry-mine-connection.mjs?v=network-1';
import {resolveQuarryMap,mountQuarryMaps} from './quarry-maps.mjs?v=rudny-1';
import {installRudnyTerrain,styleRudnyMaterials,loadRudnyLandscape,rudnyOverview,RUDNY_MAPS} from './rudny-maps.mjs?v=rudny-1';
import {createAltaiEnvironment} from './altai-environment.mjs?v=mountains-1';
import {loadMountainLandscape,mountainOverview,mountainSceneryView} from './mountain-landscape.mjs?v=relief-2';

const activeMap=resolveQuarryMap(location.pathname);mountQuarryMaps(document,activeMap);
const $=s=>document.querySelector(s),SAVE_KEY=activeMap.saveKey;
const deliveriesText=n=>n+' '+(n%100>=11&&n%100<=14?'доставок':n%10===1?'доставка':n%10>=2&&n%10<=4?'доставки':'доставок');
const activeStages=['loading','first-trip','second-trip','expanding','complete'];
const copy={
  welcome:[1,'Начнём с погрузки','У вас один самосвал и один экскаватор. Загрузим руду внизу, отвезём её наверх и получим первые деньги.','Загрузить первый самосвал →'],
  loading:[1,'Экскаватор загружает руду','Погрузка занимает 8 секунд. Посмотрите, как наполняется кузов. После этого отправим машину наверх.','Идёт погрузка…'],
  haul:[2,'Кузов полный. Везём наверх!','Самосвал загрузил 100 тонн руды. Отправьте его к дробилке — за разгрузку получите 100 монет.','Отвезти руду и заработать →'],
  'first-trip':[2,'Первый рейс начался','Самосвал сам поднимается по дороге. Деньги появятся после разгрузки наверху. Можно ускорить время кнопкой ×2.','Машина в пути…'],
  'first-reward':[3,'Первая сотня — ваша!','Вы получили 100 монет. Сделаем ещё одну доставку: на счету будет 200 — хватит на второй самосвал.','Сделать ещё одну доставку →'],
  'second-trip':[3,'Ещё один рейс до покупки','Самосвал вернётся к экскаватору, загрузится и снова поднимется наверх. Все эти действия уже выполняются автоматически.','Копим на второй самосвал…'],
  'buy-truck':[4,'Можно купить второй самосвал','Две доставки принесли 200 монет. Купите вторую машину: теперь сразу два самосвала будут возить руду и приносить деньги.','Купить самосвал · 200 монет'],
  'fleet-ready':[4,'Теперь работают две машины','Новый самосвал отправится за рудой. Они ездят одновременно и сами пропускают друг друга в карманах. Следующая цель — второй экскаватор.','Запустить обе машины →'],
  expanding:[5,'Копим на второй экскаватор','Он стоит 500 монет — доход с пяти доставок. Две машины заработают их быстрее. Вы можете наблюдать или ускорить время.','Машины зарабатывают…'],
  'buy-excavator':[5,'Ускорим погрузку вдвое','Вы накопили 500 монет. Второй экскаватор сократит погрузку с 8 до 4 секунд и откроет второе место загрузки.','Купить экскаватор · 500 монет'],
  complete:[5,'Карьер работает на вас','Обучение пройдено. Копите деньги и расширяйте парк до четырёх самосвалов. Все рейсы выполняются автоматически.','Карьер работает…']
};
let graph,sim,renderer,scene,camera,controls,truckAsset,excavatorAsset,secondExcavator,selected='T1',following=true,speed=1,previous=0,uiAt=0,saveAt=0,lastRevision=-1,storageOK=true,helpResume=false;
const vehicles=new Map(),rows=new Map(),pins=[];
const autoRunningGear=new Map();
let guardQuarryCamera=()=>{};
let manual=null,manualWasPaused=true;
let mine=null,mineWasPaused=true,mineWasFollowing=true,mineControlsEnabled=true;
let mineConnection=null;
let mapEnvironment=null;
let mountainWorld=null;
const matrix=new THREE.Matrix4(),up=new THREE.Vector3(0,1,0),projected=new THREE.Vector3();
const cargoGeo=new THREE.BoxGeometry(4.5,.8,4.1),cargoMat=new THREE.MeshStandardMaterial({color:0x6c5a43,roughness:1});
function save(){if(!sim)return;try{localStorage.setItem(SAVE_KEY,JSON.stringify(sim.snapshot()));storageOK=true}catch{storageOK=false}$('#save-status').textContent=storageOK?'✓ Прогресс сохранён на этом устройстве.':'Браузер не разрешил сохранение. Не закрывайте страницу, чтобы сохранить текущую игру.';lastRevision=sim.revision}
function cameraOverview(){following=false;controls.target.set(0,85,0);camera.position.set(900,1100,1100);if(camera.aspect<1)camera.position.sub(controls.target).multiplyScalar(1.15/Math.max(.6,camera.aspect)).add(controls.target);controls.update();if(activeMap.id==='altai'){controls.target.set(-100,180,-100);camera.position.set(1500,1050,1800);camera.fov=64;camera.updateProjectionMatrix();if(camera.aspect<1)camera.position.sub(controls.target).multiplyScalar(1.1/Math.max(.65,camera.aspect)).add(controls.target);controls.update()}if(mountainWorld){const view=activeMap.rudny?rudnyOverview(activeMap.id,camera.aspect):mountainOverview(camera.aspect);controls.target.fromArray(view.target);camera.position.fromArray(view.position);camera.fov=view.fov;camera.updateProjectionMatrix();controls.update()}}
function addPin(text,position,truckId=null){const b=document.createElement('button');b.className='map-pin'+(truckId?' truck':'');b.textContent=text;if(truckId){b.setAttribute('aria-label','Показать самосвал '+truckId);b.onclick=()=>{selected=truckId;following=true;updateUI()}}else{b.tabIndex=-1;b.style.pointerEvents='none'}$('#labels').append(b);pins.push({button:b,position,truckId})}
function addVehicle(t){const group=new THREE.Group();group.add(truckAsset.clone(true));const cargo=new THREE.Mesh(cargoGeo,cargoMat);cargo.name='Truck cargo';cargo.position.set(-1.7,3.7,0);group.add(cargo);scene.add(group);vehicles.set(t.id,{group,cargo});addPin(t.id,null,t.id);
  const row=document.createElement('button');row.className='truck-row';row.innerHTML='<b>'+t.id+'</b><div><strong></strong><small></small></div>';row.onclick=()=>{selected=t.id;following=true;updateUI()};$('#fleet').append(row);rows.set(t.id,row);
}
function syncAssets(){for(const t of sim.trucks)if(!vehicles.has(t.id))addVehicle(t);if(sim.excavators===2&&!secondExcavator){secondExcavator=excavatorAsset.clone(true);secondExcavator.position.z-=39;scene.add(secondExcavator)}}
function buy(kind){if(sim.buy(kind)){syncAssets();if(kind==='truck'){following=false;cameraOverview()}save();updateUI()}}
function next(){if(sim.stage==='buy-truck')buy('truck');else if(sim.stage==='buy-excavator')buy('excavator');else if(!sim.tutorialAction()&&sim.paused){sim.paused=false;sim.accumulator=0}save();updateUI()}
function updateUI(){if(!sim)return;const c=copy[sim.stage];$('#money').textContent=sim.wallet;$('#delivery-count').textContent=deliveriesText(sim.deliveries);$('#fleet-summary').textContent=`Самосвалы: ${sim.trucks.length} · Экскаваторы: ${sim.excavators}`;$('#world-chapter').textContent=sim.trucks.length===1?'ПЕРВЫЙ ДЕНЬ':'РАЗВИВАЕМ КАРЬЕР';$('.world-title h1').innerHTML=sim.trucks.length===1?'Большое дело<br>с одной машины<span>.</span>':'Ваш карьер<br>набирает обороты<span>.</span>';
  if(activeMap.id==='altai'){$('#world-chapter').textContent='ОТДЕЛЬНАЯ КАРТА / ГОРНАЯ ТАЙГА';$('.world-title h1').innerHTML='Алтай<span>.</span><small>НОЧНАЯ СМЕНА</small>'}
  if(activeMap.rudny){$('#world-chapter').textContent='РУДНЫЙ / ИГРОВАЯ ИНТЕРПРЕТАЦИЯ';$('.world-title h1').innerHTML=activeMap.title+'<span>.</span><small class="rudny-caption">'+RUDNY_MAPS[activeMap.id].description+'</small>'}
  $('#step-tag').textContent=sim.stage==='complete'?'СВОБОДНАЯ ИГРА':`ОБУЧЕНИЕ · ШАГ ${c[0]} ИЗ 5`;$('#guide-title').textContent=c[1];$('#guide-copy').textContent=c[2];$('#next').textContent=activeStages.includes(sim.stage)&&sim.paused?'Продолжить работу →':c[3];$('#next').disabled=activeStages.includes(sim.stage)&&!sim.paused;$('#skip').hidden=sim.stage==='complete';
  $('#pause').disabled=!activeStages.includes(sim.stage)||sim.status==='ready';$('#pause').textContent=sim.paused?'▶ Продолжить':'Ⅱ Пауза';$('#speed').textContent='×'+speed;$('#speed').classList.toggle('active',speed===2);
  $('#guide-note').textContent=sim.stage==='complete'?'Доход начисляется только за доставленную наверх руду.':sim.paused&&activeStages.includes(sim.stage)?'Игра на паузе. Деньги и техника сохранены.':'Без спешки: таймера и штрафов здесь нет.';
  for(const [id,stages] of [['load',['welcome','loading']],['haul',['haul','first-trip','second-trip']],['money',['first-reward','buy-truck','fleet-ready','expanding','buy-excavator','complete']]])$('#journey-'+id).classList.toggle('active',stages.includes(sim.stage));
  for(const t of sim.trucks){const row=rows.get(t.id);row.classList.toggle('loaded',t.full);row.classList.toggle('selected',selected===t.id);const status={IDLE:t.full?'Руда загружена':'Готов к рейсу',MOVING_EMPTY:'Возвращается за рудой',MOVING_FULL:'Везёт руду на продажу',LOADING:'Загрузка · '+Math.ceil(t.serviceTime)+' с',UNLOADING:'Разгрузка · '+Math.ceil(t.serviceTime)+' с',WAITING:'Пропускает машину / ждёт очередь'}[t.state];row.querySelector('strong').textContent=status;row.querySelector('small').textContent=t.full?'В кузове 100 т · доход +100 монет':`Пустой кузов · доставок: ${t.trips}`}
  for(const kind of ['truck','excavator']){const owned=kind==='truck'?sim.trucks.length:sim.excavators,max=kind==='truck'?4:2,cost=ECONOMY[kind],b=$('#buy-'+kind);b.disabled=sim.wallet<cost||owned>=max||sim.stage==='welcome';b.textContent=owned>=max?(kind==='truck'?'Парк укомплектован · 4 машины':'Куплен · погрузка за 4 с'):sim.wallet>=cost?`Купить · ${cost} монет`:`Ещё ${deliveriesText(Math.ceil((cost-sim.wallet)/100))} до покупки`;$('#'+kind+'-progress').style.width=Math.min(100,sim.wallet/cost*100)+'%';$('#'+kind+'-card').classList.toggle('highlight',sim.stage==='buy-'+kind)}
  $('#truck-price-note').textContent=`В парке ${sim.trucks.length} из 4 · цена — доход с 2 доставок.`;
  $('#income').hidden=!(sim.lastIncome>0&&sim.elapsed-sim.lastIncome<3);
  if(sim.revision!==lastRevision)save();
}
function wire(){
  $('#next').onclick=next;$('#skip').onclick=()=>{sim.skipTutorial();save();updateUI()};$('#buy-truck').onclick=()=>buy('truck');$('#buy-excavator').onclick=()=>buy('excavator');$('#speed').onclick=()=>{speed=speed===1?2:1;updateUI()};$('#pause').onclick=()=>{sim.paused=!sim.paused;sim.accumulator=0;save();updateUI()};$('#overview').onclick=cameraOverview;$('#follow').onclick=()=>{following=true};
  $('#help').onclick=()=>{helpResume=sim.status==='running'&&!sim.paused;sim.paused=true;$('#help-dialog').showModal();save();updateUI()};$('#help-dialog').addEventListener('close',()=>{if(helpResume)sim.paused=false;$('#reset-confirm').hidden=true;$('#reset-career').hidden=false;updateUI()});$('#reset-career').onclick=()=>{$('#reset-confirm').hidden=false;$('#reset-career').hidden=true};$('#cancel-reset').onclick=()=>{$('#reset-confirm').hidden=true;$('#reset-career').hidden=false};
  $('#confirm-reset').onclick=()=>{helpResume=false;for(const v of vehicles.values())scene.remove(v.group);vehicles.clear();rows.clear();$('#fleet').replaceChildren();for(const p of pins.filter(p=>p.truckId))p.button.remove();for(let i=pins.length-1;i>=0;i--)if(pins[i].truckId)pins.splice(i,1);if(secondExcavator){scene.remove(secondExcavator);secondExcavator=null}sim=new CareerSimulation(graph);selected='T1';following=true;speed=1;syncAssets();$('#help-dialog').close();save();updateUI()};
  controls.addEventListener('start',()=>{following=false});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){helpResume=false;sim.paused=true;save();updateUI()}previous=performance.now()});window.addEventListener('pagehide',save);
}
function renderState(){syncAssets();
  for(const [id,running] of autoRunningGear)if(vehicles.get(id)?.group!==running.object){running.rig.dispose();autoRunningGear.delete(id)}
  for(const t of sim.trucks){const v=vehicles.get(t.id),pos=sim.position(t),heading=new THREE.Vector3(...sim.heading(t)).normalize();v.group.position.set(...pos);v.group.position.y+=.1;
    if(!t.edgeId&&(t.hub===0||t.hub===9)){if(t.state===STATES.LOADING&&t.loaderSlot===1)v.group.position.z-=39;else{const queued=sim.trucks.filter(o=>o.id<t.id&&!o.edgeId&&o.hub===t.hub&&o.loaderSlot!==1).length;v.group.position.z+=queued*12}}
    const z=new THREE.Vector3().crossVectors(heading,up).normalize(),y=new THREE.Vector3().crossVectors(z,heading).normalize();matrix.makeBasis(heading,y,z);v.group.quaternion.setFromRotationMatrix(matrix);v.cargo.visible=t.full||t.state===STATES.LOADING;v.cargo.scale.y=t.state===STATES.LOADING?Math.max(.02,1-t.serviceTime/(8/sim.excavators)):1;
    let running=autoRunningGear.get(t.id);if(running?.object!==v.group){running?.rig.dispose();running={object:v.group,rig:createTruckRunningGear(v.group),last:v.group.position.clone()};autoRunningGear.set(t.id,running)}
    const travelled=v.group.position.distanceTo(running.last);running.rig.step(travelled<60?travelled:0);running.last.copy(v.group.position);
  }
  if(following){const t=sim.trucks.find(t=>t.id===selected),p=vehicles.get(selected)?.group.position;if(p){const zoom=camera.aspect<1?1.3:1,loadingArea=!t.edgeId&&t.hub===9;const target=p.clone();if(loadingArea)target.x-=7;camera.position.lerp(target.clone().add(new THREE.Vector3(...(loadingArea?[22,26,36]:[48,70,68])).multiplyScalar(zoom)),.08);controls.target.lerp(target,.1)}}
  controls.update();if(mountainWorld)mountainWorld.contain(camera,controls);else containLandscapeCamera(camera,controls);guardQuarryCamera(camera,controls);mountainWorld?.guardCamera(camera);camera.updateMatrixWorld();const occupied=[],w=$('#labels').clientWidth,h=$('#labels').clientHeight;
  for(const pin of pins){let p=pin.position;if(pin.truckId){const t=sim.trucks.find(t=>t.id===pin.truckId);p=vehicles.get(t.id).group.position.toArray();p[1]+=9;pin.button.classList.toggle('loaded',t.full);pin.button.classList.toggle('selected',t.id===selected)}else p=[p[0],p[1]+7,p[2]];projected.set(...p).project(camera);pin.button.hidden=projected.z<-1||projected.z>1||Math.abs(projected.x)>1||Math.abs(projected.y)>1;if(pin.button.hidden)continue;
    let x=(projected.x*.5+.5)*w,y=(-projected.y*.5+.5)*h;for(let i=0;i<4&&occupied.some(q=>Math.abs(q[0]-x)<50&&Math.abs(q[1]-y)<25);i++)y+=26;occupied.push([x,y]);pin.button.style.left=x+'px';pin.button.style.top=y+'px';
  }
  if(mineConnection)mineConnection.render(camera,mine?.scene,false);else renderer.render(scene,camera);
}
function frame(time){requestAnimationFrame(frame);const dt=previous?Math.min(.2,(time-previous)/1000):0;previous=time;mapEnvironment?.update(time,mine?.active?mine.camera:camera);mountainWorld?.update(time,mine?.active?mine.camera:camera);if(mine?.active){mine.step(dt);mineConnection.render(mine.camera,mine.scene,true)}else if(manual?.active){manual.step(dt);if(manual.cameraMode!=='cab'){guardQuarryCamera(camera,controls);mountainWorld?.guardCamera(camera)}mineConnection.render(camera,mine.scene,false)}else{sim.tick(dt*speed);renderState()}if(time-uiAt>160){uiAt=time;updateUI()}if(time-saveAt>2000){saveAt=time;save()}}
async function init(){
  const container=$('#career-canvas');renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(container.clientWidth,container.clientHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;container.append(renderer.domElement);renderer.domElement.setAttribute('aria-label','3D-карьер: перетаскивайте для вращения');
  scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xeaf0f5,0x8e8272,2.2));const key=new THREE.DirectionalLight(0xfff7e9,2.6);key.position.set(-500,1100,650);scene.add(key);const fill=new THREE.DirectionalLight(0xe3ecf3,.9);fill.position.set(650,450,-600);scene.add(fill);camera=new THREE.PerspectiveCamera(39,container.clientWidth/container.clientHeight,.1,10000);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=18;controls.maxDistance=3500;controls.maxPolarAngle=Math.PI*.48;cameraOverview();following=true;
  const loader=new GLTFLoader(),draco=new DRACOLoader();draco.setDecoderPath('./vendor/three/examples/jsm/libs/draco/');loader.setDRACOLoader(draco);const json=async u=>{const r=await fetch(u);if(!r.ok)throw new Error('Asset '+r.status);return r.json()};
  const [route,design,world,truck]=await Promise.all([json(activeMap.rudny?'./assets/rudny/'+activeMap.id+'-route.json?v=rudny-1':'./assets/road-route.json'),json(activeMap.rudny?'./assets/rudny/'+activeMap.id+'-design.json?v=rudny-1':'./assets/terrain-design.json'),loader.loadAsync('./assets/quarry-v4.glb'),loader.loadAsync('./assets/truck.glb')]);
  if(activeMap.rudny)await installRudnyTerrain(loader,world.scene,activeMap.id);
  addQuarryLandscape(THREE,scene,world.scene);configureLandscapeCamera(controls);guardQuarryCamera=createQuarryCameraGuard(THREE,world.scene);camera.near=2;camera.far=20000;camera.updateProjectionMatrix();
  const surfaces=await loadQuarrySurfaceMaps(THREE,renderer);applyQuarrySurfaceMaterials(THREE,world.scene,surfaces);applyQuarrySurfaceMaterials(THREE,scene,surfaces);
  if(activeMap.rudny)styleRudnyMaterials(world.scene,activeMap.id);
  graph=buildGraph(route,design);let stored=null;try{stored=JSON.parse(localStorage.getItem(SAVE_KEY))}catch{storageOK=false}sim=CareerSimulation.restore(graph,stored)||new CareerSimulation(graph);truckAsset=truck.scene;world.scene.traverse(o=>{if(/^TRUCK_/.test(o.userData.asset_id||''))o.visible=false;if(o.userData.asset_id==='EXCAVATOR_01')excavatorAsset=o});scene.add(world.scene);syncAssets();addPin('Погрузка',graph.hubs.at(-1).position);addPin('Продажа · +100',graph.hubs[0].position);wire();updateUI();$('#asset-loading').hidden=true;document.body.dataset.loaded='true';draco.dispose();
  mountainWorld=activeMap.rudny?await loadRudnyLandscape({THREE,scene,world:world.scene,renderer,kind:activeMap.id,surfaces,route:route.samples,design}):await loadMountainLandscape({THREE,scene,world:world.scene,renderer,loader,kind:activeMap.id,surfaces,route:route.samples});controls.maxDistance=2650;cameraOverview();following=false;
  if(activeMap.id==='altai'){
    mapEnvironment=createAltaiEnvironment({THREE,scene,world:world.scene,renderer,surfaces,route:route.samples,landscapeProfile:mountainWorld,getFleet:()=>[...sim.trucks.map(t=>({id:t.id,kind:'truck',object:vehicles.get(t.id).group})),{id:'E1',kind:'excavator',object:excavatorAsset},...(secondExcavator?[{id:'E2',kind:'excavator',object:secondExcavator}]:[])]});
    cameraOverview();following=false;
  }
  mineConnection=createQuarryMineConnection({scene,world:world.scene,renderer,camera,controls,onFocus:()=>{manual?.exit();following=false}});
  manual=createManualControls({scene,camera,controls,world:world.scene,roadRoute:route.samples,
    getFleet:()=>[...sim.trucks.map(t=>({id:t.id,kind:'truck',label:'Самосвал '+t.id,full:t.full,object:vehicles.get(t.id).group})),{id:'E1',kind:'excavator',label:'Экскаватор 1',object:excavatorAsset},...(secondExcavator?[{id:'E2',kind:'excavator',label:'Экскаватор 2',object:secondExcavator}]:[])],
    onEnter:()=>{manualWasPaused=sim.paused;sim.paused=true;following=false;renderState();save();updateUI()},
    onExit:()=>{sim.paused=manualWasPaused;sim.accumulator=0;following=true;save();updateUI()}
  });
  mine=createMineRide({canvas:renderer.domElement,connection:mineConnection,
    onEnter:()=>{manual?.exit();mineWasPaused=sim.paused;mineWasFollowing=following;mineControlsEnabled=controls.enabled;sim.paused=true;following=false;controls.enabled=false;save();updateUI()},
    onExit:()=>{sim.paused=mineWasPaused;sim.accumulator=0;following=mineWasFollowing;controls.enabled=mineControlsEnabled;save();updateUI()}
  });
  mine.resize(container.clientWidth,container.clientHeight);
  const sceneryButton=document.createElement('button');sceneryButton.id='landscape-view';sceneryButton.textContent='△ Рельеф';sceneryButton.title='Ущелье и водопад';
  if(activeMap.rudny){sceneryButton.textContent='△ Вся карта';sceneryButton.title='Карьер и промышленные отвалы'}
  sceneryButton.onclick=()=>{following=false;const view=activeMap.rudny?rudnyOverview(activeMap.id,camera.aspect,true):mountainSceneryView(camera.aspect);controls.target.fromArray(view.target);camera.position.fromArray(view.position);camera.fov=view.fov;camera.updateProjectionMatrix();controls.update()};
  document.querySelector('.camera-buttons').append(sceneryButton);
  if(new URLSearchParams(location.search).get('view')==='landscape')sceneryButton.click();
  document.body.dataset.landscapeReady='true';
  new ResizeObserver(()=>{camera.aspect=container.clientWidth/container.clientHeight;camera.updateProjectionMatrix();mine?.resize(container.clientWidth,container.clientHeight);renderer.setSize(container.clientWidth,container.clientHeight)}).observe(container);renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();sim.paused=true;save();$('#load-error').hidden=false});requestAnimationFrame(frame);
}
init().catch(e=>{console.error(e);$('#asset-loading').hidden=true;$('#load-error').hidden=false});
