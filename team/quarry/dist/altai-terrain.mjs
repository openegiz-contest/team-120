import {buildLandscapeSurface,landscapeHeight,distanceFromQuarry,terrainAxes} from './quarry-landscape.mjs';

const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
const peaks=[[-1900,-1700,1250,1100,1000],[-450,-3300,1830,1200,1150],[1750,-2400,1560,1050,1200],[-3300,300,1580,1250,1200],[-2700,2850,1650,1300,1100],[900,4200,1760,1450,1100],[3650,1300,1450,1200,1600]];

export function altaiHeight(x,z){
  const base=landscapeHeight(x,z),d=distanceFromQuarry(x,z);
  // All working surfaces and the immediately driveable perimeter stay exact.
  if(d<=900)return base;
  let mountain=0;
  for(const [cx,cz,h,sx,sz] of peaks){
    const r=Math.hypot((x-cx)/sx,(z-cz)/sz),ridge=1+.11*Math.sin(x*.006+z*.004)+.07*Math.sin(z*.011-x*.003);
    mountain=Math.max(mountain,h*Math.exp(-r*r*.95)*ridge);
  }
  return base+smooth((d-900)/850)*mountain;
}

const xs=terrainAxes(500),zs=terrainAxes(420);
export function altaiSurfaceHeight(x,z){
  const cell=(axis,v)=>{let lo=0,hi=axis.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(axis[m]<=v)lo=m;else hi=m}return lo};
  const i=cell(xs,x),j=cell(zs,z),x0=xs[i],x1=xs[i+1],z0=zs[j],z1=zs[j+1];
  const u=Math.max(0,Math.min(1,(x-x0)/(x1-x0))),v=Math.max(0,Math.min(1,(z-z0)/(z1-z0)));
  const a=altaiHeight(x0,z0),b=altaiHeight(x1,z0),c=altaiHeight(x0,z1),d=altaiHeight(x1,z1);
  return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}

export function buildAltaiSurface(){
  const data=buildLandscapeSurface();
  for(let i=0;i<data.positions.length;i+=3){const [x,,z]=data.positions.slice(i,i+3);data.positions[i+1]=altaiHeight(x,z);data.colors[i]=data.colors[i+1]=data.colors[i+2]=1}
  return data;
}

export function createAltaiForest(count=2100){
  let seed=871210;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  const trees=[];
  for(let attempt=0;attempt<count*30&&trees.length<count;attempt++){
    const angle=random()*Math.PI*2,r=670+Math.pow(random(),1.6)*3850,x=Math.cos(angle)*r,z=Math.sin(angle)*r,d=distanceFromQuarry(x,z),y=altaiSurfaceHeight(x,z);
    if(d<190||y>1390||(Math.abs(x)<950&&Math.abs(z)<850)||(z<-420&&x>140&&x<1120))continue;
    if(.5+.3*Math.sin(x*.009)*Math.cos(z*.007)<random()*.65)continue;
    trees.push({x,y,z,height:13+random()*18,width:3.4+random()*3.9,rotation:random()*Math.PI*2,tint:random()});
  }
  return trees;
}
