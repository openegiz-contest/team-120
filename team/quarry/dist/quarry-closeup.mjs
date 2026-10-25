// Close-range dressing and a second shadow cascade; navigation meshes stay intact.
export function createRoadClearance(route,margin=24){
  const bins=new Map(),cell=40;
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],segment=[a[1],a[3],b[1],b[3]];
    for(let x=Math.floor((Math.min(a[1],b[1])-margin)/cell);x<=Math.floor((Math.max(a[1],b[1])+margin)/cell);x++)for(let z=Math.floor((Math.min(a[3],b[3])-margin)/cell);z<=Math.floor((Math.max(a[3],b[3])+margin)/cell);z++){const key=x+','+z;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(segment)}
  }
  return (x,z)=>{for(const [ax,az,bx,bz] of bins.get(Math.floor(x/cell)+','+Math.floor(z/cell))||[]){const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));if(Math.hypot(x-ax-t*dx,z-az-t*dz)<margin)return false}return true};
}

export function planQuarryScree(heightAt,route,seed=7701){
  const clear=createRoadClearance(route),rows=[];
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  for(let z=-390;z<390;z+=9)for(let x=-470;x<470;x+=9){
    const px=x+random()*7,pz=z+random()*7,y=heightAt(px,pz);
    if(!Number.isFinite(y)||y<4||y>167||!clear(px,pz)||(px>10&&px<75&&pz>-175&&pz<-65))continue;
    const near=[heightAt(px-4,pz),heightAt(px+4,pz),heightAt(px,pz-4),heightAt(px,pz+4)];
    if(!near.every(Number.isFinite)||Math.max(...near)-y<3)continue;
    for(let j=0;j<3;j++){
      const sx=px+(random()-.5)*1.4,sz=pz+(random()-.5)*1.4,h=heightAt(sx,sz),checks=[heightAt(sx-.35,sz),heightAt(sx+.35,sz),heightAt(sx,sz-.35),heightAt(sx,sz+.35)];
      if(!Number.isFinite(h)||Math.abs(h-y)>.12||checks.some(v=>!Number.isFinite(v)||Math.abs(v-h)>.13)||!clear(sx,sz))continue;
      rows.push([sx,h+.035,sz,.14+random()*.35,.025+random()*.055,random()*Math.PI*2]);if(rows.length===750)return rows;
    }
  }return rows;
}

function quarryMeshes(world){
  const meshes=[];world.traverse(root=>{if(root.userData.asset_id==='GEO_001')root.traverse(o=>{if(o.isMesh)meshes.push(o)})});return meshes;
}

function wallChips(THREE,meshes){
  const rows=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3();let seed=9175;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  for(const mesh of meshes){
    mesh.updateWorldMatrix(true,false);const p=mesh.geometry.attributes.position,ix=mesh.geometry.index,count=ix?ix.count:p.count;
    for(let i=0;i<count&&rows.length<950;i+=9){
      const group=mesh.geometry.groups.find(g=>i>=g.start&&i<g.start+g.count),mat=Array.isArray(mesh.material)?mesh.material[group?.materialIndex||0]:mesh.material;
      if(mat?.name!=='16_Continuous_geology')continue;
      a.fromBufferAttribute(p,ix?ix.getX(i):i).applyMatrix4(mesh.matrixWorld);b.fromBufferAttribute(p,ix?ix.getX(i+1):i+1).applyMatrix4(mesh.matrixWorld);c.fromBufferAttribute(p,ix?ix.getX(i+2):i+2).applyMatrix4(mesh.matrixWorld);
      normal.crossVectors(b.clone().sub(a),c.clone().sub(a));if(normal.lengthSq()<.1)continue;normal.normalize();
      if(Math.abs(normal.y)>.55)continue;const u=Math.sqrt(random()),v=random(),point=a.clone().multiplyScalar(1-u).addScaledVector(b,u*(1-v)).addScaledVector(c,u*v);
      if(point.y<5||point.y>166||Math.abs(point.x)>480||Math.abs(point.z)>400||(point.x>25&&point.x<60&&point.z>-155&&point.z<-90))continue;
      point.addScaledVector(normal,.012);rows.push({point,normal:normal.clone(),size:.13+random()*.26,angle:random()*6.28});
    }
  }return rows;
}

function apronTracks(THREE,parent,route,heightAt){
  if(!route.length)return;
  const path=[route.at(-1).slice(1),[45,0,43],[-10,0,30]],points=[];
  for(let i=1;i<path.length;i++)for(let j=0;j<20;j++){const t=j/20;points.push([path[i-1][0]+(path[i][0]-path[i-1][0])*t,path[i-1][2]+(path[i][2]-path[i-1][2])*t])}points.push([-10,30]);
  const positions=[],uv=[],indices=[];
  for(const offset of [-2.1,2.1]){
    const start=positions.length/3;
    points.forEach(([x,z],i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz)||1;for(const side of [-1,1]){const px=x-dz/length*(offset+side*.23),pz=z+dx/length*(offset+side*.23),y=heightAt(px,pz);positions.push(px,(Number.isFinite(y)?y:0)+.035,pz);uv.push((side+1)/2,i*.55)}if(i<points.length-1){const n=start+i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3)}});
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  const n=64,data=new Uint8Array(n*n*4);for(let j=0;j<n;j++)for(let i=0;i<n;i++){const at=(j*n+i)*4,edge=Math.sin(i/(n-1)*Math.PI);data[at]=data[at+1]=data[at+2]=255;data[at+3]=Math.round(edge*(.55+.45*Math.sin(j*.82)**2)*255)}
  const texture=new THREE.DataTexture(data,n,n);texture.wrapT=THREE.RepeatWrapping;texture.needsUpdate=true;
  const material=new THREE.MeshStandardMaterial({map:texture,color:0x50483b,transparent:true,opacity:.14,roughness:1,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-1});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Loading apron / grounded tyre impressions';mesh.receiveShadow=true;parent.add(mesh);
}

export function createQuarryCloseup({THREE,scene,world,renderer,heightAt,route,surfaces}){
  const group=new THREE.Group();group.name='Quarry / close-range rock details';group.visible=false;scene.add(group);
  const meshes=quarryMeshes(world),rows=planQuarryScree(heightAt,route),chips=wallChips(THREE,meshes),dummy=new THREE.Object3D(),tint=new THREE.Color();
  let colour=0xa09a86;for(const mesh of meshes)for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(mat?.name==='16_Continuous_geology')colour=mat.color;
  const material=new THREE.MeshStandardMaterial({color:colour,map:surfaces.rock.albedo,roughness:1,flatShading:true});
  const geometry=new THREE.DodecahedronGeometry(1,0),scree=new THREE.InstancedMesh(geometry,material,rows.length);
  rows.forEach(([x,y,z,size,height,angle],i)=>{dummy.position.set(x,y,z);dummy.rotation.set(0,angle,0);dummy.scale.set(size,height,size*.65);dummy.updateMatrix();scree.setMatrixAt(i,dummy.matrix);tint.setScalar(.82+(i%11)*.025);scree.setColorAt(i,tint)});scree.name='Benches / small angular scree';scree.receiveShadow=true;group.add(scree);
  const flakes=new THREE.InstancedMesh(geometry,material,chips.length),axis=new THREE.Vector3(0,0,1),spin=new THREE.Quaternion();
  chips.forEach(({point,normal,size,angle},i)=>{dummy.position.copy(point);dummy.quaternion.setFromUnitVectors(axis,normal);spin.setFromAxisAngle(axis,angle);dummy.quaternion.multiply(spin);dummy.scale.set(size,size*.55,.025);dummy.updateMatrix();flakes.setMatrixAt(i,dummy.matrix);tint.setScalar(.87+(i%7)*.025);flakes.setColorAt(i,tint)});flakes.name='Rock faces / thin fractured plates';flakes.castShadow=true;flakes.receiveShadow=true;group.add(flakes);apronTracks(THREE,group,route,heightAt);
  let sun=null;scene.traverse(o=>{if(o.isDirectionalLight&&o.castShadow&&!sun)sun=o});
  const detail=new THREE.DirectionalLight(0xffffff,0),focus=new THREE.Vector3(),direction=new THREE.Vector3(),target=new THREE.Object3D();detail.name='Quarry / nearby vehicle shadow';detail.target=target;detail.castShadow=true;detail.visible=false;detail.shadow.mapSize.set(1024,1024);Object.assign(detail.shadow.camera,{left:-38,right:38,top:38,bottom:-38,near:1,far:760});detail.shadow.bias=-.00004;detail.shadow.normalBias=.025;detail.shadow.radius=2;detail.shadow.camera.updateProjectionMatrix();scene.add(detail,target);
  let active=false,originalIntensity=0;
  function update(camera,subject){
    if(subject)subject.getWorldPosition(focus);const near=!!subject&&camera.position.distanceTo(focus)<150;group.visible=near;
    if(!sun)return;
    if(near&&!active){originalIntensity=sun.intensity;active=true;sun.intensity=originalIntensity*.48;detail.intensity=originalIntensity*.52;detail.visible=true}
    if(!near&&active){sun.intensity=originalIntensity;active=false;detail.visible=false;detail.intensity=0}
    if(near){detail.color.copy(sun.color);sun.target.getWorldPosition(direction);direction.subVectors(sun.position,direction).normalize().multiplyScalar(360);detail.position.copy(focus).add(direction);target.position.copy(focus);target.updateMatrixWorld();detail.updateMatrixWorld()}
  }
  return {group,scree,flakes,detail,update,dispose(){if(active&&sun)sun.intensity=originalIntensity;group.removeFromParent();detail.removeFromParent();target.removeFromParent();detail.shadow.map?.dispose();geometry.dispose();material.dispose();group.traverse(o=>{if(o.isMesh&&o!==scree&&o!==flakes){o.geometry.dispose();o.material.map?.dispose();o.material.dispose()}})}};
}
