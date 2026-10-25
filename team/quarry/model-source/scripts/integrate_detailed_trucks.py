"""Replace four haul trucks with linked instances; preserve all other assets."""
import bpy, json, hashlib, struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BACKUP=ROOT/'backups/pre-truck-integration'
ASSET=ROOT/'truck/Truck_Detailed.blend'

def signature(ob):
    h=hashlib.sha256()
    for v in ob.data.vertices:h.update(struct.pack('<3f',*v.co))
    for p in ob.data.polygons:
        h.update(struct.pack('<I',len(p.vertices)))
        h.update(struct.pack('<'+'I'*len(p.vertices),*p.vertices))
    for row in ob.matrix_world:h.update(struct.pack('<4f',*row))
    return h.hexdigest()

def replace():
    old=sorted([o for o in bpy.context.scene.objects if str(o.get('asset_id','')).startswith('TRUCK_')],key=lambda o:o['asset_id'])
    assert len(old)==4
    poses=[(o['asset_id'],o.matrix_world.copy()) for o in old]
    other={o.name:signature(o) for o in bpy.context.scene.objects if o.type=='MESH' and o not in old}
    for o in old:bpy.data.objects.remove(o,do_unlink=True)
    with bpy.data.libraries.load(str(ASSET),link=False) as (src,dst):
        dst.collections=['TRUCK_01 / detailed reference asset']
    col=dst.collections[0];bpy.context.scene.collection.children.link(col)
    template=next(o for o in col.objects if o.get('asset_id')=='TRUCK_01')
    children=list(template.children)
    for index,(asset_id,matrix) in enumerate(poses):
        if index==0:root=template
        else:
            root=template.copy();col.objects.link(root)
            for ob in children:
                copy=ob.copy();copy.data=ob.data;col.objects.link(copy);copy.parent=root
        root.name=asset_id+' / detailed mining haul truck'
        root['asset_id']=asset_id;root['asset_type']='haul_truck';root.matrix_world=matrix
    bpy.context.view_layer.update()
    assert other=={name:signature(bpy.data.objects[name]) for name in other}
    return {'replaced_asset_ids':[x[0] for x in poses],'unchanged_mesh_objects':len(other),'unchanged_sha256':other,'shared_mesh_parts_per_truck':len(children),'positions':{k:list(m.translation) for k,m in poses}}

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
(ROOT/'truck/integration_validation.json').write_text(json.dumps(reports,indent=2))
print('TRUCK INTEGRATION OK',flush=True)
