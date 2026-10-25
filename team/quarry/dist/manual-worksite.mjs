import * as THREE from './vendor/three/build/three.module.js';
import {groundPose} from './manual-core.mjs?v=4';
import {BODY,hull,boxContact,contactImpulse,damageFromImpact,OrePatch,advanceOre,bedEntry,ORE_DENSITY,BUCKET_CAPACITY,TRUCK_CAPACITY} from './manual-physics-core.mjs?v=4';
import {createRockfalls} from './manual-rockfalls.mjs?v=rockfall-2';

export function createManualWorksite({scene,sessions,sample,orient,blockers,onNotice,roadRoute=[]}){
  const root=new THREE.Group();root.name='Manual / physical worksite';scene.add(root);
  const stoneGeo=new THREE.DodecahedronGeometry(1,0),oreMat=new THREE.MeshStandardMaterial({color:0x716149,roughness:1,flatShading:true});
  const chunks=new THREE.InstancedMesh(stoneGeo,oreMat,600);chunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);chunks.frustumCulled=false;root.add(chunks);
  const aimGeo=new THREE.RingGeometry(.35,.48,32),aimMat=new THREE.MeshBasicMaterial({color:0xd29c42,side:THREE.DoubleSide,depthWrite:false});
  const aim=new THREE.Mesh(aimGeo,aimMat);aim.rotation.x=-Math.PI/2;aim.visible=false;root.add(aim);
  const dummy=new THREE.Object3D(),particles=Array(600).fill(null),patches=[],ownedGeometries=new Set(),marks=[],zero=new THREE.Vector3(),shakeOffset=new THREE.Vector3();
  let elapsed=0,serial=0,lastNotice=-10;
  const rockfalls=createRockfalls({root,sample,route:roadRoute,onNotice,occupied(x,y,z,radius){
    return [...sessions.values()].some(s=>Math.abs(s.drive.y-y)<8&&Math.hypot(s.drive.x-x,s.drive.z-z)<radius+Math.hypot(BODY[s.kind].length,BODY[s.kind].width))||blockers.some(b=>y+5>b.min.y&&y<b.max.y&&x+radius>b.min.x&&x-radius<b.max.x&&z+radius>b.min.z&&z-radius<b.max.z);
  }});
  function notice(text){if(elapsed-lastNotice>.8){onNotice(text);lastNotice=elapsed}}
  function attach(s){
    s.physics={vx:0,vz:0,mass:BODY[s.kind].mass,damage:0,shock:0,lastHit:-10,lock:0};s.ore=s.kind==='truck'&&s.drive.payload?TRUCK_CAPACITY:0;
    if(s.rig){const fill=new THREE.Mesh(stoneGeo,oreMat);fill.name='Ore in bucket';fill.position.set(-.65,-.32,0);fill.scale.set(.65,.25,.47);fill.visible=false;s.rig.frames.bucket.add(fill);s.bucketFill=fill;s.bucketOre=0}
    if(s.kind==='truck'){
      const nx=16,nz=12,positions=[],weights=[],indices=[];let integral=0;
      for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const u=i/nx,v=j/nz;positions.push(-4.05+4.5*u,3.17,-2.05+4.1*v);weights.push((Math.sin(Math.PI*u)*Math.sin(Math.PI*v))**.5*(.85+.15*Math.sin(i*13+j*19)))}
      for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;indices.push(a,c,b,b,c,d);integral+=(weights[a]+weights[b]*2+weights[c]*2+weights[d])/6*(4.5/nx)*(4.1/nz)}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
      s.cargoFill=new THREE.Mesh(geometry,oreMat);s.cargoFill.name='Physical ore heap';s.cargoWeights=weights.map(w=>w/integral);s.mesh.add(s.cargoFill);ownedGeometries.add(geometry);
    }
    cargo(s);
  }
  function cargo(s){
    if(s.kind!=='truck')return;
    s.drive.setLoadFraction(s.ore/TRUCK_CAPACITY);s.physics.mass=BODY.truck.mass+s.ore*ORE_DENSITY;
    const mesh=s.mesh.getObjectByName('Truck cargo');if(mesh)mesh.visible=false;
    if(s.cargoFill){s.cargoFill.visible=s.ore>.001;const g=s.cargoFill.geometry,a=g.attributes.position;for(let i=0;i<a.count;i++)a.setY(i,3.17+s.ore*s.cargoWeights[i]);a.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere()}
  }
  function patchAt(x,z){return patches.find(p=>Math.hypot(x-p.data.x,z-p.data.z)<p.data.radius+1)}
  function addPatch(x,z){
    if(patchAt(x,z))return;
    const base=sample(x,z);if(!Number.isFinite(base))return;
    const data=new OrePatch(x,z,base),positions=[],colors=[],indices=[];
    for(let j=0;j<data.n;j++)for(let i=0;i<data.n;i++){positions.push(x-data.radius+i*data.step,base,z-data.radius+j*data.step);const c=.75+.18*Math.sin(i*17+j*31)**2;colors.push(c,c*.91,c*.77)}
    for(let j=0;j<data.n-1;j++)for(let i=0;i<data.n-1;i++){const a=j*data.n+i;if(Math.max(data.heights[a],data.heights[a+1],data.heights[a+data.n],data.heights[a+data.n+1])>.015)indices.push(a,a+data.n,a+1,a+1,a+data.n,a+data.n+1)}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);
    const material=oreMat.clone();material.vertexColors=true;const mesh=new THREE.Mesh(geometry,material);mesh.name='Diggable ore / finite volume';root.add(mesh);
    patches.push({data,mesh,revision:-1});refreshPatches();
  }
  function refreshPatches(){for(const p of patches){if(p.revision===p.data.revision)continue;const attr=p.mesh.geometry.attributes.position;for(let i=0;i<attr.count;i++)attr.setY(i,p.data.base+Math.max(.012,p.data.heights[i]));attr.needsUpdate=true;p.mesh.geometry.computeVertexNormals();p.mesh.geometry.computeBoundingSphere();p.revision=p.data.revision}}
  function surface(x,z){const base=sample(x,z);if(!Number.isFinite(base))return null;let y=base;for(const p of patches)y=Math.max(y,p.data.heightAt(x,z));return y}
  function start(){for(const s of sessions.values())if(s.rig){const p=s.mesh.localToWorld(new THREE.Vector3(5.5,0,-.36));addPatch(p.x,p.z)}}
  function body(s,x=s.drive.x,z=s.drive.z,yaw=s.drive.yaw){return hull({...s.drive,x,z,yaw},s.kind)}
  function collision(s,x,z,yaw){
    const a=body(s,x,z,yaw);
    for(const other of sessions.values()){
      if(other===s)continue;const contact=boxContact(a,body(other));
      if(contact)return {...contact,other};
      if(other.rig){
        const joints=['boom','stick','bucket'].map(k=>other.rig.frames[k].getWorldPosition(new THREE.Vector3()));
        for(let segment=0;segment<2;segment++)for(let i=0;i<=20;i++){
          const p=joints[segment].clone().lerp(joints[segment+1],i/20),hit=boxContact(a,{x:p.x,z:p.z,y:p.y-.25,height:.5,length:.32,width:.4,yaw:0});
          if(hit)return {...hit,other};
        }
        for(const x of [-1.8,-1,-.2]){const p=other.rig.frames.bucket.localToWorld(new THREE.Vector3(x,-.35,0)),hit=boxContact(a,{x:p.x,z:p.z,y:p.y-.4,height:.8,length:.4,width:.65,yaw:other.drive.yaw+other.rig.state.slew});if(hit)return {...hit,other}}
      }
    }
    for(const box of blockers){
      const contact=boxContact(a,{x:(box.min.x+box.max.x)/2,z:(box.min.z+box.max.z)/2,y:box.min.y,height:box.max.y-box.min.y,length:(box.max.x-box.min.x)/2,width:(box.max.z-box.min.z)/2,yaw:0});
      if(contact)return {...contact,other:null};
    }
    return rockfalls.collision(a);
  }
  function scar(s,point,normal,strength){
    let best=null,bestDistance=Infinity;
    s.mesh.traverse(o=>{
      if(!o.isMesh||o.isInstancedMesh||!o.visible||o===s.bucketFill||o===s.cargoFill||o.name==='Truck cargo'||/tyre|glazing|wheel|crawler|pins|hoses/i.test(o.name))return;
      const a=o.geometry?.attributes.position;if(!a)return;
      const local=o.worldToLocal(point.clone());
      for(let i=0;i<a.count;i+=3){const d=new THREE.Vector3().fromBufferAttribute(a,i).distanceToSquared(local);if(d<bestDistance){bestDistance=d;best={mesh:o,local,index:i}}}
    });
    if(!best)return;
    const mesh=best.mesh;if(!mesh.userData.manualDent){mesh.geometry=mesh.geometry.clone();mesh.userData.manualDent=true;ownedGeometries.add(mesh.geometry)}
    const attr=mesh.geometry.attributes.position,hit=new THREE.Vector3().fromBufferAttribute(attr,best.index),direction=mesh.worldToLocal(point.clone().add(normal)).sub(mesh.worldToLocal(point.clone())).normalize();
    const depth=Math.min(.35,.035+strength*.006);
    for(let i=0;i<attr.count;i++){const v=new THREE.Vector3().fromBufferAttribute(attr,i),r=v.distanceTo(hit);if(r<1.15){v.addScaledVector(direction,-depth*(1-r/1.15));attr.setXYZ(i,v.x,v.y,v.z)}}
    hit.addScaledVector(direction,-depth);
    attr.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();
    const scratch=new THREE.Group();scratch.name='Impact scratches';const mat=new THREE.MeshStandardMaterial({color:0x3b3027,roughness:.9,side:THREE.DoubleSide});
    const geo=new THREE.BoxGeometry(.025,.06,.7);for(let i=0;i<4;i++){const line=new THREE.Mesh(geo,mat);line.position.y=(i-1.5)*.13;line.rotation.x=.18*i;scratch.add(line)}
    scratch.position.copy(mesh.localToWorld(hit.clone())).addScaledVector(normal,.025);scratch.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),normal);root.add(scratch);s.mesh.attach(scratch);marks.push({scratch,geo,mat});
  }
  function impact(s,contact,speed,direction=null){
    const a=s.physics,other=contact?.other,b=other?.physics||{vx:0,vz:0,mass:Infinity};
    const normal=contact?.normal||{x:-Math.cos(s.drive.yaw)*Math.sign(speed||1),z:Math.sin(s.drive.yaw)*Math.sign(speed||1)};
    a.vx+=(direction?.x??Math.cos(s.drive.yaw))*speed;a.vz+=(direction?.z??-Math.sin(s.drive.yaw))*speed;
    const result=contactImpulse(a,b,normal);s.drive.speed=0;
    if(other)other.drive.speed=0;
    a.lock=.45;if(other)b.lock=.45;
    if(result.closing<.6||elapsed-a.lastHit<.6)return;
    a.lastHit=elapsed;
    for(const target of [s,other].filter(Boolean)){
      const p=target.physics,damage=damageFromImpact(result.energy,p.mass);p.damage=Math.min(100,p.damage+damage);p.shock=Math.min(1,result.closing/8);
      const outward=new THREE.Vector3(normal.x,0,normal.z).multiplyScalar(target===s?-1:1);
      const from=target.mesh.position.clone().add(new THREE.Vector3(0,1.6,0));
      const extent=target.kind==='truck'?3.3:2;from.addScaledVector(outward,extent);scar(target,from,outward,damage);
    }
    notice(`Удар ${Math.round(result.closing*3.6)} км/ч · повреждение ${s.physics.damage.toFixed(1)}%`);
  }
  function moveImpulse(s,dt){
    const p=s.physics;p.lock=Math.max(0,p.lock-dt);p.shock=Math.max(0,p.shock-dt*1.8);
    const speed=Math.hypot(p.vx,p.vz);if(speed<.02){p.vx=p.vz=0;return}
    const steps=Math.max(1,Math.ceil(speed*dt/.12));
    for(let i=0;i<steps;i++){
      const x=s.drive.x+p.vx*dt/steps,z=s.drive.z+p.vz*dt/steps,pose=groundPose(x,z,s.drive.yaw,s.kind,surface),hit=collision(s,x,z,s.drive.yaw);
      if(!pose||Math.abs(pose.height-s.drive.y)>.5){p.vx=p.vz=0;break}
      if(hit){
        const approaching=p.vx*hit.normal.x+p.vz*hit.normal.z<0;
        if(approaching){impact(s,hit,0);break}
      }
      Object.assign(s.drive,{x,z,y:pose.height,pitch:pose.pitch,roll:pose.roll});
    }
    const factor=Math.max(0,1-3.5*dt/speed);p.vx*=factor;p.vz*=factor;
  }
  // Check working equipment against actual truck metal, keeping the loading opening clear.
  function armClear(s){
    if(!s.rig)return true;
    s.armContact=null;
    const points=[];for(const p of [[-.1,0,0],[-.8,-.4,0],[-1.8,-.61,0]])for(const side of [-.55,.55])points.push(s.rig.frames.bucket.localToWorld(new THREE.Vector3(p[0],p[1],side)));
    const a=s.rig.frames.boom.getWorldPosition(new THREE.Vector3()),b=s.rig.frames.stick.getWorldPosition(new THREE.Vector3()),c=s.rig.frames.bucket.getWorldPosition(new THREE.Vector3());
    for(let i=0;i<=12;i++){points.push(a.clone().lerp(b,i/12));points.push(b.clone().lerp(c,i/12))}
    for(const other of sessions.values()){
      if(other===s)continue;
      for(const point of points){
        const p=other.mesh.worldToLocal(point.clone());
        if(other.kind==='truck'){
          if(p.x < -4.65||p.x>4.8||Math.abs(p.z)>2.95||p.y<.1||p.y>5.8)continue;
          const chassis=p.y<3.2,side=p.x<1.3&&p.y<4.8&&Math.abs(p.z)>2.2;
          const front=p.x>.7&&p.y>3.1&&(p.y>5.25||(p.x<3.2&&p.z>.58&&p.y<5.12)||p.x<1.4);
          if(chassis||side||front){const n=point.clone().sub(other.mesh.position);n.y=0;n.normalize();s.armContact={other,normal:{x:n.x,z:n.z},point:point.clone()};return false}
        }else if(Math.abs(p.x)<2.7&&Math.abs(p.z)<1.65&&p.y<3.65&&p.y>0){const n=point.clone().sub(other.mesh.position);n.y=0;n.normalize();s.armContact={other,normal:{x:n.x,z:n.z},point:point.clone()};return false}
      }
    }
    return true;
  }
  function dig(s,dt,keys){
    aim.visible=!!s.rig;if(!s.rig)return;
    const bucket=s.rig.frames.bucket,center=bucket.localToWorld(new THREE.Vector3(-.8,-.35,0));
    const lip=bucket.localToWorld(new THREE.Vector3(-1.65,-.56,0));let targetHeight=surface(lip.x,lip.z);s.loadingTarget=null;
    for(const truck of sessions.values())if(truck.kind==='truck'){
      const local=truck.mesh.worldToLocal(lip.clone());if(local.x>-4.3&&local.x<.7&&Math.abs(local.z)<2.25&&local.y>4.8){s.loadingTarget=truck.label;targetHeight=truck.mesh.localToWorld(new THREE.Vector3(local.x,4.72,local.z)).y}
    }
    aim.position.set(lip.x,(targetHeight??s.drive.y)+.03,lip.z);aimMat.color.set(s.loadingTarget?0x5bd08a:0xd29c42);
    if(keys.bucket<0&&!s.armBlocked&&s.bucketOre<BUCKET_CAPACITY){
      let budget=Math.min(BUCKET_CAPACITY-s.bucketOre,dt*1.4),taken=0;
      for(const p of patches){const volume=p.data.dig(center,.9,budget-taken);taken+=volume}
      taken+=rockfalls.dig(center,.9,budget-taken);
      for(let i=0;i<particles.length;i++){const p=particles[i];if(p?.settled&&Math.hypot(p.x-center.x,p.y-center.y,p.z-center.z)<1){const amount=Math.min(p.volume,budget-taken);taken+=amount;p.volume-=amount;if(p.volume<=0)particles[i]=null}}
      s.bucketOre+=taken;if(taken>0)notice('Ковш набирает руду · поднимите стрелу R');
    }
    // Opening the lip releases discrete parcels. Every parcel falls under gravity before it can load a truck.
    if(keys.bucket>0&&s.rig.state.bucket>-.15&&s.bucketOre>.00001){
      let amount=Math.min(s.bucketOre,dt*1.8);
      while(amount>.00001){
        const slot=particles.indexOf(null);if(slot<0)break;
        const volume=Math.min(.045,amount),lip=bucket.localToWorld(new THREE.Vector3(-1.65,-.56,((serial++%7)-3)*.13));
        const dir=new THREE.Vector3(-1,-.4,0).transformDirection(bucket.matrixWorld);
        particles[slot]={x:lip.x,y:lip.y,z:lip.z,vx:dir.x*.65,vy:Math.min(0,dir.y*.65),vz:dir.z*.65,volume,settled:false,bounces:0};s.bucketOre-=volume;amount-=volume;
      }
    }
    s.bucketFill.visible=s.bucketOre>.001;s.bucketFill.scale.y=.25*Math.cbrt(s.bucketOre/BUCKET_CAPACITY);
  }
  function updateParticles(dt){
    for(let i=0;i<particles.length;i++){
      const p=particles[i];if(!p||p.settled)continue;
      const steps=Math.max(1,Math.ceil(Math.abs(p.vy)*dt/.25));
      for(let j=0;j<steps&&particles[i]&&!p.settled;j++){
        const before=advanceOre(p,dt/steps);
        for(const s of sessions.values()){
          if(s.kind!=='truck')continue;
          const a=s.mesh.worldToLocal(new THREE.Vector3(before.x,before.y,before.z)),b=s.mesh.worldToLocal(new THREE.Vector3(p.x,p.y,p.z));
          if(bedEntry(a,b)){
            const accepted=Math.min(p.volume,TRUCK_CAPACITY-s.ore);s.ore+=accepted;p.volume-=accepted;cargo(s);
            if(accepted>0)notice(`Руда в кузове ${s.label}: ${(s.ore*ORE_DENSITY/1000).toFixed(1)} т`);
            if(p.volume<.00001){particles[i]=null;break}
            const side=b.z>=0?1:-1,outside=s.mesh.localToWorld(new THREE.Vector3(b.x,4.85,side*3.05)),velocity=new THREE.Vector3(0,0,side).transformDirection(s.mesh.matrixWorld);
            p.x=outside.x;p.y=outside.y;p.z=outside.z;p.vx=velocity.x;p.vz=velocity.z;p.vy=.4;
          }
          if(b.x>-4.65&&b.x<4.8&&Math.abs(b.z)<2.92&&b.y>0&&b.y<5.8){
            // Metal outside the open box deflects missed material instead of awarding cargo.
            const outside=b.x>.7||Math.abs(b.z)>2.25;
            if(outside&&b.y<4.8){const v=new THREE.Vector3(0,0,b.z>=0?1:-1).transformDirection(s.mesh.matrixWorld);p.vx=v.x*.8;p.vz=v.z*.8;p.y=Math.max(p.y,s.mesh.localToWorld(new THREE.Vector3(b.x,4.8,b.z)).y)}
          }
        }
        if(!particles[i])break;
        const ground=surface(p.x,p.z);if(Number.isFinite(ground)&&p.y<ground+.11){p.y=ground+.11;if(p.bounces++===0&&Math.abs(p.vy)>1.5){p.vy=-p.vy*.16;p.vx*=.45;p.vz*=.45}else{p.settled=true;p.vx=p.vy=p.vz=0}}
      }
    }
    for(let i=0;i<particles.length;i++){const p=particles[i];if(p){dummy.position.set(p.x,p.y,p.z);const size=Math.cbrt(p.volume)*.55;dummy.scale.set(size,size*.8,size);dummy.rotation.set(i*.73,elapsed*(p.settled?0:2)+i,i*.31)}else{dummy.position.copy(zero);dummy.scale.setScalar(0)}dummy.updateMatrix();chunks.setMatrixAt(i,dummy.matrix)}chunks.instanceMatrix.needsUpdate=true;
  }
  function prepare(){
    const exc=[...sessions.values()].find(s=>s.rig),truck=[...sessions.values()].find(s=>s.kind==='truck');if(!exc||!truck)return null;
    for(const s of [exc,truck]){s.drive.speed=0;s.physics.vx=s.physics.vz=0;s.rig?.reset()}
    const [x,,z]=exc.initial.position;
    Object.assign(exc.drive,{x,z,y:sample(x,z)+.08,yaw:0,pitch:0,roll:0});orient(exc);
    Object.assign(truck.drive,{x:x+1.7,z:z-6.7,y:sample(x+1.7,z-6.7)+.08,yaw:0,pitch:0,roll:0});orient(truck);
    addPatch(x+5.5,z-.36);truck.ore=0;cargo(truck);notice('Площадка готова: Y — набрать ковш, R и T — поднять, Q — к кузову, H — высыпать');return exc.id;
  }
  function step(dt){
    dt=Math.min(.1,dt);elapsed+=dt;
    for(const s of sessions.values()){
      const before={...s.drive};moveImpulse(s,dt);orient(s);
      const distance=Math.hypot(s.drive.x-before.x,s.drive.z-before.z);if(distance>.0001)s.gear.step(distance*Math.sign((s.drive.x-before.x)*Math.cos(s.drive.yaw)-(s.drive.z-before.z)*Math.sin(s.drive.yaw)));
      if(s.physics.shock>0){s.mesh.rotateZ(Math.sin(elapsed*36)*s.physics.shock*.035);s.mesh.updateMatrixWorld(true)}
    }
    refreshPatches();updateParticles(dt);rockfalls.step(dt);
  }
  function reset(s){s.physics.vx=s.physics.vz=s.physics.shock=s.physics.lock=0}
  function dispose(){
    rockfalls.dispose();
    for(const p of patches){p.mesh.geometry.dispose();p.mesh.material.dispose()}
    for(const g of ownedGeometries)g.dispose();for(const m of marks){m.geo.dispose();m.mat.dispose()}
    aimGeo.dispose();aimMat.dispose();chunks.dispose();stoneGeo.dispose();oreMat.dispose();scene.remove(root);
  }
  return {attach,start,surface,collision,impact,armClear,dig,step,prepare,reset,dispose,cargo,setCargo(s,full){s.ore=full?TRUCK_CAPACITY:0;cargo(s)},
    // The rig already restores its last clear pose. A stalled hydraulic actuator adds no chassis momentum.
    armImpact(s){if(s.armContact)notice('Гидравлика в упоре: поворот остановлен. Отведите стрелу назад или поднимите её.');},
    requestRockfall(s){return rockfalls.request(s)},focusRockfalls(s){rockfalls.focus(s)},setAutomaticRockfalls(value){rockfalls.setAutomatic(value)},rockfallReport(){return rockfalls.report()},
    report(s){return {damage:Number(s.physics.damage.toFixed(1)),bucket:s.bucketOre||0,ore:s.ore||0,remaining:patches.reduce((a,p)=>a+p.data.initial-p.data.removed,0)}},
    inventory(){return {soil:patches.reduce((a,p)=>a+p.data.initial-p.data.removed,0),buckets:[...sessions.values()].reduce((a,s)=>a+(s.bucketOre||0),0),trucks:[...sessions.values()].reduce((a,s)=>a+(s.ore||0),0),loose:particles.reduce((a,p)=>a+(p?.volume||0),0)+rockfalls.report().remaining}},
    clearShake(camera){camera.position.sub(shakeOffset);shakeOffset.set(0,0,0)},
    shake(camera,s){const strength=s.physics.shock;if(strength>0){shakeOffset.set(Math.sin(elapsed*49)*strength*.09,Math.sin(elapsed*37)*strength*.07,0);camera.position.add(shakeOffset);camera.updateMatrixWorld()}}
  };
}
