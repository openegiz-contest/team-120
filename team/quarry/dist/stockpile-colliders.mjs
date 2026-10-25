import * as THREE from './vendor/three/build/three.module.js';

// Rasterise only stockpile footprints, then merge adjacent cells into short rows.
// Separate heaps keep separate footprints even when exported as one joined mesh.
export function createStockpileBlockers(world,cell=1.5){
  if(!(cell>0&&Number.isFinite(cell)))throw new RangeError('Positive cell size required');
  const meshes=new Set(),boxes=[];
  world.updateWorldMatrix(true,true);
  world.traverse(o=>{if(/^STOCK_/.test(o.userData.asset_id||''))o.traverse(m=>{if(m.isMesh)meshes.add(m)})});
  for(const mesh of meshes){
    const p=mesh.geometry.attributes.position,ix=mesh.geometry.index,cells=new Set();
    if(!p)continue;
    const bounds=new THREE.Box3().setFromObject(mesh),v=new THREE.Vector3();
    for(let i=0;i<(ix?.count??p.count);i+=3){
      const triangle=[];
      for(let j=0;j<3;j++){v.fromBufferAttribute(p,ix?ix.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld);triangle.push([v.x,v.z])}
      const area=(triangle[1][0]-triangle[0][0])*(triangle[2][1]-triangle[0][1])-(triangle[2][0]-triangle[0][0])*(triangle[1][1]-triangle[0][1]);
      if(Math.abs(area)<1e-8)continue;
      const xs=triangle.map(a=>a[0]),zs=triangle.map(a=>a[1]);
      for(let z=Math.floor(Math.min(...zs)/cell);z<=Math.floor(Math.max(...zs)/cell);z++)for(let x=Math.floor(Math.min(...xs)/cell);x<=Math.floor(Math.max(...xs)/cell);x++){
        const key=x+','+z;if(cells.has(key))continue;
        const cx=(x+.5)*cell,cz=(z+.5)*cell;
        let separated=false;
        for(let k=0;k<3;k++){
          const a=triangle[k],b=triangle[(k+1)%3],nx=b[1]-a[1],nz=a[0]-b[0],projected=triangle.map(t=>t[0]*nx+t[1]*nz);
          const centre=cx*nx+cz*nz,radius=cell/2*(Math.abs(nx)+Math.abs(nz));
          if(centre+radius<Math.min(...projected)-1e-8||centre-radius>Math.max(...projected)+1e-8){separated=true;break}
        }
        if(!separated)cells.add(key);
      }
    }
    const rows=new Map();
    for(const key of cells){const [x,z]=key.split(',').map(Number);if(!rows.has(z))rows.set(z,[]);rows.get(z).push(x)}
    for(const [z,xs] of rows){
      xs.sort((a,b)=>a-b);let start=xs[0],end=start;
      const append=()=>boxes.push(new THREE.Box3(new THREE.Vector3(start*cell,bounds.min.y-.1,z*cell),new THREE.Vector3((end+1)*cell,bounds.max.y,(z+1)*cell)));
      for(const x of xs.slice(1)){if(x>end+1){append();start=x}end=x}append();
    }
  }
  return boxes;
}
