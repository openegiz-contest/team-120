import * as THREE from './vendor/three/build/three.module.js';
import {boxContact} from './manual-physics-core.mjs?v=4';

// Use the road's real elevation and an adjoining higher rock face, never a different terrace.
export function findRockfallSite(route,drive,sample,occupied){
  const candidates=[];
  for(let i=2;i<route.length-2;i+=2){
    const [,x,y,z]=route[i],distance=Math.hypot(x-drive.x,z-drive.z);
    if(distance<18||distance>95||Math.abs(y-drive.y)>10||occupied(x,y,z,13))continue;
    const before=route[i-2],after=route[i+2],length=Math.hypot(after[1]-before[1],after[3]-before[3]);if(length<.01)continue;
    const tx=(after[1]-before[1])/length,tz=(after[3]-before[3])/length,nx=-tz,nz=tx,ground=sample(x,z);
    if(!Number.isFinite(ground)||Math.abs(ground-y)>.8)continue;
    const pads=[-4,-2,0,2,4].map(w=>sample(x+nx*w,z+nz*w));
    if(pads.some(h=>!Number.isFinite(h)||Math.abs(h-ground)>1))continue;
    let source=null;
    for(const side of [-1,1]){
      for(const offset of [8,12,16,22,28]){
        const sx=x+nx*side*offset,sz=z+nz*side*offset,sy=sample(sx,sz);
        if(Number.isFinite(sy)&&sy-ground>=4&&sy-ground<=30){source={x:sx,y:sy+.8,z:sz};break}
      }
      if(source)break;
    }
    if(!source)continue;
    const ahead=(x-drive.x)*Math.cos(drive.yaw)-(z-drive.z)*Math.sin(drive.yaw);
    candidates.push({x,z,y:ground,tx,tz,nx,nz,source,score:Math.abs(distance-30)+(ahead<0?25:0)});
  }
  return candidates.sort((a,b)=>a.score-b.score)[0]||null;
}

export function createRockfalls({root,sample,occupied,onNotice,route=[]}){
  const group=new THREE.Group();group.name='Rockfall / finite removable rubble';root.add(group);
  const geometry=new THREE.DodecahedronGeometry(1,0),material=new THREE.MeshStandardMaterial({color:0x756c5b,roughness:1,flatShading:true});
  const markerGeometry=new THREE.RingGeometry(5.5,5.75,48),markerMaterial=new THREE.MeshBasicMaterial({color:0xe9a341,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false});
  const marker=new THREE.Mesh(markerGeometry,markerMaterial);marker.rotation.x=-Math.PI/2;marker.visible=false;group.add(marker);
  const safetyGeometry=new THREE.RingGeometry(12.8,13,64),safetyMaterial=markerMaterial.clone(),safetyMarker=new THREE.Mesh(safetyGeometry,safetyMaterial);safetyMarker.rotation.x=-Math.PI/2;safetyMarker.visible=false;safetyMarker.name='Rockfall / keep-clear boundary';group.add(safetyMarker);
  const dustGeometry=new THREE.IcosahedronGeometry(1,1),dustMaterial=new THREE.MeshBasicMaterial({color:0xb3a38a,transparent:true,opacity:0,depthWrite:false});
  const dust=new THREE.InstancedMesh(dustGeometry,dustMaterial,16);dust.visible=false;dust.frustumCulled=false;group.add(dust);
  const dummy=new THREE.Object3D(),rocks=[];
  const precursors=new THREE.InstancedMesh(dustGeometry,material,18);precursors.name='Rockfall / warning fragments';precursors.visible=false;precursors.frustumCulled=false;precursors.castShadow=true;group.add(precursors);
  let phase='idle',site=null,timer=0,age=0,cooldown=90,focus=null,automatic=true,dustAge=10,added=0;
  function radius(rock){return Math.cbrt(rock.volume)*.75}
  function request(s){
    if(!['idle','cleared'].includes(phase))return false;
    const next=findRockfallSite(route,s.drive,sample,occupied);
    if(!next){onNotice('Рядом нет свободного участка под скальным бортом. Подъедьте к серпантину.');return false}
    for(const rock of rocks)group.remove(rock.mesh);rocks.length=0;
    site=next;phase='warning';timer=6;age=0;
    marker.position.set(site.x,site.y+.08,site.z);marker.visible=true;
    const vertices=markerGeometry.attributes.position;
    for(let i=0;i<vertices.count;i++){const height=sample(site.x+vertices.getX(i),site.z-vertices.getY(i));vertices.setZ(i,(Number.isFinite(height)?height:site.y)-site.y)}
    vertices.needsUpdate=true;markerGeometry.computeBoundingSphere();
    safetyMarker.position.copy(marker.position);safetyMarker.visible=true;const boundary=safetyGeometry.attributes.position;
    for(let i=0;i<boundary.count;i++){const h=sample(site.x+boundary.getX(i),site.z-boundary.getY(i));boundary.setZ(i,(Number.isFinite(h)?h:site.y)-site.y)}boundary.needsUpdate=true;safetyGeometry.computeBoundingSphere();
    onNotice('Камнепад через 6 секунд! Остановитесь перед оранжевой зоной.');return true;
  }
  function beginFall(){
    phase='falling';age=0;
    for(let i=0;i<22;i++){
      const angle=i*2.39996323,spread=Math.sqrt((i+.5)/22),w=4.5*Math.sin(angle)*spread,along=2*Math.cos(angle)*spread;
      const x=site.x+site.nx*w+site.tx*along,z=site.z+site.nz*w+site.tz*along;
      const volume=.18+(i%6)*.11,mesh=new THREE.Mesh(geometry,material),r=Math.cbrt(volume)*.75;
      const targetY=sample(x,z)+r*.8,from={x:site.source.x+site.tx*along,y:site.source.y+(i%3)*.3,z:site.source.z+site.tz*along};
      const duration=Math.sqrt(2*(from.y-targetY)/9.81),rock={mesh,volume,x,z,y:targetY,from,duration,delay:i*.065,settled:false};
      mesh.position.set(from.x,from.y,from.z);mesh.scale.set(r,r*.8,r);group.add(mesh);rocks.push(rock);added+=volume;
      mesh.castShadow=true;mesh.receiveShadow=true;
    }
    onNotice('Камни падают на дорогу. Дождитесь окончания камнепада.');
  }
  function collision(body){
    if(phase==='falling'){
      const hit=boxContact(body,{x:site.x,z:site.z,y:site.y-.5,height:8,length:3,width:5.2,yaw:Math.atan2(-site.tz,site.tx)});
      if(hit)return {...hit,other:null,rockfall:true};
    }
    for(const rock of rocks){
      if(!rock.settled||rock.volume<=0)continue;
      const r=radius(rock),hit=boxContact(body,{x:rock.x,z:rock.z,y:rock.y-r*.8,height:r*1.6,length:r,width:r,yaw:0});
      if(hit)return {...hit,other:null,rockfall:true};
    }
    return null;
  }
  function dig(center,reach,capacity){
    if(phase!=='blocked'||capacity<=0)return 0;
    let taken=0;
    for(const rock of rocks){
      if(rock.volume<=0||Math.hypot(center.x-rock.x,center.y-rock.y,center.z-rock.z)>reach+radius(rock))continue;
      const amount=Math.min(rock.volume,capacity-taken);rock.volume-=amount;taken+=amount;
      const r=radius(rock);rock.y=sample(rock.x,rock.z)+r*.8;rock.mesh.position.y=rock.y;rock.mesh.scale.set(r,r*.8,r);rock.mesh.visible=rock.volume>0;
      if(taken>=capacity)break;
    }
    if(rocks.every(r=>r.volume<=0)){phase='cleared';marker.visible=false;cooldown=120;onNotice('Завал расчищен. Проезд открыт.');}
    return taken;
  }
  function step(dt){
    dt=Math.min(.1,Math.max(0,dt));age+=dt;
    if(automatic&&focus&&['idle','cleared'].includes(phase)){cooldown-=dt;if(cooldown<=0){cooldown=30;request(focus)}}
    if(phase==='warning'){
      timer=Math.max(0,timer-dt);
      if(timer===0&&!occupied(site.x,site.y,site.z,13))beginFall();
    }else if(phase==='falling'){
      for(const rock of rocks){
        const t=Math.max(0,age-rock.delay),u=Math.min(1,t/rock.duration);
        rock.mesh.position.set(THREE.MathUtils.lerp(rock.from.x,rock.x,u),Math.max(rock.y,rock.from.y-4.905*t*t),THREE.MathUtils.lerp(rock.from.z,rock.z,u));
        if(t>=rock.duration){
          if(!rock.settled)dustAge=0;
          rock.settled=true;rock.mesh.position.y=rock.y+Math.max(0,Math.sin((t-rock.duration)*12))*.12*Math.exp(-(t-rock.duration)*5);
        }else rock.mesh.rotation.set(t*2+rock.delay*13,t*.8,t*1.3);
      }
      if(rocks.every(r=>r.settled)&&age>Math.max(...rocks.map(r=>r.duration+r.delay))+.7){phase='blocked';for(const r of rocks)r.mesh.position.set(r.x,r.y,r.z);onNotice('Дорога завалена. Подберите камни экскаватором: Y, затем выгрузите H.');}
    }
    markerMaterial.opacity=.55+.25*Math.sin(age*5);markerMaterial.color.set(phase==='blocked'?0xd16d37:0xe9a341);
    safetyMarker.visible=phase==='warning'||phase==='falling';safetyMaterial.opacity=.3+.1*Math.sin(age*5);
    precursors.visible=phase==='warning';
    if(precursors.visible){
      const dx=site.x-site.source.x,dz=site.z-site.source.z,length=Math.hypot(dx,dz)||1;
      for(let i=0;i<18;i++){
        const cycle=(age*.6+i*.137)%1,along=Math.sin(i*2.4)*2.4,drop=Math.min(2.8,(site.source.y-site.y)*.32)*cycle*cycle;
        dummy.position.set(site.source.x+site.tx*along+dx/length*(.3+cycle*.45),site.source.y-drop,site.source.z+site.tz*along+dz/length*(.3+cycle*.45));
        dummy.rotation.set(age*2+i,i*.7,age+i);dummy.scale.setScalar(.04+(i%4)*.018);dummy.updateMatrix();precursors.setMatrixAt(i,dummy.matrix);
      }precursors.instanceMatrix.needsUpdate=true;
    }
    dustAge+=dt;dust.visible=dustAge<3;
    if(dust.visible){dustMaterial.opacity=.12*(1-dustAge/3);for(let i=0;i<16;i++){const a=i*2.4;dummy.position.set(site.x+Math.cos(a)*(1+dustAge)*2,site.y+.5+dustAge*.6,site.z+Math.sin(a)*(1+dustAge)*2);dummy.scale.setScalar(.6+dustAge*.4);dummy.updateMatrix();dust.setMatrixAt(i,dummy.matrix)}dust.instanceMatrix.needsUpdate=true}
    if(phase==='warning'){
      dust.visible=true;dustMaterial.opacity=.08;
      for(let i=0;i<16;i++){const t=(age*.3+i*.17)%1,a=i*2.4;dummy.position.set(site.source.x+site.tx*Math.cos(a)*2,site.source.y+.2-t,site.source.z+site.tz*Math.cos(a)*2);dummy.scale.setScalar(.35+t*.7);dummy.updateMatrix();dust.setMatrixAt(i,dummy.matrix)}dust.instanceMatrix.needsUpdate=true;
    }
  }
  return {request,step,collision,dig,focus(s){focus=s},setAutomatic(value){automatic=!!value},
    report(){return {phase,seconds:Math.ceil(timer),remaining:rocks.reduce((sum,r)=>sum+r.volume,0),added,position:site?{x:site.x,y:site.y,z:site.z}:null,source:site?{...site.source}:null,waitingForClearance:phase==='warning'&&timer===0}},
    dispose(){geometry.dispose();material.dispose();markerGeometry.dispose();markerMaterial.dispose();safetyGeometry.dispose();safetyMaterial.dispose();dustGeometry.dispose();dustMaterial.dispose();dust.dispose();precursors.dispose();root.remove(group)}
  };
}
