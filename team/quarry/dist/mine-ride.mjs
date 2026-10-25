import * as THREE from './vendor/three/build/three.module.js';
import {createMineTracks,MineRailDrive,MINE_BRANCHES} from './mine-core.mjs?v=3';
import {createMineWorld} from './mine-world.mjs?v=network-1';
import {createMineNetwork,MineNetworkDrive} from './mine-network.mjs';

export function createMineRide({canvas,onEnter,onExit,connection=null}){
  const tracks=createMineNetwork(),camera=new THREE.PerspectiveCamera(72,1,.05,250);
  let world=null,drive=null,active=false,mode='cab',lookYaw=0,lookPitch=0,lookPointer=null,uiTime=0;
  const keys=new Set(),pointers=new Map();
  const entry=document.createElement('section');entry.className='mine-entry';
  entry.innerHTML='<span>ПОДЗЕМНЫЙ ГОРИЗОНТ</span><h2>За светом рельсов.</h2><p>Два штрека, рудные камеры и поезд из вагонеток. Садитесь за управление и исследуйте шахту.</p><button id="mine-enter">В шахту · управлять вагонеткой →</button>';
  document.querySelector('.manual-entry').after(entry);
  if(connection){entry.querySelector('p').textContent='Вход на дне карьера. Садитесь в вагонетку на открытой станции и по рельсам въезжайте прямо в скалу.';entry.querySelector('#mine-enter').textContent='Показать вход на дне карьера →';const board=document.createElement('button');board.id='mine-board';board.textContent='Сесть в вагонетку';board.onclick=()=>enter();entry.append(board)}
  const panel=document.createElement('section');panel.className='mine-panel';panel.hidden=true;
  const extent=new THREE.Box3();for(const name of tracks.names)for(const p of tracks[name].samples)extent.expandByPoint(new THREE.Vector3(p.x,0,-p.z));
  const mapScale=Math.min(170/(extent.max.x-extent.min.x),230/(extent.max.z-extent.min.z));
  const mapPoint=p=>[15+(p.x-extent.min.x)*mapScale,16+(-p.z-extent.min.z)*mapScale];
  const path=track=>track.samples.filter((_,i)=>i%8===0).map((p,i)=>(i?'L':'M')+mapPoint(p).map(n=>n.toFixed(1)).join(',')).join(' ');
  panel.innerHTML=`<span class="mine-eyebrow">ПОД КАРЬЕРОМ / ЭЛЕКТРОВАГОНЕТКА</span><h2>Подземный маршрут</h2><div class="mine-readings"><strong id="mine-speed">0 <small>км/ч</small></strong><span id="mine-depth">Горизонт 0 м</span></div><p id="mine-status" role="status"></p>
    <svg class="mine-map" viewBox="0 0 200 265" role="img" aria-label="Схема шахты: вход, развилка, рудная жила слева и глубокий горизонт справа"><path d="${path(tracks.entry)}"/><path data-mine-line="ore" d="${path(tracks.ore)}"/><path data-mine-line="deep" d="${path(tracks.deep)}"/><circle id="mine-map-dot" r="4" cx="100" cy="20"/><text x="110" y="18">ВХОД</text><text x="12" y="257">РУДНАЯ ЖИЛА</text><text x="113" y="257">ГОРИЗОНТ −18</text></svg>
    <div class="mine-branches"><button data-mine-branch="ore">← Рудная жила <kbd>A / 1</kbd></button><button data-mine-branch="deep">Глубокий горизонт → <kbd>D / 2</kbd></button></div><p class="mine-guide">W — вперёд, S — назад, пробел — тормоз. На развилке остановитесь и выберите ветку. Потяните по изображению, чтобы осмотреться из вагонетки.</p><p class="mine-guide">В конце штрека сдайте назад к станции. Рельсы удерживают вагонетку на пути; перед упором она останавливается.</p><button id="mine-reset">↺ На станцию</button><button id="mine-exit">Вернуться в карьер</button>`;
  entry.after(panel);
  entry.querySelector('p').textContent='Вход на дне карьера. '+tracks.terminals.length+' забоев, 7 развилок и горизонты до '+Math.abs(Math.round(tracks.depth))+' м. Садитесь в вагонетку на открытой станции.';
  const mapEnds=tracks.terminals.map((name,i)=>{const [x,y]=mapPoint(tracks[name].at(tracks[name].length).position);return {name,number:i+1,x,y}}).sort((a,b)=>a.x-b.x);
  let labelX=1;for(const end of mapEnds){end.labelX=Math.max(end.x,labelX+14);labelX=end.labelX}
  panel.querySelector('.mine-map').innerHTML=tracks.names.map(name=>'<path data-mine-line="'+name+'" d="'+path(tracks[name])+'"><title>'+tracks.labels[name]+'</title></path>').join('')+mapEnds.map(end=>'<line x1="'+end.x+'" y1="'+end.y+'" x2="'+end.labelX+'" y2="248" stroke="#819a8a" stroke-width=".5"/><text text-anchor="middle" x="'+end.labelX+'" y="260">'+end.number+'</text>').join('')+'<circle id="mine-map-dot" r="4" cx="0" cy="0"/>';
  panel.querySelector('.mine-map').setAttribute('aria-label','Сеть шахты: 15 линий, 7 развилок, 8 забоев. Глубина до 150 метров.');
  const summary=document.createElement('p');summary.className='mine-guide';summary.textContent=(tracks.totalLength/1000).toFixed(1)+' км рельсов · 15 линий · 8 забоев';panel.querySelector('h2').after(summary);
  const legend=document.createElement('div');legend.className='mine-destinations';legend.innerHTML=tracks.terminals.map(name=>'<span>'+tracks.labels[name]+'</span>').join('');panel.querySelector('.mine-map').after(legend);
  const hud=document.createElement('div');hud.className='mine-hud';hud.hidden=true;
  hud.innerHTML='<div class="mine-view"><button data-mine-view="cab" aria-pressed="true">Из вагонетки</button><button data-mine-view="follow" aria-pressed="false">За вагонеткой</button><button id="mine-rear">Оглянуться</button></div><output id="mine-location">Входная станция</output><div class="mine-pedals"><button data-mine-drive="back">Назад<kbd>S</kbd></button><button data-mine-drive="brake">Тормоз<kbd>Пробел</kbd></button><button data-mine-drive="forward">Вперёд<kbd>W</kbd></button></div>';
  document.querySelector('.world').append(hud);
  function clearInput(){keys.clear();pointers.clear();hud.querySelectorAll('.pressed').forEach(b=>b.classList.remove('pressed'));if(drive)drive.speed=0}
  function updateCamera(){
    const {position:p,tangent:t}=drive.pose(mode==='cab'?.8:0);
    if(mode==='cab'){
      camera.position.copy(p).add(new THREE.Vector3(0,1.95,0));const yaw=Math.atan2(-t.x,-t.z)+lookYaw;
      const direction=new THREE.Vector3(-Math.sin(yaw)*Math.cos(lookPitch),Math.sin(lookPitch)+t.y,-Math.cos(yaw)*Math.cos(lookPitch));camera.lookAt(camera.position.clone().add(direction));
    }else{
      const rear=drive.pose(-7.5);camera.position.copy(rear.position).add(new THREE.Vector3(-rear.tangent.z*1.2,2.6,rear.tangent.x*1.2));camera.lookAt(p.clone().addScaledVector(t,2).add(new THREE.Vector3(0,1.1,0)));
    }
    camera.updateMatrixWorld();
    if(connection)connection.worldCamera(camera);
  }
  function updateUI(){
    const p=drive.pose().position,remaining=Math.max(0,drive.limit-drive.distance),atStation=drive.distance<25;
    const junction=drive.junction,location=drive.waiting?'Развилка · выберите следующую линию':drive.end?(drive.distance<15?'Станция · начало пути':'Забой · назад клавишей S'):atStation?(connection?'Дно карьера · W — въехать в шахту':'Входная станция'):tracks.labels[drive.currentTrack];
    panel.querySelector('#mine-speed').innerHTML=Math.abs(drive.speed*3.6).toFixed(0)+' <small>км/ч</small>';
    panel.querySelector('#mine-depth').textContent='Горизонт '+Math.round(p.y)+' м';panel.querySelector('#mine-status').textContent=location;
    hud.querySelector('#mine-location').textContent=location+(!drive.waiting&&!drive.end&&drive.distance>25?' · '+(junction?'до стрелки '+Math.round(junction.gate-drive.distance):'до забоя '+Math.round(remaining))+' м':'');
    const dot=panel.querySelector('#mine-map-dot'),mapped=mapPoint(p);dot.setAttribute('cx',mapped[0]);dot.setAttribute('cy',mapped[1]);
    panel.querySelectorAll('[data-mine-line]').forEach(o=>o.classList.toggle('selected',drive.path.includes(o.dataset.mineLine)));
    panel.querySelectorAll('[data-mine-branch]').forEach((b,i)=>{const option=junction?.options[i];b.disabled=!option||Math.abs(drive.speed)>.15;b.dataset.mineBranch=option||'';b.innerHTML=(option?(i?'→ ':'← ')+tracks.labels[option]:'Вернитесь к стрелке')+'<kbd>'+(i?'D / 2':'A / 1')+'</kbd>';b.setAttribute('aria-pressed',String(!!option&&junction.selected===option))});
    panel.classList.toggle('awaiting-switch',drive.waiting);
    if(connection)panel.querySelector('#mine-exit').textContent=drive.distance<22?'Выйти из вагонетки на станции':'Завершить поездку · к станции';
  }
  function enter(){
    if(active)return;onEnter();world??=createMineWorld(tracks);drive=new MineNetworkDrive(tracks);active=true;mode='cab';lookYaw=lookPitch=0;
    document.body.classList.add('mine-active');panel.hidden=hud.hidden=false;window.scrollTo({top:0,behavior:'instant'});world.update(drive);updateCamera();updateUI();
    hud.querySelectorAll('[data-mine-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mineView===mode)));
  }
  function exit(){if(!active)return;clearInput();active=false;lookPointer=null;if(connection){drive=new MineNetworkDrive(tracks);world.update(drive)}document.body.classList.remove('mine-active');panel.hidden=hud.hidden=true;onExit();connection?.focus()}
  function choose(branch){if(drive.choose(branch))updateUI()}
  entry.querySelector('#mine-enter').onclick=connection?()=>connection.focus():enter;panel.querySelector('#mine-exit').onclick=exit;
  panel.querySelector('#mine-reset').onclick=()=>{clearInput();drive=new MineNetworkDrive(tracks);lookYaw=lookPitch=0;world.update(drive);updateCamera();updateUI()};
  panel.querySelectorAll('[data-mine-branch]').forEach(b=>b.onclick=()=>choose(b.dataset.mineBranch));
  hud.querySelectorAll('[data-mine-view]').forEach(b=>b.onclick=()=>{mode=b.dataset.mineView;lookYaw=lookPitch=0;hud.querySelectorAll('[data-mine-view]').forEach(o=>o.setAttribute('aria-pressed',String(o===b)));updateCamera()});
  hud.querySelector('#mine-rear').onclick=()=>{lookYaw=Math.abs(lookYaw)>2?0:Math.PI;mode='cab';hud.querySelectorAll('[data-mine-view]').forEach(o=>o.setAttribute('aria-pressed',String(o.dataset.mineView==='cab')));updateCamera()};
  for(const b of hud.querySelectorAll('[data-mine-drive]')){
    b.addEventListener('pointerdown',e=>{if(!active)return;e.preventDefault();b.setPointerCapture(e.pointerId);pointers.set(e.pointerId,b.dataset.mineDrive);b.classList.add('pressed')});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,e=>{pointers.delete(e.pointerId);b.classList.remove('pressed')});
    b.addEventListener('contextmenu',e=>e.preventDefault());
  }
  const bindings={KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',Space:'brake'};
  window.addEventListener('keydown',e=>{if(!active||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(e.code==='Escape'){e.preventDefault();exit();return}if(bindings[e.code]){e.preventDefault();keys.add(bindings[e.code])}if(['KeyA','Digit1','KeyD','Digit2'].includes(e.code)){e.preventDefault();choose(drive.junction?.options[['KeyA','Digit1'].includes(e.code)?0:1])}});
  window.addEventListener('keyup',e=>{if(bindings[e.code])keys.delete(bindings[e.code])});window.addEventListener('blur',clearInput);document.addEventListener('visibilitychange',clearInput);
  canvas.addEventListener('pointerdown',e=>{if(active&&mode==='cab'){lookPointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId)}});
  canvas.addEventListener('pointermove',e=>{if(!active||mode!=='cab'||lookPointer?.id!==e.pointerId)return;lookYaw-=(e.clientX-lookPointer.x)*.004;lookPitch=THREE.MathUtils.clamp(lookPitch-(e.clientY-lookPointer.y)*.004,-.7,.7);lookPointer.x=e.clientX;lookPointer.y=e.clientY});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(lookPointer?.id===e.pointerId)lookPointer=null});
  if(connection){connection.enableDeepNetwork?.();world=createMineWorld(tracks,{connected:true});world.scene.position.copy(connection.origin);world.scene.updateMatrixWorld(true);drive=new MineNetworkDrive(tracks);world.update(drive);camera.far=20000;camera.updateProjectionMatrix();connection.pin.onclick=enter;panel.querySelector('.mine-guide + .mine-guide').textContent='S — вернуться по тем же рельсам наружу, на дно карьера. На станции можно выйти из вагонетки. Перед концом пути поезд тормозит автоматически.'}
  return {get active(){return active},get scene(){return world?.scene},camera,exit,step(dt){
    if(!active||document.hidden)return;const held=new Set([...keys,...pointers.values()]);drive.step(dt,{throttle:Number(held.has('forward'))-Number(held.has('back')),brake:held.has('brake')});world.update(drive);updateCamera();
    uiTime+=dt;if(uiTime>.1){uiTime=0;updateUI()}
  },resize(width,height){camera.aspect=width/Math.max(1,height);camera.updateProjectionMatrix()}};
}
