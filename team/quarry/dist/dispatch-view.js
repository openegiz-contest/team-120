import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {buildGraph,DispatchSimulation,STATES} from './dispatch-core.mjs';

const $=s=>document.querySelector(s);
const names={IDLE:'Готов / ожидает команды',MOVING_EMPTY:'Пустой → загрузка',MOVING_FULL:'С рудой → дробилка',LOADING:'Загрузка',UNLOADING:'Разгрузка',WAITING:'Ожидание'};
const clock=s=>{s=Math.max(0,Math.ceil(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
let sim,graph,renderer,scene,camera,controls,terrain,roadLines,selected={kind:'truck',id:'T1'},following=false,showGraph=true,last=0,uiTime=0,lastEvent=0,lastStatus='ready';
const vehicles=new Map(),pins=[],fleetButtons=new Map(),markers=[];
const leaderLayer=document.createElementNS('http://www.w3.org/2000/svg','svg');leaderLayer.classList.add('pin-leaders');leaderLayer.setAttribute('aria-hidden','true');$('#map-labels').append(leaderLayer);
const tempVector=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),orientation=new THREE.Matrix4();

function revealSelection(){const behavior=matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';$('.selection').scrollIntoView({behavior,block:'nearest'})}
function selectTruck(id){selected={kind:'truck',id};updateUI();revealSelection()}
function selectHub(index){selected={kind:'hub',index};following=false;$('#follow').setAttribute('aria-pressed','false');updateUI();revealSelection()}
function pin(label,kind,value,position){const b=document.createElement('button');b.textContent=label;b.className='map-pin '+(kind==='truck'?'truck-pin':value===0||value===9?'hub-terminal':'');b.setAttribute('aria-label',kind==='truck'?'Выбрать самосвал '+value:'Выбрать '+(value===0?'дробилку':value===9?'зону загрузки':'карман '+value));b.addEventListener('click',()=>kind==='truck'?selectTruck(value):selectHub(value));$('#map-labels').append(b);const line=document.createElementNS('http://www.w3.org/2000/svg','line');leaderLayer.append(line);pins.push({button:b,line,kind,value,position});return b}
function overview(top=false){following=false;$('#follow').setAttribute('aria-pressed','false');controls.target.set(0,65,0);camera.position.set(...(top?[0,1600,1]:[1000,1160,1280]));if(camera.aspect<1)camera.position.sub(controls.target).multiplyScalar(1.15/Math.max(.6,camera.aspect)).add(controls.target);controls.update()}
function updateUI(){if(!sim)return;
  $('#tonnes').textContent=sim.tonnes;$('#score').textContent=sim.score+' очков';$('#plan-progress').value=sim.tonnes;
  $('#clock').textContent=clock(sim.config.duration-sim.elapsed);$('#clock').classList.toggle('danger',sim.config.duration-sim.elapsed<45);
  $('#fuel').textContent=Math.ceil(sim.fuel)+' л';$('#fuel-bar').style.width=sim.fuel/sim.config.fuel*100+'%';$('#fuel').classList.toggle('danger',sim.fuel<sim.config.fuel*.2);
  $('#phase').textContent=sim.paused?'ПАУЗА':({ready:'ГОТОВНОСТЬ',running:'СМЕНА ИДЁТ',won:'ПЛАН ВЫПОЛНЕН',lost:'СМЕНА ОСТАНОВЛЕНА'})[sim.status];
  $('#start').disabled=sim.status!=='ready';$('#pause').disabled=sim.status!=='running';$('#pause').textContent=sim.paused?'Продолжить':'Пауза';
  for(const mode of ['auto','manual'])$('#mode-'+mode).setAttribute('aria-pressed',String(sim.mode===mode));
  $('#mode-note').textContent=sim.mode==='auto'?'ПРИОРИТЕТ ГРУЗА':'РУЧНЫЕ СИГНАЛЫ';
  $('#mode-help').textContent=sim.mode==='auto'?'Автодиспетчер резервирует участок до следующего разъезда. Гружёный транспорт получает приоритет.':'Выберите машину: «Ехать» — до следующего узла. Для постоянного разрешения откройте сигнал кармана. Встречный въезд может остановить смену.';
  for(const t of sim.trucks){const b=fleetButtons.get(t.id);b.classList.toggle('loaded',t.full);b.setAttribute('aria-pressed',String(selected.kind==='truck'&&selected.id===t.id));b.querySelector('span').textContent=t.broken?'Отказ тормозов':names[t.state];b.querySelector('small').textContent=t.full?'100 т':'Пустой'}
  const truckSelected=selected.kind==='truck';$('#truck-details').hidden=!truckSelected;$('#bay-details').hidden=truckSelected;
  if(truckSelected){const t=sim.trucks.find(t=>t.id===selected.id);$('#selected-title').textContent='Самосвал '+t.id;$('#selected-kind').textContent=t.full?'100 Т / ПОДЪЁМ':'ПУСТОЙ / СПУСК';$('#selected-status').textContent=(t.broken?'АВАРИЙНАЯ ОСТАНОВКА. ':'')+(t.reason||names[t.state])+(t.serviceTime>0&&['LOADING','UNLOADING'].includes(t.state)?' · '+Math.ceil(t.serviceTime)+' с':'');$('#brakes').textContent=Math.round(t.temperature)+' °C';$('#brakes').classList.toggle('danger',t.temperature>95);$('#idle').textContent=Math.round(t.wait)+' с';$('#heat-bar').style.width=Math.min(100,t.temperature/sim.config.brakeLimit*100)+'%';$('#heat-bar').style.background=t.temperature>95?'#c46842':'#7a9363';
    const meet=!t.full&&sim.meeting(t);$('#prediction').textContent=meet?`Прогноз встречи: ${meet.truck}, через ≈${Math.ceil(meet.seconds)} с по графу. Безопасная остановка — ближайший карман.`:t.full?'Гружёный транспорт имеет приоритет. Расход при движении — 0,28 л/с.':'Встречного гружёного транспорта впереди нет.';
    document.querySelectorAll('[data-command]').forEach(b=>{b.disabled=sim.mode!=='manual'||t.broken||sim.status==='won'||sim.status==='lost';b.setAttribute('aria-pressed',String(t.command===b.dataset.command))});
  }else{const h=graph.hubs[selected.index];$('#selected-title').textContent=h.index===0?'Дробилка / разгрузка':h.index===9?'Экскаватор / загрузка':'Карман '+String(h.index).padStart(2,'0');$('#selected-kind').textContent=h.type==='PASSING_BAY'?'19 × 55 М':'РАБОЧАЯ ПЛОЩАДКА';const at=sim.trucks.filter(t=>!t.edgeId&&t.hub===h.index).map(t=>t.id);$('#selected-status').textContent=at.length?'В узле: '+at.join(', '):'Узел свободен';for(const dir of ['up','down']){const b=$('#signal-'+dir),open=sim.signals[h.index][dir];b.setAttribute('aria-pressed',String(open));b.disabled=sim.mode!=='manual';b.textContent=(dir==='up'?'↑ Гружёным: ':'↓ Пустым: ')+(open?'ехать':'стоп')}$('#section-speed').value=sim.restrictions[h.index]||48;$('#section-speed').disabled=h.index===9}
  if(lastEvent!==sim.sequence){lastEvent=sim.sequence;$('#events').replaceChildren(...sim.events.slice(0,6).map(e=>{const li=document.createElement('li'),time=document.createElement('time');time.textContent=clock(e.time);li.append(time,document.createTextNode(e.message));return li}))}
  if(sim.status!==lastStatus){lastStatus=sim.status;if(sim.status==='won'||sim.status==='lost'){$('#result').hidden=false;$('#result-stars').textContent='★'.repeat(sim.stars)+'☆'.repeat(3-sim.stars);$('#result-title').textContent=sim.status==='won'?'Смена выполнена':'Смена остановлена';$('#result-reason').textContent=sim.reason;$('#result-stats').textContent=`${sim.tonnes} т · ${sim.score} очков · ${clock(sim.elapsed)} · топлива осталось ${Math.round(sim.fuel/sim.config.fuel*100)}%`;$('#result-stats').append(document.createElement('br'),document.createTextNode(`Простой в очередях: ${sim.serviceQueueWait.toFixed(1)} с · Аварийных остановок: ${sim.emergencyStops}`));}else $('#result').hidden=true}
}
function reset(){const mode=sim.mode,speed=sim.config.speedKmh;sim.reset();sim.mode=mode;sim.config.speedKmh=speed;lastEvent=0;lastStatus='ready';$('#result').hidden=true;selected={kind:'truck',id:'T1'};updateUI()}
function wireUI(){
  for(const t of sim.trucks){const b=document.createElement('button');b.className='fleet-row';b.innerHTML='<b>'+t.id+'</b><span></span><small></small>';b.addEventListener('click',()=>selectTruck(t.id));$('#fleet-list').append(b);fleetButtons.set(t.id,b)}
  $('#start').addEventListener('click',()=>{sim.start();last=performance.now();updateUI()});$('#pause').addEventListener('click',()=>{sim.paused=!sim.paused;updateUI()});$('#restart').addEventListener('click',reset);$('#again').addEventListener('click',reset);
  for(const mode of ['auto','manual'])$('#mode-'+mode).addEventListener('click',()=>{sim.setMode(mode);updateUI()});
  $('#speed-limit').addEventListener('change',e=>{sim.config.speedKmh=Number(e.target.value);sim.log('Лимит пустого транспорта: '+e.target.value+' км/ч.');updateUI()});
  document.querySelectorAll('[data-command]').forEach(b=>b.addEventListener('click',()=>{if(selected.kind==='truck'){sim.command(selected.id,b.dataset.command);updateUI()}}));
  for(const dir of ['up','down'])$('#signal-'+dir).addEventListener('click',()=>{if(selected.kind==='hub'){sim.setSignal(selected.index,dir,!sim.signals[selected.index][dir]);updateUI()}});
  $('#section-speed').addEventListener('change',e=>{if(selected.kind==='hub')sim.setLimit(selected.index,Number(e.target.value))});
  $('#overview').addEventListener('click',()=>overview());$('#top-view').addEventListener('click',()=>overview(true));$('#follow').addEventListener('click',()=>{if(selected.kind!=='truck')selected={kind:'truck',id:'T1'};following=!following;$('#follow').setAttribute('aria-pressed',String(following));updateUI()});$('#graph-toggle').addEventListener('click',()=>{showGraph=!showGraph;roadLines.visible=showGraph;$('#graph-toggle').setAttribute('aria-pressed',String(showGraph))});
  controls.addEventListener('start',()=>{following=false;$('#follow').setAttribute('aria-pressed','false')});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&sim.status==='running'){sim.paused=true;sim.log('Автопауза: вкладка скрыта.');updateUI()}last=performance.now()});
}
function buildRoadDisplay(){
  const positions=[],colors=[];for(const e of graph.edges){for(const id of [e.from,e.to]){const p=sim.nodes.get(id).position;positions.push(p[0],p[1]+1.1,p[2]);colors.push(.32,.52,.5)}}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));roadLines=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.9}));scene.add(roadLines);
  for(const h of graph.hubs){pin(h.index===0?'РАЗГРУЗКА':h.index===9?'ЗАГРУЗКА':String(h.index).padStart(2,'0'),'hub',h.index,h.position);const ring=new THREE.Mesh(new THREE.RingGeometry(h.type==='PASSING_BAY'?4:9,h.type==='PASSING_BAY'?6:12,40),new THREE.MeshBasicMaterial({color:0x779e84,side:THREE.DoubleSide,transparent:true,opacity:.7}));ring.rotation.x=-Math.PI/2;ring.position.set(h.position[0],h.position[1]+.25,h.position[2]);scene.add(ring);markers.push(ring)}
}
function renderState(){
  const color=roadLines.geometry.attributes.color;
  graph.edges.forEach((e,i)=>{const live=sim.edges.get(e.id);const rgb=live.isOccupied?(live.direction==='up'?[.85,.35,.1]:[.12,.47,.72]):[.36,.55,.48];color.setXYZ(i*2,...rgb);color.setXYZ(i*2+1,...rgb)});color.needsUpdate=true;
  for(const t of sim.trucks){const v=vehicles.get(t.id);const p=sim.position(t),heading=new THREE.Vector3(...sim.heading(t)).normalize();v.group.position.set(...p);v.group.position.y+=.08;
    if(!t.edgeId&&(t.hub===0||t.hub===9)){const queue=sim.trucks.filter(o=>o.hub===t.hub&&!o.edgeId&&o.id<t.id).length;v.group.position.z+=queue*13}
    const z=new THREE.Vector3().crossVectors(heading,up).normalize(),y=new THREE.Vector3().crossVectors(z,heading).normalize();orientation.makeBasis(heading,y,z);v.group.quaternion.setFromRotationMatrix(orientation);v.cargo.visible=t.full;v.ring.material.color.setHex(t.broken?0xbc422a:t.state===STATES.WAITING?0xc59d44:t.full?0xdb7942:0x4c91b9);v.ring.position.copy(v.group.position);v.ring.position.y+=.1;
  }
  if(following&&selected.kind==='truck'){const v=vehicles.get(selected.id);const target=v.group.position.clone();camera.position.lerp(target.clone().add(new THREE.Vector3(48,65,64)),.06);controls.target.lerp(target,.1)}
  camera.updateMatrixWorld();
  const placed=[],width=$('#map-labels').clientWidth,height=$('#map-labels').clientHeight;
  for(const p of pins){let pos=p.position;
    if(p.kind==='truck'){const t=sim.trucks.find(t=>t.id===p.value);pos=vehicles.get(t.id).group.position.toArray();pos[1]+=9;p.button.classList.toggle('loaded',t.full);p.button.classList.toggle('waiting',t.state===STATES.WAITING||t.broken)}else{pos=[...p.position];pos[1]+=6;p.button.classList.toggle('closed',sim.mode==='manual'&&!sim.signals[p.value].up&&!sim.signals[p.value].down)}
    tempVector.set(...pos).project(camera);const visible=tempVector.z>-1&&tempVector.z<1&&Math.abs(tempVector.x)<1.1&&Math.abs(tempVector.y)<1.1;p.button.hidden=!visible;
    p.line.style.display=visible?'':'none';
    if(visible){let x=(tempVector.x*.5+.5)*width,y=(-tempVector.y*.5+.5)*height;const w=p.button.offsetWidth,h=p.button.offsetHeight;
      p.line.setAttribute('x1',x);p.line.setAttribute('y1',y);
      for(let attempt=0;attempt<5&&placed.some(r=>Math.abs(r.x-x)<(r.w+w)/2+3&&Math.abs(r.y-y)<(r.h+h)/2+3);attempt++)y+=h+4;
      x=Math.max(w/2,Math.min(width-w/2,x));y=Math.max(h/2,Math.min(height-h/2,y));placed.push({x,y,w,h});p.button.style.left=x+'px';p.button.style.top=y+'px';p.line.setAttribute('x2',x);p.line.setAttribute('y2',y)}
    p.button.classList.toggle('selected',p.kind===selected.kind&&(p.kind==='truck'?selected.id===p.value:selected.index===p.value));
  }
}
function frame(time){requestAnimationFrame(frame);if(!sim)return;const dt=last?Math.min(.25,(time-last)/1000):0;last=time;sim.tick(dt);controls.update();renderState();renderer.render(scene,camera);if(time-uiTime>150){uiTime=time;updateUI()}}
async function init(){
  const container=$('#game-canvas');renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(container.clientWidth,container.clientHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;container.append(renderer.domElement);renderer.domElement.setAttribute('aria-label','Карта карьера, перетаскивайте для вращения');
  scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xeaf0f5,0x8e8272,2.2));const key=new THREE.DirectionalLight(0xfff7e9,2.6);key.position.set(-500,1100,650);scene.add(key);const fill=new THREE.DirectionalLight(0xe3ecf3,.9);fill.position.set(650,450,-600);scene.add(fill);
  camera=new THREE.PerspectiveCamera(39,container.clientWidth/container.clientHeight,.1,10000);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=18;controls.maxDistance=3500;controls.maxPolarAngle=Math.PI*.48;overview();
  const loader=new GLTFLoader(),draco=new DRACOLoader();draco.setDecoderPath('./vendor/three/examples/jsm/libs/draco/');loader.setDRACOLoader(draco);
  const json=async url=>{const r=await fetch(url);if(!r.ok)throw new Error('Asset '+r.status);return r.json()};
  const [route,design,world,truck]=await Promise.all([json('./assets/road-route.json'),json('./assets/terrain-design.json'),loader.loadAsync('./assets/quarry-v4.glb'),loader.loadAsync('./assets/truck.glb')]);
  graph=buildGraph(route,design);sim=new DispatchSimulation(graph);world.scene.traverse(o=>{if(/^TRUCK_/.test(o.userData.asset_id||''))o.visible=false;if(o.userData.asset_id==='GEO_001')terrain=o});scene.add(world.scene);
  const cargoGeo=new THREE.BoxGeometry(4.5,.8,4.1),cargoMat=new THREE.MeshStandardMaterial({color:0x6c5a43,roughness:1});
  for(const t of sim.trucks){const group=new THREE.Group();group.add(truck.scene.clone(true));const cargo=new THREE.Mesh(cargoGeo,cargoMat);cargo.position.set(-1.7,3.7,0);group.add(cargo);scene.add(group);const ring=new THREE.Mesh(new THREE.RingGeometry(5.7,6.4,36),new THREE.MeshBasicMaterial({color:0x4c91b9,side:THREE.DoubleSide,transparent:true,opacity:.8}));ring.rotation.x=-Math.PI/2;scene.add(ring);vehicles.set(t.id,{group,cargo,ring});pin(t.id,'truck',t.id,null)}
  buildRoadDisplay();wireUI();updateUI();draco.dispose();$('#asset-loading').hidden=true;document.body.dataset.loaded='true';
  new ResizeObserver(()=>{camera.aspect=container.clientWidth/container.clientHeight;camera.updateProjectionMatrix();renderer.setSize(container.clientWidth,container.clientHeight)}).observe(container);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();sim.paused=true;$('#load-error').hidden=false});
  requestAnimationFrame(frame);
}
init().catch(error=>{console.error(error);$('#asset-loading').hidden=true;$('#load-error').hidden=false});
