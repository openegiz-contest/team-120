import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three/build/three.module.js';
import {applyQuarrySurfaceMaterials} from '../dist/quarry-materials.mjs';
import {addQuarryLandscape} from '../dist/quarry-landscape.mjs';

const maps=Object.fromEntries(['rock','gravel','road'].map(k=>[k,{albedo:new THREE.Texture(),normal:new THREE.Texture(),roughness:new THREE.Texture()}]));

test('appearance overrides preserve geometry, shared source materials and unrelated equipment',()=>{
  const world=new THREE.Group(),source=new THREE.MeshStandardMaterial({color:0x9a8b78});source.name='04_Gravel';
  const geology=new THREE.MeshStandardMaterial();geology.name='16_Continuous_geology';
  const metal=new THREE.MeshStandardMaterial({metalness:.8});metal.name='05_Galvanized_steel';
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),[source,geology,metal]);world.add(mesh);
  const position=mesh.geometry.attributes.position.array.slice(),geometry=mesh.geometry;
  const copy=source.clone();
  assert.equal(applyQuarrySurfaceMaterials(THREE,world,maps),2);
  assert.equal(mesh.geometry,geometry);assert.deepEqual(mesh.geometry.attributes.position.array,position);
  assert.ok(source.color.equals(copy.color));assert.equal(source.onBeforeCompile,copy.onBeforeCompile);
  assert.equal(mesh.material[2],metal);assert.notEqual(mesh.material[0],source);
  assert.notEqual(mesh.material[0].customProgramCacheKey(),mesh.material[1].customProgramCacheKey());
  for(const material of mesh.material.slice(0,2)){
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
    material.onBeforeCompile(shader);
    assert.ok(shader.uniforms.quarryAlbedo.value.isTexture);
    assert.ok(shader.fragmentShader.includes('quarrySample(quarryAlbedo'));
    assert.ok(!shader.fragmentShader.includes('#include <normal_fragment_maps>'));
    assert.ok(shader.vertexShader.includes('#include <logdepthbuf_vertex>'));
    assert.ok(shader.fragmentShader.includes('#include <logdepthbuf_fragment>'));
  }
});

test('legacy overlapping collar is hidden while terrain geometry and world-space mapping are preserved',()=>{
  const world=new THREE.Group(),scene=new THREE.Scene();
  const original=new THREE.MeshStandardMaterial();original.name='04_Gravel';
  world.add(new THREE.Mesh(new THREE.BoxGeometry(),original));
  const {group}=addQuarryLandscape(THREE,scene,world);
  const collar=group.getObjectByName('Quarry edge precision collar');
  const geometry=collar.geometry;
  applyQuarrySurfaceMaterials(THREE,scene,maps);
  assert.equal(collar.visible,false);assert.equal(collar.geometry,geometry);
  assert.equal(collar.material.customProgramCacheKey(),group.getObjectByName('Continuous land outside quarry').material.customProgramCacheKey());
});
