import * as THREE from './vendor/three/build/three.module.js';
const point=(x,y,z)=>new THREE.Vector3(x,z,-y);
const P={boom:point(1.12,.36,1.93),stick:point(5.96,.36,4.40),bucket:point(6.21,.36,1.04)};
export const JOINT_LIMITS={boom:[-.32,.85],stick:[-1,.65],bucket:[-1.15,1.15]};

export function createExcavatorRig(root){
  let contactCheck=()=>true;
  const upper=new THREE.Group();upper.name='Manual / slew';root.add(upper);
  const boom=new THREE.Group(),stick=new THREE.Group(),bucket=new THREE.Group();
  upper.add(boom);boom.position.copy(P.boom);boom.add(stick);stick.position.subVectors(P.stick,P.boom);stick.add(bucket);bucket.position.subVectors(P.bucket,P.stick);
  const frames={upper,boom,stick,bucket},rest={upper:new THREE.Vector3(),...P};
  const attach=(object,part)=>{frames[part].add(object);object.position.sub(rest[part])};
  // Work on the selected clone only. Authored static assets remain untouched.
  for(const child of [...root.children]){
    if(child===upper)continue;
    const name=child.userData.part||child.name;
    if(/crawler shoes|sprockets|lower chassis|dozer blade/.test(name))continue;
    if(/hydraulic barrels|hydraulic hard lines|fasteners/.test(name)){child.visible=false;continue}
    const part=/boxed boom/.test(name)?'boom':/dipper arm/.test(name)?'stick':/bucket|bucket teeth/.test(name)?'bucket':'upper';
    attach(child,part);
  }
  const orange=new THREE.MeshStandardMaterial({color:0xdd6c24,metalness:.35,roughness:.4});
  const chrome=new THREE.MeshStandardMaterial({color:0xc6d5d8,metalness:.85,roughness:.22});
  const rubber=new THREE.MeshStandardMaterial({color:0x222a29,roughness:.8});
  const cyl=new THREE.CylinderGeometry(1,1,1,12),axis=new THREE.Vector3(0,1,0),rams=[];
  function ram(from,a,to,b,r){
    a=point(...a).sub(rest[from]);b=point(...b).sub(rest[to]);
    const length=frames[from].localToWorld(a.clone()).distanceTo(frames[to].localToWorld(b.clone()))*.55;
    const group=new THREE.Group();root.add(group);
    const barrel=new THREE.Mesh(cyl,orange),rod=new THREE.Mesh(cyl,chrome),collar=new THREE.Mesh(cyl,chrome);
    group.add(barrel,rod,collar);rams.push({from,a,to,b,r,length,group,barrel,rod,collar});
  }
  root.updateMatrixWorld(true);
  for(const y of [-.03,.75])ram('upper',[.64,y,1.83],'boom',[2.40,y,4.22],.13);
  ram('boom',[2.82,.36,4.86],'stick',[6.23,.36,5.03],.12);
  ram('stick',[6.72,.36,4.19],'bucket',[6.78,.36,1.44],.092);
  // Hydraulic lines follow the rigid boom and dipper; flexible loops span pivots.
  const hoses=[];
  for(const offset of [-.12,.12]){
    for(const [from,a,to,b] of [
      ['upper',[.45,.36+offset,2.1],'boom',[2.7,.36+offset,4.8]],
      ['boom',[2.7,.36+offset,4.8],'boom',[5.6,.36+offset,4.7]],
      ['boom',[5.6,.36+offset,4.7],'stick',[6.5,.36+offset,3.1]],
      ['stick',[6.5,.36+offset,3.1],'stick',[6.5,.36+offset,2.4]]
    ]){
      const mesh=new THREE.Mesh(new THREE.BufferGeometry(),rubber);root.add(mesh);
      hoses.push({from,a:point(...a).sub(rest[from]),to,b:point(...b).sub(rest[to]),mesh});
    }
  }
  const state={slew:0,boom:0,stick:0,bucket:0};
  const toRoot=(frame,p)=>root.worldToLocal(frames[frame].localToWorld(p.clone()));
  const bucketProbes=[point(4.4,-.3,.35),point(4.4,1,.35),point(6.4,-.3,.06),point(6.4,1,.06),point(5.8,.36,.12)].map(p=>p.sub(P.bucket));
  function pose(){upper.rotation.y=state.slew;boom.rotation.z=state.boom;stick.rotation.z=state.stick;bucket.rotation.z=state.bucket;root.updateMatrixWorld(true)}
  function updateHardware(){
    for(const r of rams){
      const a=toRoot(r.from,r.a),b=toRoot(r.to,r.b),delta=b.clone().sub(a),span=delta.length();
      r.group.position.copy(a);r.group.quaternion.setFromUnitVectors(axis,delta.normalize());
      const length=Math.min(r.length,span*.8);
      r.barrel.scale.set(r.r,length,r.r);r.barrel.position.y=length/2;
      r.rod.scale.set(r.r*.53,Math.max(.02,span-length),r.r*.53);r.rod.position.y=(length+span)/2;
      r.collar.scale.set(r.r*1.15,.09,r.r*1.15);r.collar.position.y=length;
    }
    for(const h of hoses){
      const a=toRoot(h.from,h.a),b=toRoot(h.to,h.b),mid=a.clone().lerp(b,.5);mid.y+=.16;
      const next=new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a,mid,b]),12,.023,6,false);
      h.mesh.geometry.dispose();h.mesh.geometry=next;
    }
  }
  function step(dt,input,sample){
    const old={...state};let changed=false;
    for(const key of ['slew','boom','stick','bucket'])if(input[key]){
      const limit=JOINT_LIMITS[key]||[-Infinity,Infinity];state[key]=THREE.MathUtils.clamp(state[key]+input[key]*dt*(key==='slew'?.5:.38),...limit);changed=true;
    }
    if(!changed)return false;
    pose();const blocked=!isClear(sample);
    if(blocked){Object.assign(state,old);pose()}else updateHardware();
    return blocked;
  }
  function isClear(sample){for(const p of bucketProbes){const q=bucket.localToWorld(p.clone()),ground=sample(q.x,q.z);if(!Number.isFinite(ground)||q.y<ground+.025)return false}return contactCheck()}
  pose();updateHardware();
  return {state,frames,step,isClear,setContactCheck(check){contactCheck=check||(()=>true)},reset(){Object.assign(state,{slew:0,boom:0,stick:0,bucket:0});pose();updateHardware()},dispose(){for(const h of hoses)h.mesh.geometry.dispose();cyl.dispose();orange.dispose();chrome.dispose();rubber.dispose()}};
}
