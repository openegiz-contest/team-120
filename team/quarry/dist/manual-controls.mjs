import * as THREE from './vendor/three/build/three.module.js';
import {ManualDrive,groundPose} from './manual-core.mjs?v=5';
import {createManualWorksite} from './manual-worksite.mjs?v=rockfall-2';
import {createManualCamera} from './manual-camera.mjs?v=rockfall-2';
import {createVehicleContactShadow,enableVehicleShadows} from './quarry-contact-shadows.mjs?v=closeup-1';
import {createExcavatorRig} from './excavator-rig.mjs?v=4';
import {createTruckRunningGear,createCrawlerRunningGear} from './running-gear.mjs?v=2';
import {createStockpileBlockers} from './stockpile-colliders.mjs?v=1';

// Spatial triangle lookup: wheel contacts use the actual render mesh, not a separate height approximation.
export function createSurfaceSampler(meshes){
  const cells=new Map(),cell=20,v=new THREE.Vector3();
  for(const mesh of meshes){
    mesh.updateWorldMatrix(true,false);const p=mesh.geometry.attributes.position,ix=mesh.geometry.index;
    for(let i=0;i<(ix?ix.count:p.count);i+=3){
      const a=[];for(let j=0;j<3;j++){v.fromBufferAttribute(p,ix?ix.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld);a.push([v.x,v.y,v.z])}
      const [[ax,ay,az],[bx,by,bz],[cx,cy,cz]]=a,den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
      if(Math.abs(den)<1e-7||Math.max(ay,by,cy)<-1)continue;
      const x0=Math.max(-45,Math.floor(Math.min(ax,bx,cx)/cell)),x1=Math.min(45,Math.floor(Math.max(ax,bx,cx)/cell));
      const z0=Math.max(-40,Math.floor(Math.min(az,bz,cz)/cell)),z1=Math.min(40,Math.floor(Math.max(az,bz,cz)/cell));
      const t={ax,ay,az,bx,by,bz,cx,cy,cz,den};
      for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(t)}
    }
  }
  return (x,z)=>{
    let height=-Infinity;
    for(const t of cells.get(Math.floor(x/cell)+','+Math.floor(z/cell))||[]){
      const u=((t.bz-t.cz)*(x-t.cx)+(t.cx-t.bx)*(z-t.cz))/t.den;
      const w=((t.cz-t.az)*(x-t.cx)+(t.ax-t.cx)*(z-t.cz))/t.den;
      if(u>=-1e-6&&w>=-1e-6&&u+w<=1.000001)height=Math.max(height,u*t.ay+w*t.by+(1-u-w)*t.cy);
    }
    return height===-Infinity?null:height;
  };
}

const bindings={KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',Space:'brake',KeyQ:'slewLeft',KeyE:'slewRight',KeyR:'boomUp',KeyF:'boomDown',KeyT:'stickOut',KeyG:'stickIn',KeyY:'bucketIn',KeyH:'bucketOut'};
const buttons=(pairs)=>pairs.map(([action,label,key])=>`<button type="button" data-drive="${action}" aria-label="${label}"><span>${label}</span><kbd>${key}</kbd></button>`).join('');

export function createManualControls({scene,camera,controls,world,getFleet,onEnter,onExit,roadRoute=[]}){
  const entry=document.createElement('section');entry.className='manual-entry';
  entry.innerHTML='<span class="manual-eyebrow">ПОПРОБУЙТЕ САМИ</span><h2>За руль техники</h2><p>Прокатитесь по карьеру или поработайте стрелой и ковшом.</p><div><button data-start="truck">▰ Самосвал</button><button data-start="excavator">⌁ Экскаватор</button></div>';
  document.querySelector('.control').prepend(entry);
  const panel=document.createElement('section');panel.className='manual-panel';panel.hidden=true;
  panel.innerHTML=`<span class="manual-eyebrow">РУЧНОЕ УПРАВЛЕНИЕ</span><h2 id="manual-name"></h2><div class="manual-fleet" aria-label="Выбор техники"></div>
    <div class="manual-telemetry"><strong id="manual-speed">0 <small>км/ч</small></strong><span id="manual-state" role="status">Готов к движению</span></div>
    <section class="manual-worksite"><div class="machine-condition"><span>Повреждения <b id="manual-damage">0%</b></span><meter id="manual-health" min="0" max="100" low="40" high="70" optimum="100" value="100">100%</meter></div><strong id="manual-ore"></strong><p id="manual-dig-guide"></p><button id="manual-prepare">Подготовить площадку погрузки</button><small>Поставит экскаватор у руды, а пустой самосвал — рядом.</small></section>
    <div class="manual-payload" hidden><span>Загрузка для практики</span><div><button data-payload="0">Пустой · 55–60 км/ч</button><button data-payload="1">С рудой · 35–40 км/ч</button></div><small>На спуске скорость выше. Остановитесь, чтобы изменить загрузку.</small><br><small id="manual-speed-limit"></small></div>
    <p class="manual-hint">W / S — вперёд и назад. A / D — поворот. Пробел — тормоз. Можно удерживать кнопки на экране.</p>
    <div class="manual-tools" hidden><h3>Рабочее оборудование</h3><p>Сначала поднимите стрелу, затем поверните кабину или разверните ковш.</p><div class="joint-controls">${buttons([['slewLeft','Кабина ↶','Q'],['slewRight','Кабина ↷','E'],['boomUp','Стрела ↑','R'],['boomDown','Стрела ↓','F'],['stickOut','Рукоять →','T'],['stickIn','Рукоять ←','G'],['bucketIn','Ковш закрыть','Y'],['bucketOut','Ковш открыть','H']])}</div></div>
    <section class="manual-rockfalls"><h3>Камнепады</h3><label><input id="manual-rockfall-auto" type="checkbox" checked> Автоматические камнепады</label><p id="manual-rockfall-status" role="status">Дорога свободна</p><button id="manual-rockfall-trigger">Вызвать камнепад рядом</button><small>Оранжевая зона — место обвала. После падения подъедьте экскаватором, опустите ковш к камням и удерживайте Y. Выгружайте H в кузов или в стороне от проезда.</small></section>
    <output id="manual-joints" class="manual-joints"></output><p class="manual-note">Свободная практика: руда и повреждения действуют до выхода. Автопарк на паузе, монеты не начисляются. При выходе техника вернётся к своим рейсам.</p><button id="manual-exit">Вернуться к автопарку</button>`;
  entry.after(panel);
  const hud=document.createElement('div');hud.className='manual-hud';hud.hidden=true;
  hud.innerHTML=`<div class="manual-camera"><button id="manual-follow" aria-pressed="true">◎ За машиной</button><button id="manual-cab" aria-pressed="false">▣ Из кабины</button><button id="manual-reset">↺ На исходную</button></div><span class="manual-look-hint">Потяните по экрану, чтобы осмотреться</span><div class="driving-pad"><div>${buttons([['left','↶','A'],['right','↷','D']])}</div><div>${buttons([['back','Назад','S'],['brake','Стоп','␣'],['forward','Вперёд','W']])}</div></div>`;
  document.querySelector('.world').append(hud);
  const notice=document.createElement('output');notice.className='manual-impact-notice';notice.setAttribute('aria-live','polite');hud.append(notice);
  const hazardBadge=document.createElement('output');hazardBadge.className='manual-hazard-badge';hazardBadge.hidden=true;hud.append(hazardBadge);
  const hazardTools=document.createElement('div');hazardTools.className='manual-hazard-tools';hud.append(hazardTools);hazardTools.append(hazardBadge);
  const hazardView=document.createElement('button');hazardView.type='button';hazardView.className='manual-hazard-view';hazardView.textContent='Показать обвал';hazardView.hidden=true;hazardTools.append(hazardView);
  const meshList=[];world.traverse(o=>{if(o.userData.asset_id==='GEO_001')o.traverse(m=>{if(m.isMesh)meshList.push(m)})});
  scene.traverse(o=>{if(o.name==='Continuous land outside quarry')meshList.push(o)});
  const sample=createSurfaceSampler(meshList),blockers=[];
  world.updateMatrixWorld(true);world.traverse(o=>{if(/^PLANT_/.test(o.userData.asset_id||''))blockers.push(new THREE.Box3().setFromObject(o))});
  blockers.push(...createStockpileBlockers(world));
  let active=false,selected=null,uiTime=0,lookPointer=null,worksite=null,noticeTime=0;
  const manualCamera=createManualCamera(camera,controls);
  manualCamera.useDrivingFraming();
  const sessions=new Map(),keyboard=new Set(),pointers=new Map(),up=new THREE.Vector3(0,1,0),basis=new THREE.Matrix4();
  function clearInput(){keyboard.clear();pointers.clear();document.querySelectorAll('[data-drive]').forEach(b=>b.classList.remove('pressed'));if(selected)selected.drive.speed=0}
  function input(){const held=new Set([...keyboard,...pointers.values()]);const axis=(a,b)=>(held.has(a)?1:0)-(held.has(b)?1:0);return {throttle:axis('forward','back'),turn:axis('left','right'),brake:held.has('brake'),slew:axis('slewLeft','slewRight'),boom:axis('boomUp','boomDown'),stick:axis('stickOut','stickIn'),bucket:axis('bucketOut','bucketIn')}}
  function orient(session){
    const d=session.drive,forward=new THREE.Vector3(Math.cos(d.yaw),Math.tan(d.pitch),-Math.sin(d.yaw)).normalize();
    const side=new THREE.Vector3().crossVectors(forward,up).normalize();side.y=Math.tan(d.roll);side.normalize();
    const normal=new THREE.Vector3().crossVectors(side,forward).normalize();side.crossVectors(forward,normal).normalize();basis.makeBasis(forward,normal,side);
    session.mesh.position.set(d.x,d.y,d.z);session.mesh.quaternion.setFromRotationMatrix(basis);session.mesh.updateMatrixWorld(true);
    session.contactShadow?.update();
  }
  function select(id){
    clearInput();worksite?.clearShake(camera);const item=getFleet().find(v=>v.id===id);if(!item)return;
    if(!sessions.has(id)){
      item.object.updateWorldMatrix(true,true);const mesh=item.object.clone(true),p=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3();item.object.matrixWorld.decompose(p,q,scale);
      mesh.position.copy(p);mesh.quaternion.copy(q);mesh.scale.copy(scale);mesh.visible=true;scene.add(mesh);
      enableVehicleShadows(mesh);
      const direction=new THREE.Vector3(1,0,0).applyQuaternion(q),yaw=Math.atan2(-direction.z,direction.x);
      const drive=new ManualDrive(item.kind,p.toArray(),yaw),pose=groundPose(p.x,p.z,yaw,item.kind,sample);if(pose)Object.assign(drive,{y:pose.height,pitch:pose.pitch,roll:pose.roll});
      const session={...item,mesh,drive,initial:{position:p.toArray(),yaw},visible:item.object.visible,rig:item.kind==='excavator'?createExcavatorRig(mesh):null,gear:item.kind==='excavator'?createCrawlerRunningGear(mesh):createTruckRunningGear(mesh)};
      if(item.kind==='truck'){drive.setPayload(item.full);const cargo=mesh.getObjectByName('Truck cargo');if(cargo){cargo.visible=!!item.full;cargo.scale.y=1}}
      sessions.set(id,session);item.object.visible=false;orient(session);
      session.contactShadow=createVehicleContactShadow(THREE,scene,mesh,item.kind,worksite.surface);
      worksite.attach(session);session.rig?.setContactCheck(()=>worksite.armClear(session));
    }
    selected=sessions.get(id);
    worksite.focusRockfalls(selected);
    document.querySelector('#manual-name').textContent=item.label;
    panel.querySelector('.manual-tools').hidden=item.kind!=='excavator';
    panel.querySelector('.manual-payload').hidden=item.kind!=='truck';
    panel.querySelectorAll('[data-vehicle]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.vehicle===id)));
    manualCamera.select(selected);updateTelemetry();updateWorksiteUI();
  }
  function enter(kind){
    if(active)return;onEnter();manualCamera.begin();active=true;document.body.classList.add('manual-active');entry.hidden=true;panel.hidden=false;hud.hidden=false;
    setCameraMode('follow');
    worksite=createManualWorksite({scene,sessions,sample,orient,blockers,roadRoute,onNotice(text){notice.textContent=text;noticeTime=4;notice.hidden=false}});
    worksite.setAutomaticRockfalls(panel.querySelector('#manual-rockfall-auto').checked);
    panel.querySelector('.manual-fleet').replaceChildren(...getFleet().map(v=>{const b=document.createElement('button');b.textContent=v.label;b.dataset.vehicle=v.id;b.onclick=()=>select(v.id);return b}));
    for(const v of getFleet())select(v.id);worksite.start();select(getFleet().find(v=>v.kind===kind)?.id);window.scrollTo({top:0,behavior:'instant'});
  }
  function exit(){
    if(!active)return;clearInput();for(const s of sessions.values()){s.object.visible=s.visible;scene.remove(s.mesh);s.rig?.dispose();s.gear?.dispose();s.contactShadow?.dispose()}
    worksite.dispose();worksite=null;manualCamera.end();lookPointer=null;sessions.clear();selected=null;active=false;document.body.classList.remove('manual-active');entry.hidden=false;panel.hidden=true;hud.hidden=true;onExit();
  }
  function moveCamera(alpha){
    manualCamera.update();
  }
  function setCameraMode(mode){worksite?.clearShake(camera);manualCamera.setMode(mode);hud.querySelector('#manual-follow').setAttribute('aria-pressed',String(mode==='follow'));hud.querySelector('#manual-cab').setAttribute('aria-pressed',String(mode==='cab'))}
  function updateWorksiteUI(){
    if(!selected||!worksite)return;const r=worksite.report(selected);
    panel.querySelector('#manual-damage').textContent=r.damage+'%';panel.querySelector('#manual-health').value=100-r.damage;
    panel.querySelector('#manual-ore').textContent=selected.rig?`В ковше: ${(r.bucket*2.2).toFixed(1)} / 2,6 т`:`В кузове: ${(r.ore*2.2).toFixed(1)} / 26,4 т`;
    if(selected.kind==='truck'){const grade=Math.tan(selected.drive.pitch);panel.querySelector('#manual-speed-limit').textContent=(grade<-.005?'Спуск':grade>.005?'Подъём':'Ровный участок')+' · вперёд до '+Math.round(selected.drive.performance.forward*3.6)+' км/ч'}
    panel.querySelector('#manual-dig-guide').textContent=r.damage>=100?'Машина повреждена: привод отключён до выхода из практики.':selected.rig?(r.bucket>.05?'Поднимите стрелу R и рукоять T выше борта. Q/E — повернуть к кузову; H — открыть ковш над кузовом.':'Опустите ковш в бурую руду. Y — закрыть и набрать; R — поднять стрелу. Руда вынимается только из забоя.'):'Подведите кузов под ковш и остановитесь. Масса руды влияет на разгон и силу столкновения.';
    if(selected.rig){const degrees=r=>Math.round(((THREE.MathUtils.radToDeg(r)%360)+360)%360);panel.querySelector('#manual-joints').textContent+=' · Платформа '+degrees(selected.rig.state.slew)+'° · Ходовая '+degrees(selected.drive.yaw)+'°';if(selected.loadingTarget&&r.bucket>.05)panel.querySelector('#manual-dig-guide').textContent='Зелёная метка: ковш над '+selected.loadingTarget+'. H — открыть и высыпать руду.'}
    if(selected.armContact&&selected.armBlocked)panel.querySelector('#manual-state').textContent='Гидравлика в упоре · поворот остановлен';
    const hazard=worksite.rockfallReport(),distance=hazard.position?Math.round(Math.hypot(selected.drive.x-hazard.position.x,selected.drive.z-hazard.position.z)):0;
    const status=hazard.phase==='warning'?(hazard.seconds?`Камнепад через ${hazard.seconds} с · ${distance} м`:'Обвал ждёт: отъедьте от оранжевой зоны'):hazard.phase==='falling'?`Камнепад · остановитесь · ${distance} м`:hazard.phase==='blocked'?`Завал · ${(hazard.remaining*2.2).toFixed(1)} т · ${distance} м`:hazard.phase==='cleared'?'Завал расчищен · проезд открыт':'Дорога свободна';
    panel.querySelector('#manual-rockfall-status').textContent=status;panel.querySelector('#manual-rockfall-trigger').disabled=!['idle','cleared'].includes(hazard.phase);
    const bearing=hazard.position?Math.atan2(-(hazard.position.z-selected.drive.z),hazard.position.x-selected.drive.x)-selected.drive.yaw:0,angle=Math.atan2(Math.sin(bearing),Math.cos(bearing));
    const direction=Math.abs(angle)<.5?'↑ впереди':Math.abs(angle)>2.65?'↓ сзади':angle>0?'← слева':'→ справа';
    hazardBadge.textContent=status+(hazard.position?' · '+direction:'');hazardBadge.hidden=['idle','cleared'].includes(hazard.phase);hazardBadge.dataset.phase=hazard.phase;
    hazardView.hidden=hazardBadge.hidden;hazardView.textContent=manualCamera.inspecting?'Вернуться к технике':hazard.phase==='blocked'?'Показать завал':'Показать обвал';hazardView.setAttribute('aria-pressed',String(manualCamera.inspecting));
  }
  function updateTelemetry(){if(!selected)return;document.querySelector('#manual-speed').innerHTML=Math.abs(selected.drive.speed*3.6).toFixed(0)+' <small>км/ч</small>';document.querySelector('#manual-state').textContent=selected.drive.blocked?'Край, крутой склон или препятствие':selected.armBlocked?'Ковш упирается в грунт':Math.abs(selected.drive.speed)>.1?(selected.drive.speed>0?'Передний ход':'Задний ход'):'Готов к движению';const out=document.querySelector('#manual-joints');out.hidden=!selected.rig;if(selected.rig)out.textContent=['boom','stick','bucket'].map((key,i)=>['Стрела','Рукоять','Ковш'][i]+' '+Math.round(THREE.MathUtils.radToDeg(selected.rig.state[key]))+'°').join(' · ')}
  entry.querySelectorAll('[data-start]').forEach(b=>{b.onclick=()=>enter(b.dataset.start)});
  document.querySelector('#manual-exit').onclick=exit;
  document.querySelector('#manual-follow').onclick=()=>setCameraMode('follow');
  document.querySelector('#manual-cab').onclick=()=>setCameraMode('cab');
  document.querySelector('#manual-reset').onclick=()=>{clearInput();if(!selected)return;const payload=selected.drive.payload;selected.drive=new ManualDrive(selected.kind,selected.initial.position,selected.initial.yaw);if(payload!==undefined)selected.drive.setLoadFraction(payload);selected.rig?.reset();worksite.reset(selected);orient(selected);manualCamera.select(selected)};
  document.querySelector('#manual-prepare').onclick=()=>{clearInput();const id=worksite.prepare();if(id)select(id)};
  panel.querySelector('#manual-rockfall-trigger').onclick=()=>{if(selected){worksite.requestRockfall(selected);updateWorksiteUI()}};
  panel.querySelector('#manual-rockfall-auto').onchange=e=>worksite?.setAutomaticRockfalls(e.target.checked);
  hazardView.onclick=()=>{clearInput();worksite?.clearShake(camera);if(manualCamera.inspecting)manualCamera.stopInspection();else manualCamera.inspectRockfall(worksite.rockfallReport());updateWorksiteUI()};
  panel.querySelectorAll('[data-payload]').forEach(b=>{b.onclick=()=>{
    if(!selected||selected.kind!=='truck'||Math.abs(selected.drive.speed)>.1)return;
    worksite.setCargo(selected,b.dataset.payload==='1');updateTelemetry();updateWorksiteUI();
  }});
  const canvas=controls.domElement;
  canvas.addEventListener('pointerdown',e=>{if(active&&manualCamera.mode==='cab'&&lookPointer===null){lookPointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId)}});
  canvas.addEventListener('pointermove',e=>{if(!active||manualCamera.mode!=='cab'||lookPointer?.id!==e.pointerId)return;manualCamera.look(e.clientX-lookPointer.x,e.clientY-lookPointer.y);lookPointer.x=e.clientX;lookPointer.y=e.clientY});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(lookPointer?.id===e.pointerId)lookPointer=null});
  window.addEventListener('keydown',event=>{
    if(!active||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;
    if(event.code==='Escape'){event.preventDefault();exit();return}
    const action=bindings[event.code];if(action){event.preventDefault();keyboard.add(action)}
  });
  window.addEventListener('keyup',event=>{if(bindings[event.code]){keyboard.delete(bindings[event.code]);if(active)event.preventDefault()}});
  window.addEventListener('blur',clearInput);document.addEventListener('visibilitychange',clearInput);
  for(const b of [...hud.querySelectorAll('[data-drive]'),...panel.querySelectorAll('[data-drive]')]){
    b.addEventListener('pointerdown',e=>{if(!active)return;e.preventDefault();b.setPointerCapture(e.pointerId);pointers.set(e.pointerId,b.dataset.drive);b.classList.add('pressed')});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,e=>{pointers.delete(e.pointerId);b.classList.remove('pressed')});
    b.addEventListener('contextmenu',e=>e.preventDefault());
  }
  return {get active(){return active},get cameraMode(){return manualCamera.mode},get subject(){return selected?.mesh||null},heightAt:sample,exit,step(dt){
    if(!active||!selected||document.hidden)return;
    worksite.clearShake(camera);
    const keys=input(),before={...selected.drive};let contact=null;
    if(Object.values(keys).some(Boolean))manualCamera.stopInspection();
    const driving=selected.physics.lock>0||selected.physics.damage>=100?{brake:true}:keys;
    selected.drive.step(dt,driving,worksite.surface,(x,z,yaw)=>{contact=worksite.collision(selected,x,z,yaw);return !!contact});
    if(contact)worksite.impact(selected,contact,selected.drive.contactSpeed);
    orient(selected);
    if(selected.rig&&!selected.rig.isClear(sample)){const speed=selected.drive.speed;Object.assign(selected.drive,before,{speed:0,blocked:true});orient(selected);if(Math.abs(speed)>.5)worksite.impact(selected,null,speed)}
    selected.armContact=null;selected.armBlocked=selected.rig?.step(Math.min(.1,dt),selected.physics.damage>=100?{}:keys,sample)||false;
    if(selected.armBlocked)worksite.armImpact(selected);
    worksite.dig(selected,Math.min(.1,dt),selected.physics.damage>=100?{}:keys);
    const distance=Math.hypot(selected.drive.x-before.x,selected.drive.z-before.z)*Math.sign(selected.drive.speed);
    selected.gear.step(distance,selected.kind==='truck'?selected.drive.steer:selected.drive.yaw-before.yaw);
    worksite.step(dt);moveCamera(1-Math.exp(-dt*5));worksite.shake(camera,selected);camera.updateMatrixWorld();
    noticeTime=Math.max(0,noticeTime-dt);notice.hidden=noticeTime<=0;
    panel.querySelectorAll('[data-payload]').forEach(b=>{b.disabled=Math.abs(selected.drive.speed)>.1;b.setAttribute('aria-pressed',String(Number(b.dataset.payload)===selected.drive.payload))});
    uiTime+=dt;if(uiTime>.1){updateTelemetry();updateWorksiteUI();uiTime=0}
  }};
}
