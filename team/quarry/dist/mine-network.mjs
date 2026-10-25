import * as THREE from './vendor/three/build/three.module.js';
import {createMineTracks,makeTrack,MineRailDrive} from './mine-core.mjs?v=3';

function makeNetworkTrack(points){
  // Long lines still contain tight switch curves. A denser arc-length table
  // keeps speed and coupling distance accurate in those short curved sections.
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');curve.arcLengthDivisions=24000;
  const length=curve.getLength(),count=Math.ceil(length*2),samples=curve.getSpacedPoints(count);
  return {length,samples,at(distance){const u=THREE.MathUtils.clamp(distance/length,0,1)*count,i=Math.min(count-1,Math.floor(u));return {position:samples[i].clone().lerp(samples[i+1],u-i),tangent:samples[i+1].clone().sub(samples[i]).normalize()}}};
}

export function createMineNetwork(){
  const tracks=createMineTracks();tracks.names=['entry','ore','deep'];
  tracks.labels={entry:'Входная линия',ore:'Западный штрек',deep:'Восточный штрек'};
  tracks.children={entry:['ore','deep']};tracks.junctions=[];
  const ends=[['ore',-48],['deep',-66]];
  function fork(parent,level,depth){
    const end=tracks[parent].at(tracks[parent].length),p=end.position,t=end.tangent.clone();t.y=0;t.normalize();
    const right=new THREE.Vector3(-t.z,0,t.x),toWorld=([x,y,z])=>p.clone().addScaledVector(right,x).addScaledVector(t,-z).add(new THREE.Vector3(0,y,0)).toArray();
    const ids=[parent+'_a',parent+'_b'];tracks.children[parent]=ids;
    const junction={parent,position:p,tangent:t,right,toWorld,children:ids};tracks.junctions.push(junction);
    ids.forEach((id,index)=>{
      const side=index?1:-1,targetDepth=depth-index*6-(parent==='deep'&&index?6:0),drop=targetDepth-p.y,length=level===1?(parent==='deep'&&index?380:350):610;
      const east=parent==='deep';
      const points=[[0,0,0],[0,0,-3],[side*2,0,-7],[side*6,0,-9],[side*14,0,-9],[side*28,east?drop*.035:0,-10],[side*54,drop*(east?.12:.05),-32],[side*105,drop*(east?.25:.2),-90],[side*155,drop*.45,-length*.45],[side*175,drop*.75,-length*.72],[side*178,drop,-length],[side*178,drop,-length-20]];
      // Keep the eastern return line clear of the adjacent lower horizon.
      if(id==='deep_b_a')for(let i=7;i<points.length;i++)points[i][0]*=.8;
      tracks[id]=makeNetworkTrack(points.map(toWorld));tracks.names.push(id);
      tracks.labels[id]=level===1?(parent==='ore'?'Запад ':'Восток ')+(index?'Б':'А')+' · '+Math.abs(Math.round(targetDepth))+' м':'Забой '+(Object.keys(tracks.labels).filter(k=>k.split('_').length===3).length+1)+' · '+Math.abs(Math.round(targetDepth))+' м';
    });return ids;
  }
  for(const [parent,depth] of ends){const mids=fork(parent,1,depth);mids.forEach((id,i)=>fork(id,2,parent==='ore'?-114-i*12:-132-i*12))}
  tracks.terminals=tracks.names.filter(name=>!tracks.children[name]);tracks.totalLength=tracks.names.reduce((sum,name)=>sum+tracks[name].length,0);
  tracks.depth=Math.min(...tracks.names.map(name=>tracks[name].at(tracks[name].length).position.y));
  return tracks;
}

// A separate driver extends the original two-branch contract; old callers keep
// MineRailDrive unchanged. Path history keeps both coupled wagons on their rails.
export class MineNetworkDrive extends MineRailDrive{
  constructor(tracks){super(tracks);this.path=['entry']}
  get limit(){return this.path.reduce((n,key)=>n+this.tracks[key].length,0)-5}
  get junction(){let end=0;for(let i=0;i<this.path.length;i++){const key=this.path[i];end+=this.tracks[key].length;if(this.tracks.children[key]&&this.distance<=end-9+.05)return {key,index:i,gate:end-9,options:this.tracks.children[key],selected:this.path[i+1]||null}}return null}
  get currentTrack(){let start=0;for(const key of this.path){start+=this.tracks[key].length;if(this.distance<=start)return key}return this.path.at(-1)}
  choose(branch){const j=this.junction;if(!j||!j.options.includes(branch)||Math.abs(this.speed)>.15)return false;this.path.splice(j.index+1,Infinity,branch);this.branch=this.path[1]||'ore';this.released=this.path.length>1;this.waiting=false;return true}
  pose(offset=0){let distance=Math.max(0,this.distance+offset);for(const key of this.path){const track=this.tracks[key];if(distance<=track.length)return track.at(distance);distance-=track.length}return this.tracks[this.path.at(-1)].at(Infinity)}
  step(dt,input={}){
    if(!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,.1);
    const throttle=THREE.MathUtils.clamp(input.throttle||0,-1,1),j=this.junction,stop=j&&!j.selected?j.gate:this.limit;
    let target=input.brake?0:throttle*(throttle>0?8:5);const remaining=Math.max(0,target>0?stop-this.distance:this.distance-8);
    if(target)target=Math.sign(target)*Math.min(Math.abs(target),Math.sqrt(5.6*remaining));
    const rate=input.brake||target*this.speed<0||(throttle&&Math.abs(target)<Math.abs(this.speed))?4.5:throttle?1.6:.7;
    this.speed+=THREE.MathUtils.clamp(target-this.speed,-dt*rate,dt*rate);
    const previous=this.distance;let next=previous+this.speed*dt;this.end=false;
    if(this.speed>=0&&next>=stop-.01){next=stop;this.speed=0;this.waiting=!!(j&&!j.selected);this.end=!this.waiting}
    if(next<8.01&&this.speed<=0){next=8;this.speed=0;this.end=true}
    let gate=0;for(let i=0;i<this.path.length;i++){gate+=this.tracks[this.path[i]].length;if(previous>=gate-9-.001&&next<gate-9-.001){this.path.splice(i+1);this.waiting=false;break}}
    if(this.waiting&&next<(j?.gate??0)-.001)this.waiting=false;
    this.distance=next;this.travelled+=next-previous;this.branch=this.path[1]||'ore';this.released=this.path.length>1;
  }
}
