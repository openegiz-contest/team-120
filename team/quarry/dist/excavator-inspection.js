import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

/** Close inspection affects only this mode; original quarry views keep their lighting. */
export function createExcavatorInspection(renderer,scene,options={}){
  let active=false,environment=null;
  const visibility=new Map();
  const initialEnvironment=scene.environment;
  const initialIntensity=scene.environmentIntensity;
  const panel=document.querySelector(options.panelId||'#excavator-detail');
  const assetId=options.assetId||'EXCAVATOR_01';
  const className=options.className||'inspecting-excavator';
  return {
    update(model,enabled){
      if(!model)return;
      if(!enabled&&!active)return;
      if(enabled&&!active){
        visibility.clear();
        model.traverse(o=>{
          if(!o.userData.asset_id)return;
          visibility.set(o,o.visible);
          o.visible=o.userData.asset_id===assetId;
        });
        if(!environment){
          const generator=new THREE.PMREMGenerator(renderer);
          const room=new RoomEnvironment();
          environment=generator.fromScene(room,.04).texture;
          room.dispose();generator.dispose();
        }
        scene.environment=environment;scene.environmentIntensity=.55;
      }else if(!enabled&&active){
        visibility.forEach((visible,o)=>o.visible=visible);visibility.clear();
        scene.environment=initialEnvironment;scene.environmentIntensity=initialIntensity;
      }
      active=enabled;
      document.querySelectorAll('[data-layer]').forEach(input=>input.disabled=enabled);
      panel.hidden=!enabled;
      document.body.classList.toggle(className,enabled);
    },
    active:()=>active
  };
}
