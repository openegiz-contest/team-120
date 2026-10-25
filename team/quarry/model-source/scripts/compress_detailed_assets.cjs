// Use the glTF Transform installation passed as package.json in argv[2].
// A shared 22-bit position grid retains matching geological seams and sub-mm detail.
const {createRequire}=require('module');
const {join,dirname}=require('path');
const {statSync}=require('fs');
const req=createRequire(process.argv[2]);
const {NodeIO,PropertyType}=req('@gltf-transform/core');
const {dedup}=req('@gltf-transform/functions');
const {ALL_EXTENSIONS,KHRDracoMeshCompression}=req('@gltf-transform/extensions');
const draco=req('draco3dgltf');
async function main(){
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.encoder':await draco.createEncoderModule(),
    'draco3d.decoder':await draco.createDecoderModule()
  });
  const root=join(__dirname,'..');
  for(const [input,output] of [
    ['Quarry_WebGL.glb','Quarry_WebGL_Draco.glb'],
    ['excavator/Excavator_Detailed.glb','excavator/Excavator_Detailed_Draco.glb'],
    ['truck/Truck_Detailed.glb','truck/Truck_Detailed_Draco.glb'],
    ['terrain/Quarry_Terrain.glb','terrain/Quarry_Terrain_Draco.glb']
  ]){
    const doc=await io.read(join(root,input));
    await doc.transform(dedup({propertyTypes:[PropertyType.TEXTURE]}));
    doc.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({
      encodeSpeed:5,decodeSpeed:5,quantizationBits:{POSITION:22,NORMAL:14,TEX_COORD:16,GENERIC:16},quantizationVolume:'scene'
    });
    await io.write(join(root,output),doc);
    console.log(JSON.stringify({output,bytes:statSync(join(root,output)).size}));
  }
}
main().catch(e=>{console.error(e);process.exit(1)});
