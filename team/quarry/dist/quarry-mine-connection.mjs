import * as THREE from './vendor/three/build/three.module.js';
import {MINE_PORTAL,cutPortalGeometry} from './mine-portal-core.mjs';

export function createQuarryMineConnection({scene,world,renderer,camera,controls,onFocus}){
  world.updateMatrixWorld(true);let removed=0;
  world.traverse(root=>{if(root.userData.asset_id!=='GEO_001')return;root.traverse(mesh=>{if(!mesh.isMesh)return;const result=cutPortalGeometry(mesh.geometry,mesh.matrixWorld);mesh.geometry=result.geometry;removed+=result.removed})});
  const origin=new THREE.Vector3(...MINE_PORTAL.origin),group=new THREE.Group();group.name='Mine entrance / quarry floor';group.position.copy(origin);scene.add(group);
  const concrete=new THREE.MeshStandardMaterial({color:0x8c8b7e,roughness:1}),steel=new THREE.MeshStandardMaterial({color:0x304b46,metalness:.55,roughness:.55}),amber=new THREE.MeshStandardMaterial({color:0xe8b35c,emissive:0xd18424,emissiveIntensity:.35});
  function box(material,x,y,z,w,h,d){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);group.add(m);return m}
  for(const x of [-4.45,4.45]){box(concrete,x,2.7,-8,1.7,5.8,4);box(steel,x,2.65,-5.94,.25,5.3,.15);for(let y=.5;y<5;y+=.7)box(amber,x,y,-5.83,.3,.22,.08)}
  box(concrete,0,5.5,-8,10.6,1,4);box(steel,0,5.02,-5.94,8.7,.2,.15);
  // Close the space between the rectangular excavation and the arched lining.
  const collar=new THREE.Shape();collar.moveTo(-5.3,-.3);collar.lineTo(5.3,-.3);collar.lineTo(5.3,6);collar.lineTo(-5.3,6);collar.closePath();
  const opening=new THREE.Path();opening.moveTo(-3.45,-.12);opening.lineTo(-3.45,2);
  for(let i=0;i<=24;i++){const a=Math.PI-i/24*Math.PI;opening.lineTo(3.45*Math.cos(a),2+2.7*Math.sin(a))}opening.lineTo(3.45,-.12);opening.closePath();collar.holes.push(opening);
  const lining=new THREE.Mesh(new THREE.ShapeGeometry(collar),concrete);lining.position.z=-7.8;group.add(lining);
  const sleevePositions=[],sleeveIndices=[],profile=[[-3.45,-.3],[-3.45,2]];
  for(let i=0;i<=24;i++){const a=Math.PI-i/24*Math.PI;profile.push([3.45*Math.cos(a),2+2.7*Math.sin(a)])}profile.push([3.45,-.3]);
  for(const [z,scale,drop] of [[-7.79,1,0],[-12,.94,.35]])for(const [x,y] of profile)sleevePositions.push(x*scale,y-drop,z);
  for(let i=0;i<profile.length-1;i++){const n=profile.length;sleeveIndices.push(i,i+1,i+n,i+1,i+n+1,i+n)}
  const sleeveGeometry=new THREE.BufferGeometry();sleeveGeometry.setAttribute('position',new THREE.Float32BufferAttribute(sleevePositions,3));sleeveGeometry.setIndex(sleeveIndices);sleeveGeometry.computeVertexNormals();const sleeveMaterial=concrete.clone();sleeveMaterial.side=THREE.DoubleSide;group.add(new THREE.Mesh(sleeveGeometry,sleeveMaterial));
  // A raised boarding edge sits alongside the existing outdoor track, not over it.
  for(const z of [-2,3,8,13]){box(steel,-4.55,1,z,.08,1.8,.08);box(amber,-4.55,1.9,z,.14,.14,.14)}
  box(steel,-4.55,1.85,5.5,.07,.07,15);
  const signCanvas=document.createElement('canvas');signCanvas.width=1024;signCanvas.height=192;const ctx=signCanvas.getContext('2d');ctx.fillStyle='#213c35';ctx.fillRect(0,0,1024,192);ctx.fillStyle='#e9bf7a';ctx.font='bold 64px sans-serif';ctx.textAlign='center';ctx.fillText('ШАХТА 01  /  ВХОД',512,115);
  const signTexture=new THREE.CanvasTexture(signCanvas);signTexture.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(7.5,1.4),new THREE.MeshBasicMaterial({map:signTexture}));sign.position.set(0,6.6,-5.9);group.add(sign);for(const x of [-3.9,3.9])box(steel,x,6.4,-6,.12,2,.12);
  const pin=document.createElement('button');pin.className='mine-portal-pin';pin.textContent='Шахта 01 · сесть в вагонетку';pin.hidden=true;document.querySelector('.world').append(pin);
  const p=new THREE.Vector3(),ray=new THREE.Raycaster(),terrain=[];world.traverse(o=>{if(o.userData.asset_id==='GEO_001')o.traverse(m=>{if(m.isMesh)terrain.push(m)})});
  function focus(){onFocus();controls.target.copy(origin).add(new THREE.Vector3(0,2,-5));camera.position.copy(origin).add(new THREE.Vector3(23,16,40));controls.update()}
  return {origin,removed,focus,pin,
    enableDeepNetwork(){
      // The old display block ends at -28 m. Its artificial underside and lower
      // border must not slice through real underground lines below the quarry.
      for(const mesh of terrain){const result=cutPortalGeometry(mesh.geometry,mesh.matrixWorld,{min:[-501,-100,-421],max:[501,-.01,421]});mesh.geometry=result.geometry;if(!mesh.geometry.attributes.position.count)mesh.visible=false}
    },
    worldCamera(mineCamera){mineCamera.position.add(origin);mineCamera.updateMatrixWorld()},
    render(view,mineScene,active){
      // Preserve depth between passes, so the real quarry wall occludes the mine.
      // Separate lighting prevents the quarry's sun from illuminating underground rock.
      renderer.render(scene,view);
      if(mineScene){const oldAuto=renderer.autoClear,oldBackground=mineScene.background;renderer.autoClear=false;mineScene.background=null;renderer.render(mineScene,view);renderer.autoClear=oldAuto;mineScene.background=oldBackground}
      pin.hidden=true;if(active)return;
      p.copy(origin).add(new THREE.Vector3(0,7.5,-6));const distance=view.position.distanceTo(p);if(distance>850)return;
      ray.set(view.position,p.clone().sub(view.position).normalize());ray.far=Math.max(0,distance-.5);if(ray.intersectObjects(terrain,false).length)return;
      p.project(view);if(p.z<-1||p.z>1||Math.abs(p.x)>.94||Math.abs(p.y)>.9)return;
      const rect=renderer.domElement.getBoundingClientRect();pin.style.left=(p.x*.5+.5)*rect.width+'px';pin.style.top=(-p.y*.5+.5)*rect.height+'px';pin.hidden=false;
    }
  };
}
