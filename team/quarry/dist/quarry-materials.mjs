// Career-only appearance. No displacement, graph changes, or GLB mutations.
const header = `
varying vec3 vQuarryPosition;
varying vec3 vQuarryNormal;
uniform sampler2D quarryAlbedo;
uniform sampler2D quarryNormal;
uniform sampler2D quarryRoughness;
uniform float quarryScale;
vec3 quarryWeights() {
  vec3 w=pow(abs(normalize(vQuarryNormal)),vec3(6.0));
  return w/max(w.x+w.y+w.z,0.0001);
}
vec4 quarrySample(sampler2D tex, vec3 p, vec3 w) {
  return texture2D(tex,p.yz)*w.x+texture2D(tex,p.xz)*w.y+texture2D(tex,p.xy)*w.z;
}
`;

function surfaceMaterial(THREE, source, maps, kind) {
  const material=source.clone();
  material.name=source.name;material.color.set(0xffffff);material.metalness=0;
  material.side=THREE.FrontSide;
  // Our world-space maps replace the baked UV maps, including their stretched normals.
  material.map=null;material.normalMap=null;material.roughnessMap=null;material.metalnessMap=null;
  material.roughness=1;
  const rock=kind==='rock', road=kind==='road', concrete=kind==='concrete';
  const scale=rock?9:road?7:concrete?10:16;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{
      quarryAlbedo:{value:maps.albedo},quarryNormal:{value:maps.normal},
      quarryRoughness:{value:maps.roughness},quarryScale:{value:scale}
    });
    shader.vertexShader=shader.vertexShader.replace('#include <common>',
      '#include <common>\nvarying vec3 vQuarryPosition;\nvarying vec3 vQuarryNormal;');
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvQuarryPosition=(modelMatrix*vec4(transformed,1.0)).xyz;\nvQuarryNormal=mat3(modelMatrix)*objectNormal;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+header);
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      vec3 qw=quarryWeights(),qp=vQuarryPosition/quarryScale;
      vec3 qc=quarrySample(quarryAlbedo,qp,qw).rgb;
      // A second, large-scale sample breaks the repeated tile pattern across the pit.
      float qm=texture2D(quarryRoughness,vQuarryPosition.xz/173.0).g;
      float qpatch=sin(vQuarryPosition.x*.017+sin(vQuarryPosition.z*.022)*2.0)
                  *sin(vQuarryPosition.z*.013-vQuarryPosition.x*.009);
      qc*=.88+(qm-.88)*2.0+qpatch*${road?'.025':'.13'};
      ${rock?`
      // The old diorama's vertical cut faces sit inside the new landscape.
      // Hide their exposed rim instead of letting it bleed through the land seam.
      if((abs(vQuarryPosition.x)>499.5||abs(vQuarryPosition.z)>419.5)&&vQuarryPosition.y<168.05)discard;
      float qalt=vQuarryPosition.y+3.5*sin(vQuarryPosition.x*.021)+2.5*sin(vQuarryPosition.z*.027);
      float qlayer=sin(qalt*.29+sin(qalt*.073)*2.0);
      vec3 qtint=mix(vec3(.75,.80,.82),vec3(1.10,.97,.78),smoothstep(-.5,.65,qlayer));
      float qseam=1.0-.23*pow(.5+.5*sin(qalt*1.37+qpatch),18.0);
      qc*=qtint*qseam;
      `:''}
      ${concrete?'qc=mix(qc,vec3(.22,.23,.215),.66);':''}
      diffuseColor.rgb*=qc;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      'float roughnessFactor=clamp(quarrySample(quarryRoughness,qp,qw).g,.78,1.0);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
      vec2 qnx=texture2D(quarryNormal,qp.yz).xy*2.0-1.0;
      vec2 qny=texture2D(quarryNormal,qp.xz).xy*2.0-1.0;
      vec2 qnz=texture2D(quarryNormal,qp.xy).xy*2.0-1.0;
      vec3 qdetail=vec3(0.0,qnx.x,qnx.y)*qw.x+vec3(qny.x,0.0,qny.y)*qw.y+vec3(qnz.x,qnz.y,0.0)*qw.z;
      vec3 qbase=normalize(vQuarryNormal);
      qdetail-=qbase*dot(qbase,qdetail);
      normal=normalize(normal+mat3(viewMatrix)*qdetail*${rock?'1.15':road?'.3':'.65'});
    `);
  };
  material.customProgramCacheKey=()=>`quarry-surface-v1-${kind}`;
  return material;
}

export async function loadQuarrySurfaceMaps(THREE,renderer) {
  const loader=new THREE.TextureLoader(),sets={};
  await Promise.all(['rock','gravel','road'].map(async kind=>{
    const entries=await Promise.all(['albedo','normal','roughness'].map(async channel=>{
      const texture=await loader.loadAsync(`./assets/surfaces/${kind}-${channel}.png`);
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
      texture.colorSpace=channel==='albedo'?THREE.SRGBColorSpace:THREE.NoColorSpace;
      texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
      return [channel,texture];
    }));
    sets[kind]=Object.fromEntries(entries);
  }));
  return sets;
}

export function applyQuarrySurfaceMaterials(THREE,root,sets) {
  const cache=new Map();let changed=0;
  root.traverse(object=>{
    if(!object.isMesh)return;
    // Continuous world-space textures and improved depth precision replace this overlay.
    if(object.name==='Quarry edge precision collar')object.visible=false;
    const replace=source=>{
      let kind;
      if(source.name==='16_Continuous_geology')kind='rock';
      else if(/^04_Gravel(?:\.\d+)?$/.test(source.name)||source.name==='Navigation / earth berm')kind='gravel';
      else if(source.name==='Navigation / compacted road'||object.name==='Decorative access road')kind='road';
      else if(/^10_Concrete(?:\.\d+)?$/.test(source.name))kind='concrete';
      if(!kind)return source;
      if(!cache.has(source))cache.set(source,surfaceMaterial(THREE,source,sets[kind==='concrete'?'road':kind],kind));
      changed++;return cache.get(source);
    };
    if(object.material)object.material=Array.isArray(object.material)?object.material.map(replace):replace(object.material);
  });
  return changed;
}
