import test from 'node:test';
import assert from 'node:assert/strict';
import {ManualDrive} from '../dist/manual-core.mjs';

const run=(d,seconds,sample,input={throttle:1})=>{for(let i=0;i<seconds*60;i++)d.step(1/60,input,sample)};
test('actual downhill contacts allow 60 empty and 40 loaded, uphill stays at 55 and 35',()=>{
  for(const [load,grade,expected] of [[0,-.08,60],[1,-.08,40],[0,.08,55],[1,.08,35],[.5,-.08,50]]){
    const d=new ManualDrive('truck',[0,200.08,0]);d.setLoadFraction(load);run(d,15,x=>200+x*grade);
    assert.ok(Math.abs(d.speed*3.6-expected)<1e-7,`${load}, ${grade}: ${d.speed*3.6}`);
  }
});
test('leaving a descent slows smoothly to the flat-road limit without a speed jump',()=>{
  const d=new ManualDrive('truck',[0,200.08,0]);d.setPayload(true);const ramp=x=>200-Math.min(x,100)*.08;
  run(d,12,ramp);assert.ok(d.x>80&&d.x<100);assert.ok(d.speed*3.6>39);
  let crossed=false;
  for(let i=0;i<360;i++){
    const before=d.speed;d.step(1/60,{throttle:1},ramp);assert.ok(Math.abs(d.speed-before)<=1.35/60+1e-8);
    if(d.x>105)crossed=true;
  }
  assert.ok(crossed);assert.ok(Math.abs(d.speed*3.6-35)<1e-8);
});
test('descent does not override brakes, reverse limit, excavator speed or legacy callers',()=>{
  const d=new ManualDrive('truck',[0,200.08,0]);d.setPayload(false);const slope=x=>200-x*.08;
  run(d,10,slope);run(d,2,slope,{brake:true});assert.equal(d.speed,0);
  run(d,4,slope,{throttle:-1});assert.equal(d.speed,-4);
  const exc=new ManualDrive('excavator',[0,200.08,0]);run(exc,5,slope);assert.equal(exc.speed,2);
  const legacy=new ManualDrive('truck',[0,200.08,0]);run(legacy,10,slope);assert.equal(legacy.speed,11);
});
test('gentle slope allowance is continuous, bounded and immune to small surface noise',()=>{
  const d=new ManualDrive('truck',[0,.08,0]);d.setPayload(false);let previous=55;
  for(let i=0;i<=100;i++){d.pitch=Math.atan(-i*.001);const speed=d.performance.forward*3.6;assert.ok(speed>=previous-1e-9&&speed<=60+1e-9);assert.ok(speed-previous<.22);previous=speed}
  d.pitch=-.001;assert.equal(d.performance.forward*3.6,55);
});
