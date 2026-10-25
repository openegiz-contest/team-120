import test from 'node:test';
import assert from 'node:assert/strict';
import {createMineTracks,MineRailDrive} from '../dist/mine-core.mjs';
const tracks=createMineTracks();
const advance=(drive,input,seconds)=>{for(let i=0;i<Math.ceil(seconds*60);i++)drive.step(1/60,input)};

test('both underground branches connect continuously to the entry without steep steps',()=>{
  for(const name of ['ore','deep']){
    assert.ok(tracks.entry.at(tracks.entry.length).position.distanceTo(tracks[name].at(0).position)<1e-9);
    assert.ok(tracks.entry.at(tracks.entry.length).tangent.dot(tracks[name].at(0).tangent)>.98);
    for(let d=0;d<tracks[name].length;d+=.2){const a=tracks[name].at(d),b=tracks[name].at(d+.2);assert.ok(a.position.distanceTo(b.position)<=.205);assert.ok(Math.abs(a.tangent.y)<.17)}
  }
  assert.ok(tracks.deep.at(tracks.deep.length).position.y<-17.9);
});
test('cart accelerates along rails and stops at an unselected junction',()=>{
  const d=new MineRailDrive(tracks);advance(d,{throttle:1},1);assert.ok(d.speed>1&&d.speed<2);advance(d,{throttle:1},30);
  assert.equal(d.distance,tracks.gate);assert.equal(d.speed,0);assert.equal(d.waiting,true);advance(d,{throttle:1},5);assert.equal(d.distance,tracks.gate);
});
test('each selected branch can be travelled to its buffer and reversed back to the entrance',()=>{
  for(const branch of ['ore','deep']){
    const d=new MineRailDrive(tracks);advance(d,{throttle:1},30);assert.equal(d.choose(branch),true);
    advance(d,{throttle:1},60);assert.equal(d.distance,d.limit);assert.equal(d.speed,0);assert.equal(d.end,true);assert.equal(d.branch,branch);
    advance(d,{},1);assert.equal(d.end,true,'terminal hint must remain after releasing the accelerator');
    assert.equal(d.choose(branch==='ore'?'deep':'ore'),false,'cannot switch track under the train');
    advance(d,{throttle:-1},100);assert.equal(d.distance,8);assert.equal(d.speed,0);assert.equal(d.released,false);assert.equal(d.choose(branch==='ore'?'deep':'ore'),true);
  }
});

test('automatic braking slows the train before a gate or terminal buffer',()=>{
  const d=new MineRailDrive(tracks);d.choose('deep');d.distance=d.limit-14;d.speed=8;
  advance(d,{throttle:1},1);assert.ok(d.speed<8&&d.speed>0);assert.ok(d.distance<d.limit);
  advance(d,{throttle:1},10);assert.equal(d.speed,0);assert.equal(d.distance,d.limit);
});
test('braking and reversal are gradual; idle and invalid time cannot teleport the train',()=>{
  const d=new MineRailDrive(tracks);d.choose('deep');advance(d,{throttle:1},4);const speed=d.speed;
  d.step(.1,{throttle:-1});assert.ok(d.speed<speed&&d.speed>0);advance(d,{brake:true},2);assert.equal(d.speed,0);
  const position=d.distance;for(const dt of [NaN,Infinity,0,-1])d.step(dt,{throttle:1});assert.equal(d.distance,position);
  advance(d,{},5);assert.equal(d.distance,position);assert.equal(d.choose('invalid'),false);
});
test('coupled wagon poses remain on the same rail and route selection is locked while moving',()=>{
  const d=new MineRailDrive(tracks);d.choose('ore');advance(d,{throttle:1},14);assert.equal(d.choose('deep'),false);
  const a=d.pose(),b=d.pose(-3.45);assert.ok(a.position.distanceTo(b.position)<3.5&&a.position.distanceTo(b.position)>3);
  assert.ok(Math.abs(d.pose().tangent.length()-1)<1e-12);assert.ok(d.distance<=d.limit);
});
