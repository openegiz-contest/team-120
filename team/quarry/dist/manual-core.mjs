// Free-drive state is independent of career saves, reservations and economy.
export const DRIVE_CONFIG={
  truck:{forward:11,reverse:4,acceleration:3,braking:9,wheelbase:5.05,halfLength:2.5,halfWidth:2.3,maxGrade:.22,maxRoll:.19},
  excavator:{forward:2,reverse:1.3,acceleration:1.5,braking:5,wheelbase:3.5,halfLength:1.75,halfWidth:1.35,maxGrade:.3,maxRoll:.22}
};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const approach=(a,b,step)=>a+clamp(b-a,-step,step);

export function groundPose(x,z,yaw,kind,sample){
  const c=DRIVE_CONFIG[kind],f=[Math.cos(yaw),-Math.sin(yaw)],s=[Math.sin(yaw),Math.cos(yaw)];
  const h=[];
  for(const a of [-1,1])for(const b of [-1,1]){
    const y=sample(x+f[0]*a*c.halfLength+s[0]*b*c.halfWidth,z+f[1]*a*c.halfLength+s[1]*b*c.halfWidth);
    if(!Number.isFinite(y))return null;h.push(y);
  }
  const pitch=((h[2]+h[3])-(h[0]+h[1]))/(4*c.halfLength);
  const roll=((h[1]+h[3])-(h[0]+h[2]))/(4*c.halfWidth);
  if(Math.abs(pitch)>c.maxGrade||Math.abs(roll)>c.maxRoll||Math.abs(h[0]+h[3]-h[1]-h[2])>.7)return null;
  const center=sample(x,z),height=h.reduce((a,b)=>a+b,0)/4;
  if(!Number.isFinite(center)||Math.abs(center-height)>.45)return null;
  return {height:Math.max(center,height)+.08,pitch:Math.atan(pitch),roll:Math.atan(roll)};
}

export class ManualDrive{
  constructor(kind,position,yaw=0){this.kind=kind;this.x=position[0];this.y=position[1];this.z=position[2];this.yaw=yaw;this.speed=0;this.steer=0;this.pitch=0;this.roll=0;this.blocked=false}
  setPayload(full){this.payload=full?1:0}
  setLoadFraction(fraction){this.payload=Number.isFinite(fraction)?clamp(fraction,0,1):0}
  get performance(){
    const c=DRIVE_CONFIG[this.kind];
    if(this.kind!=='truck'||this.payload===undefined)return c;
    // Blend the descent allowance over 0.5–4% downhill grade to avoid flicker at road seams.
    const descent=clamp((-Math.tan(this.pitch)-.005)/.035,0,1),bonus=5*descent*descent*(3-2*descent);
    return {...c,forward:(55-20*this.payload+bonus)/3.6,acceleration:2.8-1.45*this.payload};
  }
  step(dt,input,sample,blocked=()=>false){
    if(!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(dt,.1);const c=this.performance;this.blocked=false;this.contactSpeed=0;
    const throttle=clamp(input.throttle||0,-1,1),turn=clamp(input.turn||0,-1,1);
    this.steer=approach(this.steer,turn*.55,dt*1.8);
    const target=input.brake?0:throttle*(throttle>0?c.forward:c.reverse);
    this.speed=approach(this.speed,target,dt*(input.brake||this.speed*target<0?c.braking:throttle?c.acceleration:2));
    const count=Math.max(1,Math.ceil(Math.abs(this.speed)*dt/.2));
    for(let i=0;i<count;i++){
      const t=dt/count;
      const yaw=this.yaw+(this.kind==='excavator'?turn*.65:this.speed*Math.tan(this.steer)/c.wheelbase)*t;
      const x=this.x+Math.cos(yaw)*this.speed*t,z=this.z-Math.sin(yaw)*this.speed*t;
      const pose=groundPose(x,z,yaw,this.kind,sample);
      if(!pose||Math.abs(x)>850||Math.abs(z)>750||Math.abs(pose.height-this.y)>.55||blocked(x,z,yaw)){
        this.contactSpeed=this.speed;
        this.speed=0;this.blocked=true;break;
      }
      Object.assign(this,{x,z,yaw,y:pose.height,pitch:pose.pitch,roll:pose.roll});
    }
  }
}
