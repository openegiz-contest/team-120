import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {createVehicleContactShadow,enableVehicleShadows} from '../dist/quarry-contact-shadows.mjs';
import {createRoadClearance,createQuarryCloseup} from '../dist/quarry-closeup.mjs';

test('contact shadow follows the sampled slope through vehicle translation and rotation',()=>{
  const scene=new THREE.Scene(),truck=new THREE.Group(),heightAt=(x,z)=>x*.12+z*.05;
  scene.add(truck);truck.position.set(30,8,-10);truck.rotation.y=.7;
  const contact=createVehicleContactShadow(THREE,scene,truck,'truck',heightAt),position=contact.mesh.geometry.attributes.position;
  for(const move of [0,12]){truck.position.x+=move;truck.rotation.y+=.3;contact.update();for(let i=0;i<position.count;i++)assert.ok(Math.abs(position.getY(i)-heightAt(position.getX(i),position.getZ(i))-.025)<1e-6)}
  assert.equal(contact.mesh.material.depthWrite,false);truck.visible=false;contact.update();assert.equal(contact.mesh.visible,false);
  let disposed=0;for(const object of [contact.mesh.geometry,contact.mesh.material,contact.mesh.material.map])object.addEventListener('dispose',()=>disposed++);
  contact.dispose();assert.equal(contact.mesh.parent,null);assert.equal(disposed,3);
});

test('vehicle shadows keep source geometry and materials, and glass does not cast an opaque silhouette',()=>{
  const vehicle=new THREE.Group(),geometry=new THREE.BoxGeometry(),steel=new THREE.MeshStandardMaterial(),glass=new THREE.MeshStandardMaterial({transparent:true,opacity:.2}),body=new THREE.Mesh(geometry,steel),window=new THREE.Mesh(geometry,glass);vehicle.add(body,window);
  enableVehicleShadows(vehicle);assert.equal(body.castShadow,true);assert.equal(window.castShadow,false);assert.equal(window.receiveShadow,true);assert.equal(body.geometry,geometry);assert.equal(body.material,steel);assert.equal(glass.opacity,.2);
});

test('road clearance includes the segment interior and end caps',()=>{
  const clear=createRoadClearance([[0,0,0,0],[1,100,0,0]],24);
  for(const point of [[50,0],[50,23],[-23,0],[123,0]])assert.equal(clear(...point),false);
  for(const point of [[50,25],[-25,0],[125,0]])assert.equal(clear(...point),true);
});

test('nearby shadow focus preserves total sunlight, source terrain and the distant view',()=>{
  const scene=new THREE.Scene(),world=new THREE.Group(),terrain=new THREE.Group(),ground=new THREE.Mesh(new THREE.BoxGeometry(100,10,100),new THREE.MeshStandardMaterial({name:'16_Continuous_geology'}));terrain.userData.asset_id='GEO_001';terrain.add(ground);world.add(terrain);scene.add(world);
  const positions=ground.geometry.attributes.position.array.slice(),sun=new THREE.DirectionalLight(0xffdda0,3);sun.castShadow=true;sun.position.set(100,200,100);scene.add(sun,sun.target);
  const subject=new THREE.Group(),camera=new THREE.PerspectiveCamera();scene.add(subject);camera.position.set(10,8,10);
  const view=createQuarryCloseup({THREE,scene,world,heightAt:()=>0,route:[],surfaces:{rock:{albedo:null}}});
  assert.equal(view.group.visible,false);assert.equal(view.detail.shadow.mapSize.x,1024);
  view.update(camera,subject);assert.equal(view.group.visible,true);assert.ok(Math.abs(sun.intensity+view.detail.intensity-3)<1e-10);
  subject.position.set(20,0,10);view.update(camera,subject);assert.deepEqual(view.detail.target.position.toArray(),[20,0,10]);
  camera.position.set(800,800,800);view.update(camera,subject);assert.equal(sun.intensity,3);assert.equal(view.detail.visible,false);
  camera.position.copy(subject.position);view.update(camera,subject);view.update(camera,null);assert.equal(sun.intensity,3);
  view.update(camera,subject);view.dispose();assert.equal(sun.intensity,3);assert.equal(view.detail.parent,null);assert.equal(view.group.parent,null);
  assert.deepEqual(ground.geometry.attributes.position.array,positions);assert.equal(ground.parent,terrain);
});
