"""Replace only the requested excavator in the master and WebGL scenes."""
import bpy, json, hashlib, struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BACKUP=ROOT/'backups/pre-detailed-excavator'
ASSET=ROOT/'excavator/Excavator_Detailed.blend'

def mesh_signature(ob):
    h=hashlib.sha256()
    for v in ob.data.vertices:h.update(struct.pack('<3f',*v.co))
    for p in ob.data.polygons:
        h.update(struct.pack('<I',len(p.vertices)))
        h.update(struct.pack('<'+'I'*len(p.vertices),*p.vertices))
    for row in ob.matrix_world:h.update(struct.pack('<4f',*row))
    return h.hexdigest()

def replace():
    other={o.name:mesh_signature(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.get('asset_id')!='EXCAVATOR_01'}
    old=[o for o in bpy.context.scene.objects if o.get('asset_id')=='EXCAVATOR_01']
    assert len(old)==1, 'Expected exactly one excavator to replace'
    bpy.data.objects.remove(old[0],do_unlink=True)
    with bpy.data.libraries.load(str(ASSET),link=False) as (src,dst):
        dst.collections=['EXCAVATOR_01 / detailed reference asset']
    col=dst.collections[0];bpy.context.scene.collection.children.link(col)
    root=next(o for o in col.objects if o.get('asset_id')=='EXCAVATOR_01')
    root.location=(-29,-37,.055)
    bpy.context.view_layer.update()
    after={name:mesh_signature(bpy.data.objects[name]) for name in other}
    assert other==after, 'Unrelated geometry or transforms changed'
    return {'unchanged_mesh_objects':len(other),'unchanged_mesh_sha256':other,'excavator_asset_id':root['asset_id'],'position_blender_m':list(root.location),'detail_parts':sum(o.type=='MESH' for o in col.objects)}

def select_assets():
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects:
        if o.type in ['MESH','EMPTY']:o.select_set(True)

opts=dict(use_selection=True,export_extras=True,export_tangents=True,export_cameras=False,export_lights=False)
reports={}
bpy.ops.wm.open_mainfile(filepath=str(BACKUP/'Quarry_Diorama.blend'))
reports['master']=replace();select_assets()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Quarry_Diorama.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'Quarry_Diorama.glb'),export_format='GLB',**opts)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'gltf/Quarry_Diorama.gltf'),export_format='GLTF_SEPARATE',export_texture_dir='textures',**opts)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(BACKUP/'Quarry_WebGL.glb'))
reports['webgl']=replace();select_assets()
bpy.ops.export_scene.gltf(filepath=str(ROOT/'Quarry_WebGL.glb'),export_format='GLB',**opts)
(ROOT/'excavator/integration_validation.json').write_text(json.dumps(reports,indent=2))
print('INTEGRATED',json.dumps({k:{x:y for x,y in v.items() if x!='unchanged_mesh_sha256'} for k,v in reports.items()}),flush=True)
