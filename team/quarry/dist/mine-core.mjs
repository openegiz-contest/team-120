import * as THREE from './vendor/three/build/three.module.js';

export const MINE_BRANCHES={ore:'Рудная жила',deep:'Глубокий горизонт'};
export function makeTrack(points){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');curve.arcLengthDivisions=1500;
  const length=curve.getLength(),count=Math.ceil(length*2),samples=curve.getSpacedPoints(count);
  return {length,samples,at(distance){
    const index=THREE.MathUtils.clamp(distance/length,0,1)*count,i=Math.min(count-1,Math.floor(index)),position=samples[i].clone().lerp(samples[i+1],index-i);
    const tangent=samples[i+1].clone().sub(samples[i]).normalize();return {position,tangent};
  }};
}
export function createMineTracks(){
  const entry=makeTrack([[0,0,14],[0,0,0],[0,-.8,-25],[0,-2,-48],[0,-2,-59]]);
  const ore=makeTrack([[0,-2,-59],[0,-2,-62],[-2,-2,-66],[-6,-2,-68],[-14,-2,-68],[-30,-2.5,-69],[-52,-4,-86],[-65,-6,-126],[-56,-8,-168],[-32,-8,-196],[-28,-8,-215]]);
  const deep=makeTrack([[0,-2,-59],[0,-2,-62],[2,-2,-66],[6,-2,-68],[14,-2,-68],[30,-3,-69],[52,-6,-88],[68,-12,-132],[62,-17,-176],[38,-18,-204],[34,-18,-223]]);
  return {entry,ore,deep,gate:entry.length-9,at(branch,distance){return distance<=entry.length?entry.at(distance):this[branch].at(distance-entry.length)}};
}
const approach=(a,b,step)=>a+THREE.MathUtils.clamp(b-a,-step,step);
export class MineRailDrive{
  constructor(tracks){this.tracks=tracks;this.distance=12;this.speed=0;this.branch='ore';this.released=false;this.waiting=false;this.end=false;this.travelled=0}
  get limit(){return this.tracks.entry.length+this.tracks[this.branch].length-5}
  choose(branch){
    if(!MINE_BRANCHES[branch]||this.distance>this.tracks.gate+.05||Math.abs(this.speed)>.15)return false;
    this.branch=branch;this.released=true;this.waiting=false;return true;
  }
  step(dt,input={}){
    if(!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,.1);
    const throttle=THREE.MathUtils.clamp(input.throttle||0,-1,1);let target=input.brake?0:throttle*(throttle>0?8:5);
    const stop=target>0?(this.released?this.limit:this.tracks.gate):8,remaining=Math.max(0,target>0?stop-this.distance:this.distance-stop);
    if(target)target=Math.sign(target)*Math.min(Math.abs(target),Math.sqrt(2*2.8*remaining));
    this.speed=approach(this.speed,target,dt*(input.brake||target*this.speed<0||(throttle&&Math.abs(target)<Math.abs(this.speed))?4.5:throttle?1.6:.7));
    const previous=this.distance;let next=previous+this.speed*dt;this.end=false;
    if(!this.released&&this.speed>=0&&next>=this.tracks.gate-.01){next=this.tracks.gate;this.speed=0;this.waiting=true}
    if(next<8||(this.speed<=0&&next<8.01)){next=8;this.speed=0;this.end=true}
    if(next>this.limit||(this.speed>=0&&next>this.limit-.01)){next=this.limit;this.speed=0;this.end=true}
    if(previous>=this.tracks.gate-.001&&next<this.tracks.gate-.001){this.released=false;this.waiting=false}
    this.distance=next;this.travelled+=next-previous;
  }
  pose(offset=0){return this.tracks.at(this.branch,this.distance+offset)}
}
