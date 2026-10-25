import test from 'node:test';
import assert from 'node:assert/strict';
import {createMineTracks} from '../dist/mine-core.mjs';
import {createMineNetwork,MineNetworkDrive} from '../dist/mine-network.mjs';
import {inNetworkChamber} from '../dist/mine-network-world.mjs';
const tracks=createMineNetwork();
const advance=(d,input,seconds)=>{for(let i=0;i<seconds*60;i++)d.step(1/60,input)};

test('expanded mine retains original entrance and trunks, adds 8 destinations down to -150 m',()=>{
  const original=createMineTracks();assert.equal(tracks.names.length,15);assert.equal(tracks.terminals.length,8);assert.equal(Object.keys(tracks.children).length,7);assert.ok(tracks.totalLength>7800&&tracks.totalLength<8000);assert.ok(Math.abs(tracks.depth+150)<.001);
  for(const key of ['entry','ore','deep']){assert.equal(tracks[key].length,original[key].length);for(let s=0;s<original[key].length;s+=1)assert.ok(tracks[key].at(s).position.distanceTo(original[key].at(s).position)<1e-10)}
  for(const [key,children] of Object.entries(tracks.children))for(const child of children){const a=tracks[key].at(tracks[key].length),b=tracks[child].at(0);assert.ok(a.position.distanceTo(b.position)<1e-8);assert.ok(a.tangent.dot(b.tangent)>.98)}
  for(const name of tracks.names)for(let s=0;s<tracks[name].length;s+=1){const a=tracks[name].at(s),b=tracks[name].at(s+.1);assert.ok(a.position.distanceTo(b.position)<.101);assert.ok(Math.abs(a.tangent.y)<.18)}
});

test('every destination is reachable through 3 switches and reversible along the same path',()=>{
  for(const terminal of tracks.terminals){
    const parts=terminal.split('_'),route=['entry',parts[0],parts.slice(0,2).join('_'),terminal],d=new MineNetworkDrive(tracks);let stops=0;
    for(let frame=0;frame<25000&&!d.end;frame++){
      d.step(1/60,{throttle:1});if(d.waiting){stops++;const j=d.junction;assert.equal(d.speed,0);assert.ok(d.choose(route[j.index+1]))}
      const a=d.pose(),b=d.pose(-3.45);assert.ok(a.position.distanceTo(b.position)<=3.46);
    }
    assert.equal(stops,3);assert.equal(d.currentTrack,terminal);assert.equal(d.distance,d.limit);assert.equal(d.end,true);assert.deepEqual(d.path,route);
    advance(d,{},1);assert.equal(d.end,true);
    for(let frame=0;frame<30000&&d.distance>8;frame++)d.step(1/60,{throttle:-1});
    assert.equal(d.distance,8);assert.deepEqual(d.path,['entry']);assert.equal(d.waiting,false);
  }
});

test('route choice is local, cannot teleport a moving train, and can change after reversing',()=>{
  const d=new MineNetworkDrive(tracks);assert.equal(d.choose('deep_b_b'),false);assert.equal(d.choose('deep'),true);
  advance(d,{throttle:1},8);assert.equal(d.choose('ore'),false);advance(d,{throttle:1},60);assert.equal(d.waiting,true);assert.equal(d.junction.key,'deep');
  const p=d.pose().position.clone();assert.ok(d.choose('deep_b'));assert.ok(p.distanceTo(d.pose().position)<1e-9);
  advance(d,{throttle:1},10);advance(d,{throttle:-1},20);advance(d,{brake:true},3);
  assert.equal(d.junction.key,'deep');assert.ok(d.choose('deep_a'));assert.equal(d.path.at(-1),'deep_a');
  const distance=d.distance;for(const dt of [0,-1,NaN,Infinity])d.step(dt,{throttle:1});assert.equal(d.distance,distance);
});

test('different lines have rock clearance outside their junction rooms',()=>{
  const samples={};for(const key of tracks.names){samples[key]=[];for(let s=0;s<tracks[key].length;s+=4){const p=tracks[key].at(s).position;if(!inNetworkChamber(p,tracks)&&!(Math.abs(p.x)<22&&p.z>-80&&p.z<-49))samples[key].push(p)}}
  for(let i=0;i<tracks.names.length;i++)for(let j=i+1;j<tracks.names.length;j++)for(const p of samples[tracks.names[i]])for(const q of samples[tracks.names[j]]){
    // Crossing projections are intentional overpasses, separated vertically.
    assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>=7||Math.abs(p.y-q.y)>=5.5,`${tracks.names[i]} intersects ${tracks.names[j]}`);
  }
});

test('unrelated lines clear the roofs and floors of all new junction halls',()=>{
  for(const j of tracks.junctions)for(const key of tracks.names){
    if(key===j.parent||j.children.includes(key))continue;
    for(let s=0;s<tracks[key].length;s+=1){
      const d=tracks[key].at(s).position.sub(j.position),x=d.dot(j.right),z=-d.dot(j.tangent);
      // Room footprint plus the radius of a neighbouring tunnel. Roof top is
      // 5.6 m above the rails; a lower tunnel's crown is below the room floor.
      if(Math.abs(x)<18&&z>-22&&z<10)assert.ok(d.y>=6||d.y<=-5.5,`${key} intrudes into ${j.parent} hall`);
    }
  }
});
