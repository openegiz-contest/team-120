// Decorative water follows the exported terrain and stays outside driving space.
export function createMountainWatercourse(THREE, parent, profile, heightAt, night=false) {
  const rows=profile.watercourse?.points;
  if(!rows||rows.length<3)return null;
  const group=new THREE.Group();group.name='Scenery / stream and rock cascade';parent.add(group);
  const vertices=[],uv=[],cascades=[],indices=[];
  let station=0,largestDrop=0,fallIndex=1;
  rows.forEach((p,i)=>{
    const before=rows[Math.max(0,i-1)],after=rows[Math.min(rows.length-1,i+1)];
    const dx=after[0]-before[0],dz=after[2]-before[2],length=Math.hypot(dx,dz)||1;
    if(i){station+=Math.hypot(p[0]-before[0],p[1]-before[1],p[2]-before[2]);if(before[1]-p[1]>largestDrop){largestDrop=before[1]-p[1];fallIndex=i}}
    const cascade=Math.max(0,Math.min(1,(Math.abs(after[1]-before[1])/length-.3)/1.2));
    for(const side of [-1,1]){
      const x=p[0]-dz/length*p[3]*.5*side,z=p[2]+dx/length*p[3]*.5*side;
      const bed=heightAt(x,z),detach=cascade*2;
      vertices.push(x+dx/length*detach,Math.max(profile.lake[4]+.14,(bed??p[1])+.9),z+dz/length*detach);
      uv.push((side+1)*.5,station/16);cascades.push(cascade);
    }
    if(i<rows.length-1){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2)}
  });
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('aCascade',new THREE.Float32BufferAttribute(cascades,1));geometry.setIndex(indices);geometry.computeVertexNormals();
  const clock={value:0},foam={value:new THREE.Color(night?0x526f78:0xd5ede6)};
  const material=new THREE.MeshStandardMaterial({color:night?0x12353c:0x225f5c,roughness:.26,metalness:.18,side:THREE.DoubleSide,transparent:true,opacity:.94,depthWrite:false});
  material.onBeforeCompile=shader=>{
    shader.uniforms.riverTime=clock;shader.uniforms.riverFoam=foam;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float aCascade;varying float vCascade;varying vec2 vRiverUV;').replace('#include <begin_vertex>','#include <begin_vertex>\nvRiverUV=uv;vCascade=aCascade;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float riverTime;uniform vec3 riverFoam;varying vec2 vRiverUV;varying float vCascade;').replace('#include <map_fragment>',`
      #include <map_fragment>
      float flow=sin(vRiverUV.y*17.-riverTime*5.8+sin(vRiverUV.x*43.)*.7);
      float streak=pow(.5+.5*sin(vRiverUV.x*81.+sin(vRiverUV.y*3.-riverTime*2.)*.5),3.);
      float turbulence=clamp(vCascade*.65+streak*vCascade*.34+pow(max(0.,flow),10.)*.2,0.,1.);
      diffuseColor.rgb=mix(diffuseColor.rgb,riverFoam,turbulence);
    `).replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=normalize(normal+vec3(sin(vRiverUV.y*22.-riverTime*4.)*.08,0.,cos(vRiverUV.x*38.+riverTime)*.06));');
  };material.customProgramCacheKey=()=> 'mountain-watercourse-v1';
  const river=new THREE.Mesh(geometry,material);river.name='Ravine / flowing water';river.receiveShadow=true;group.add(river);
  if(largestDrop>8){
    let footIndex=fallIndex;while(footIndex<rows.length-2&&rows[footIndex][1]-rows[footIndex+1][1]>1.5)footIndex++;
    const foot=rows[Math.min(rows.length-1,footIndex+1)],positions=[],seeds=[];
    for(let i=0;i<96;i++){const angle=i*2.39996323,r=Math.sqrt((i+.5)/96)*22;positions.push(foot[0]+Math.cos(angle)*r,foot[1]+2,foot[2]+Math.sin(angle)*r*.7);seeds.push((i*.61803398875)%1)}
    const mistGeometry=new THREE.BufferGeometry();mistGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));mistGeometry.setAttribute('aSeed',new THREE.Float32BufferAttribute(seeds,1));
    const mistMaterial=new THREE.PointsMaterial({color:night?0x769394:0xdce7df,size:15,transparent:true,opacity:night?.08:.15,depthWrite:false});
    mistMaterial.onBeforeCompile=shader=>{
      shader.uniforms.riverTime=clock;
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float riverTime;attribute float aSeed;varying float vMistFade;').replace('#include <begin_vertex>',`#include <begin_vertex>
        float phase=fract(aSeed+riverTime*.045);vMistFade=sin(phase*3.14159265);
        transformed.y+=phase*24.;transformed.x+=sin(riverTime*.3+aSeed*19.)*4.;
      `);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vMistFade;').replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vMistFade*(1.-smoothstep(.08,.5,length(gl_PointCoord-.5)));');
    };mistMaterial.customProgramCacheKey=()=> 'mountain-cascade-mist-v1';
    const mist=new THREE.Points(mistGeometry,mistMaterial);mist.name='Cascade / drifting spray';mist.frustumCulled=false;group.add(mist);
  }
  return {group,update(time){clock.value=time*.001}};
}
