import * as THREE from './vendor/three/build/three.module.js';

export function manualViewPreset(kind,aspect){
  const narrow=aspect<.9?Math.min(1.2,.9/Math.max(.6,aspect)):1;
  return {offset:(kind==='excavator'?[-17,8.5,12.2]:[-15.2,8.2,10.8]).map(v=>v*narrow),fov:kind==='excavator'?49:46,cabFov:72};
}

// Manual cameras own their target: dragging changes the orbit, never the followed vehicle.
export function createManualCamera(camera,controls){
  let session=null,mode='follow',saved=null,lookYaw=0,lookPitch=-.16;
  let drivingFraming=false;
  let inspection=null;
  const orbit=new THREE.Vector3(),focus=new THREE.Vector3(),q=new THREE.Quaternion();
  const keys=['enabled','enablePan','enableDamping','minDistance','maxDistance','minPolarAngle','maxPolarAngle'];
  function begin(){
    saved={near:camera.near,fov:camera.fov,position:camera.position.clone(),up:camera.up.clone(),target:controls.target.clone(),controls:Object.fromEntries(keys.map(k=>[k,controls[k]]))};
    mode='follow';controls.enableDamping=false;controls.update();controls.enablePan=false;
    controls.minDistance=8;controls.maxDistance=100;controls.minPolarAngle=.08;controls.maxPolarAngle=Math.PI*.49;
  }
  function getFocus(){return session.mesh.localToWorld(focus.set(session.kind==='excavator'?1.5:0,2,0))}
  function select(next){
    inspection=null;
    session=next;lookYaw=0;lookPitch=-.16;
    const preset=drivingFraming?manualViewPreset(session.kind,camera.aspect):null;
    orbit.fromArray(preset?.offset||[-18,11,14]).applyAxisAngle(new THREE.Vector3(0,1,0),session.drive.yaw);
    if(!preset&&camera.aspect<1)orbit.multiplyScalar(1.25);
    configure();
  }
  function configure(){
    if(!session)return;
    controls.enabled=mode==='follow';camera.up.set(0,1,0);
    const preset=drivingFraming?manualViewPreset(session.kind,camera.aspect):null;
    camera.near=mode==='cab'?.05:saved.near;camera.fov=mode==='cab'?(preset?.cabFov||80):(preset?.fov||saved.fov);camera.updateProjectionMatrix();
    if(mode==='follow'){controls.target.copy(getFocus());camera.position.copy(focus).add(orbit);controls.update()}
    update();
  }
  function setMode(next){
    if(!session)return;
    if(mode==='follow'&&!inspection)orbit.subVectors(camera.position,controls.target);
    inspection=null;
    mode=next==='cab'?'cab':'follow';lookYaw=0;lookPitch=-.16;configure();
  }
  function update(){
    if(!session)return;
    session.mesh.updateWorldMatrix(true,true);
    if(inspection){controls.target.copy(inspection);controls.update();camera.updateMatrixWorld();return}
    if(mode==='follow'){
      // Apply the exact displacement, including while OrbitControls is dragging.
      getFocus();camera.position.add(new THREE.Vector3().subVectors(focus,controls.target));controls.target.copy(focus);controls.update();
    }else{
      const parent=session.rig?.frames.upper||session.mesh;
      const eye=session.kind==='excavator'?new THREE.Vector3(.18,2.98,.66):new THREE.Vector3(2.10,4.48,1.40);
      camera.position.copy(parent.localToWorld(eye));parent.getWorldQuaternion(q);
      const direction=new THREE.Vector3(Math.cos(lookPitch)*Math.cos(lookYaw),Math.sin(lookPitch),-Math.cos(lookPitch)*Math.sin(lookYaw)).applyQuaternion(q);
      camera.up.set(0,1,0).applyQuaternion(q);camera.lookAt(camera.position.clone().add(direction));
    }
    camera.updateMatrixWorld();
  }
  function stopInspection(){if(inspection){inspection=null;configure()}}
  function inspectRockfall(hazard){
    if(!session||!hazard.position||!hazard.source)return false;
    if(!inspection&&mode==='follow')orbit.subVectors(camera.position,controls.target);
    const p=hazard.position,s=hazard.source,dx=s.x-p.x,dz=s.z-p.z,length=Math.hypot(dx,dz)||1,scale=camera.aspect<.9?1.2:1;
    inspection=new THREE.Vector3((p.x+s.x)*.5,p.y+(s.y-p.y)*.45,(p.z+s.z)*.5);
    camera.position.set(inspection.x+(-dx/length*22-dz/length*32)*scale,inspection.y+28*scale,inspection.z+(-dz/length*22+dx/length*32)*scale);
    camera.up.set(0,1,0);camera.near=.1;camera.fov=52;camera.updateProjectionMatrix();controls.enabled=true;update();return true;
  }
  return {begin,select,setMode,update,inspectRockfall,stopInspection,get inspecting(){return !!inspection},useDrivingFraming(){drivingFraming=true;if(session)select(session)},get mode(){return mode},look(dx,dy){
    if(inspection)return;
    lookYaw=THREE.MathUtils.clamp(lookYaw-dx*.004,-1.8,1.8);lookPitch=THREE.MathUtils.clamp(lookPitch-dy*.004,-.9,.65);update();
  },end(){
    if(!saved)return;inspection=null;session=null;Object.assign(controls,saved.controls);camera.near=saved.near;camera.fov=saved.fov;camera.up.copy(saved.up);camera.position.copy(saved.position);controls.target.copy(saved.target);camera.updateProjectionMatrix();controls.update();saved=null;mode='follow';
  }};
}
