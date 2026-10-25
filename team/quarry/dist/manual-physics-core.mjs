// Ground-supported rigid bodies. Distances in metres, masses in kg, velocities in m/s.
export const BODY={truck:{length:4.85,width:2.92,height:5.65,mass:48000},excavator:{length:3.4,width:1.75,height:3.55,mass:22000}};
export const ORE_DENSITY=2200,BUCKET_CAPACITY=1.2,TRUCK_CAPACITY=12;
export function hull(d,kind){const c=BODY[kind];return {x:d.x,z:d.z,y:d.y,height:c.height,length:c.length,width:c.width,yaw:d.yaw}}
export function boxContact(a,b,skin=.06){
  if(a.y+a.height<b.y||b.y+b.height<a.y)return null;
  const axes=o=>[[Math.cos(o.yaw),-Math.sin(o.yaw)],[Math.sin(o.yaw),Math.cos(o.yaw)]];
  const aa=axes(a),bb=axes(b),dx=a.x-b.x,dz=a.z-b.z;let depth=Infinity,normal;
  for(const axis of [...aa,...bb]){
    const dot=(v)=>Math.abs(axis[0]*v[0]+axis[1]*v[1]);
    const overlap=a.length*dot(aa[0])+a.width*dot(aa[1])+b.length*dot(bb[0])+b.width*dot(bb[1])+skin-Math.abs(dx*axis[0]+dz*axis[1]);
    if(overlap<=0)return null;
    if(overlap<depth){depth=overlap;const sign=dx*axis[0]+dz*axis[1]>=0?1:-1;normal={x:axis[0]*sign,z:axis[1]*sign}}
  }
  return {depth,normal};
}
export function contactImpulse(a,b,normal,restitution=.18){
  const closing=-((a.vx-b.vx)*normal.x+(a.vz-b.vz)*normal.z);
  if(closing<=0)return {closing:0,energy:0,impulse:0};
  const inverse=1/a.mass+(Number.isFinite(b.mass)?1/b.mass:0),impulse=(1+restitution)*closing/inverse;
  a.vx+=normal.x*impulse/a.mass;a.vz+=normal.z*impulse/a.mass;
  if(Number.isFinite(b.mass)){b.vx-=normal.x*impulse/b.mass;b.vz-=normal.z*impulse/b.mass}
  return {closing,impulse,energy:.5*closing*closing/inverse};
}
export function damageFromImpact(energy,mass){return Math.min(65,energy/(mass*1.2))}

// Finite column volumes: excavated volume is transferred, never conjured by a timer.
export class OrePatch{
  constructor(x,z,base,radius=3,height=1.6,step=.25){
    this.x=x;this.z=z;this.base=base;this.radius=radius;this.step=step;this.n=Math.ceil(radius*2/step)+1;
    this.heights=new Float64Array(this.n*this.n);this.initial=0;
    for(let j=0;j<this.n;j++)for(let i=0;i<this.n;i++){
      const dx=i*step-radius,dz=j*step-radius,r=Math.hypot(dx,dz)/radius;
      const h=Math.max(0,1-r*r)**1.4*height*(1+.06*Math.sin(i*2+j));
      this.heights[j*this.n+i]=h;this.initial+=h*step*step;
    }
    this.removed=0;this.revision=0;
  }
  heightAt(x,z){
    const u=(x-this.x+this.radius)/this.step,v=(z-this.z+this.radius)/this.step;
    if(u<0||v<0||u>this.n-1||v>this.n-1)return this.base;
    const i=Math.min(this.n-2,Math.floor(u)),j=Math.min(this.n-2,Math.floor(v)),a=u-i,b=v-j;
    const h=(x,z)=>this.heights[z*this.n+x];
    return this.base+(1-a)*(1-b)*h(i,j)+a*(1-b)*h(i+1,j)+(1-a)*b*h(i,j+1)+a*b*h(i+1,j+1);
  }
  dig(center,radius,capacity){
    if(capacity<=0)return 0;let volume=0;
    for(let j=0;j<this.n;j++)for(let i=0;i<this.n;i++){
      const dx=this.x-this.radius+i*this.step-center.x,dz=this.z-this.radius+j*this.step-center.z,r2=dx*dx+dz*dz;
      if(r2>=radius*radius)continue;
      const k=j*this.n+i,top=this.base+this.heights[k],reach=Math.sqrt(radius*radius-r2),bottom=Math.max(this.base,center.y-reach);
      if(top<bottom||center.y+reach<this.base)continue;
      const take=Math.min(Math.max(0,top-bottom)*this.step**2,capacity-volume);
      this.heights[k]-=take/this.step**2;volume+=take;
      if(volume>=capacity-1e-10)break;
    }
    if(volume>0){this.removed+=volume;this.revision++}return volume;
  }
}

export function advanceOre(p,dt){
  const old={x:p.x,y:p.y,z:p.z};p.x+=p.vx*dt;p.y+=p.vy*dt-4.905*dt*dt;p.z+=p.vz*dt;p.vy-=9.81*dt;return old;
}
// A descending segment must cross the OPEN top of the bed. A hit on a cab or side is not loading.
export function bedEntry(before,after,rim=4.7){
  if(before.y<rim||after.y>rim||after.y>=before.y)return null;
  const t=(before.y-rim)/(before.y-after.y),x=before.x+(after.x-before.x)*t,z=before.z+(after.z-before.z)*t;
  return x>-4.3&&x<.7&&Math.abs(z)<2.25?{x,z,t}:null;
}
