export function enableVehicleShadows(root){
  root.traverse(o=>{if(!o.isMesh)return;const materials=Array.isArray(o.material)?o.material:[o.material];o.castShadow=!materials.every(m=>m?.transparent&&m.opacity<.7);o.receiveShadow=true});
}

export function createVehicleContactShadow(THREE,scene,vehicle,kind,heightAt){
  const n=64,data=new Uint8Array(n*n*4);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const radius=Math.hypot((i/(n-1)-.5)*2,(j/(n-1)-.5)*2),at=(j*n+i)*4;data[at]=20;data[at+1]=18;data[at+2]=15;data[at+3]=Math.round(Math.max(0,1-radius)**1.25*75)}
  const texture=new THREE.DataTexture(data,n,n);texture.needsUpdate=true;texture.magFilter=texture.minFilter=THREE.LinearFilter;
  const geometry=new THREE.PlaneGeometry(kind==='excavator'?5.4:8.4,kind==='excavator'?4.8:6.2,4,4);geometry.rotateX(-Math.PI/2);
  const original=geometry.attributes.position.array.slice(),position=geometry.attributes.position;
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-1});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Vehicle / soft ground contact';mesh.renderOrder=2;scene.add(mesh);
  const origin=new THREE.Vector3(),forward=new THREE.Vector3(),q=new THREE.Quaternion();
  function update(){
    vehicle.updateWorldMatrix(true,false);vehicle.getWorldPosition(origin);vehicle.getWorldQuaternion(q);forward.set(1,0,0).applyQuaternion(q);const length=Math.hypot(forward.x,forward.z)||1,dx=forward.x/length,dz=forward.z/length;
    for(let i=0;i<position.count;i++){const x=origin.x+original[i*3]*dx-original[i*3+2]*dz,z=origin.z+original[i*3]*dz+original[i*3+2]*dx,y=heightAt(x,z);position.setXYZ(i,x,(Number.isFinite(y)?y:origin.y-.08)+.025,z)}
    position.needsUpdate=true;geometry.computeBoundingSphere();mesh.visible=vehicle.visible;
  }
  update();return {mesh,update,dispose(){mesh.removeFromParent();geometry.dispose();material.dispose();texture.dispose()}};
}
