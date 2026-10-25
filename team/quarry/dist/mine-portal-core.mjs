import * as THREE from './vendor/three/build/three.module.js';

export const MINE_PORTAL={origin:[40,.18,-100],mouthZ:-8,roofStart:22,
  cut:{min:[35.8,-.2,-125],max:[44.2,5.9,-105]}};

// Subtract only the entrance volume. Interpolate every vertex attribute at cuts;
// untouched triangles and material assignments keep their original values.
export function cutPortalGeometry(geometry,matrixWorld,bounds=MINE_PORTAL.cut){
  const attributes=Object.entries(geometry.attributes),data=Object.fromEntries(attributes.map(([k])=>[k,[]]));
  const index=geometry.index,count=index?index.count:geometry.attributes.position.count;
  const groups=[],point=new THREE.Vector3();let written=0,removed=0;
  const vertex=i=>{const a={};for(const [key,attr] of attributes)a[key]=Array.from({length:attr.itemSize},(_,j)=>attr.getComponent(i,j));point.fromArray(a.position).applyMatrix4(matrixWorld);return {a,p:point.toArray()}};
  const mix=(a,b,t)=>({p:a.p.map((n,j)=>n+(b.p[j]-n)*t),a:Object.fromEntries(attributes.map(([key])=>[key,a.a[key].map((n,j)=>n+(b.a[key][j]-n)*t)]))});
  function split(poly,axis,value,sign){
    const inside=[],outside=[];if(!poly.length)return {inside,outside};
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],da=(a.p[axis]-value)*sign,db=(b.p[axis]-value)*sign;
      (da>=0?inside:outside).push(a);
      if((da>=0)!==(db>=0)){const intersection=mix(a,b,da/(da-db));inside.push(intersection);outside.push(intersection)}
    }return {inside,outside};
  }
  function emit(poly,material){
    for(let j=1;j+1<poly.length;j++){
      const vertices=[poly[0],poly[j],poly[j+1]],a=new THREE.Vector3().fromArray(vertices[0].p),b=new THREE.Vector3().fromArray(vertices[1].p),c=new THREE.Vector3().fromArray(vertices[2].p);
      if(b.sub(a).cross(c.sub(a)).lengthSq()<1e-18)continue;
      if(groups.at(-1)?.materialIndex===material)groups.at(-1).count+=3;else groups.push({start:written,count:3,materialIndex:material});
      for(const v of vertices)for(const [key] of attributes)data[key].push(...v.a[key]);written+=3;
    }
  }
  for(let i=0;i<count;i+=3){
    let poly=[0,1,2].map(j=>vertex(index?index.getX(i+j):i+j));
    const material=geometry.groups.find(g=>i>=g.start&&i<g.start+g.count)?.materialIndex??0;
    if([0,1,2].some(axis=>poly.every(v=>v.p[axis]<bounds.min[axis])||poly.every(v=>v.p[axis]>bounds.max[axis]))){emit(poly,material);continue}
    for(let axis=0;axis<3;axis++)for(const [value,sign] of [[bounds.min[axis],1],[bounds.max[axis],-1]]){const result=split(poly,axis,value,sign);emit(result.outside,material);poly=result.inside}
    if(poly.length>=3)removed++;
  }
  if(!removed)return {geometry,removed:0};
  const result=new THREE.BufferGeometry();for(const [key,attr] of attributes)result.setAttribute(key,new THREE.Float32BufferAttribute(data[key],attr.itemSize));
  for(const g of groups)result.addGroup(g.start,g.count,g.materialIndex);result.computeBoundingBox();result.computeBoundingSphere();
  return {geometry:result,removed};
}
