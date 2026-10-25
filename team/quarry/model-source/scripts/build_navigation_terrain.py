"""Integrate the constrained terrain without changing any vehicle/equipment meshes."""
import bpy,bmesh,json,hashlib,struct,math
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'terrain';BACKUP=ROOT/'backups/pre-navigation-terrain'
data=np.load(OUT/'terrain_mesh.npz');design=json.loads((OUT/'terrain_design.json').read_text())
P=data['path'];S=data['station'];NS=int(data['surface_faces'])
def signature(o):
    h=hashlib.sha256()
    for v in o.data.vertices:h.update(struct.pack('<3f',*v.co))
    for p in o.data.polygons:
        h.update(struct.pack('<I',len(p.vertices)));h.update(struct.pack('<'+'I'*len(p.vertices),*p.vertices))
    return h.hexdigest()
def road_position(point):
    i=int(np.argmin(np.linalg.norm(P[:,:2]-np.array(point[:2]),axis=1)))
    return i,P[i],data['grade'][i]
def make_materials():
    names=['04_Gravel','16_Continuous_geology','Navigation / compacted road','Navigation / earth berm','15_Deep_stratum']
    road=bpy.data.materials.get(names[2])
    if not road:
        road=bpy.data.materials.new(names[2]);road.use_nodes=True
        p=road.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.43,.34,.225,1);p.inputs['Roughness'].default_value=.96
        road.diffuse_color=(.43,.34,.225,1)
    berm=bpy.data.materials.get(names[3])
    if not berm:
        berm=bpy.data.materials.new(names[3]);berm.use_nodes=True
        p=berm.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.48,.39,.27,1);p.inputs['Roughness'].default_value=.94
        berm.diffuse_color=(.48,.39,.27,1)
    return [bpy.data.materials[n] for n in names]
def create_ground(collection):
    me=bpy.data.meshes.new('Navigation terrain / constrained watertight mesh')
    me.from_pydata(data['vertices'].tolist(),[],data['faces'].tolist());me.update()
    for m in make_materials():me.materials.append(m)
    for p,m in zip(me.polygons,data['materials']):p.material_index=int(m)
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bad=sum(not e.is_manifold for e in bm.edges);deg=sum(f.calc_area()<1e-10 for f in bm.faces)
    assert bad==0 and deg==0,(bad,deg)
    for f in bm.faces:f.smooth=False
    bm.to_mesh(me);bm.free();me.update()
    uv=me.uv_layers.new(name='UV0')
    for p in me.polygons:
        for li in p.loop_indices:
            co=me.vertices[me.loops[li].vertex_index].co
            if p.material_index==1:
                u=math.atan2(co.y+20,co.x)*10;v=(co.z+28)/196
            else:u,v=co.x/18,co.y/18
            uv.data[li].uv=(u,v)
        if p.material_index==1:
            vals=[uv.data[li].uv.x for li in p.loop_indices]
            if max(vals)-min(vals)>30:
                for li in p.loop_indices:
                    if uv.data[li].uv.x<0:uv.data[li].uv.x+=20*math.pi
    ob=bpy.data.objects.new('GEO_001 / solid terraced ground',me);collection.objects.link(ob)
    ob['asset_id']='GEO_001';ob['asset_type']='navigation_ready_terrain'
    ob['description']='Closed solid: integral smooth ramp, eight passing bays, safety berms, level platforms and geological benches.'
    ob['road_clear_width_m']=9.;ob['passing_bay_width_m']=19.;ob['passing_bay_count']=8
    return ob,{'non_manifold_edges':bad,'degenerate_faces':deg,'triangles':len(me.polygons),'vertices':len(me.vertices)}
def integrate():
    changed_prefixes=('GEO_','ROAD_','BERM_','SITE_002','SITE_003')
    unaffected={o.name:signature(o) for o in bpy.context.scene.objects if o.type=='MESH' and not str(o.get('asset_id','')).startswith(changed_prefixes)}
    old_ground=next(o for o in bpy.context.scene.objects if o.get('asset_id')=='GEO_001');col=old_ground.users_collection[0]
    # Existing asset IDs remain discoverable; replaced road strips are metadata nodes.
    for ob in list(bpy.context.scene.objects):
        asset_id=str(ob.get('asset_id',''))
        if not asset_id.startswith(changed_prefixes):continue
        if asset_id=='GEO_001':bpy.data.objects.remove(ob,do_unlink=True);continue
        name=ob.name;collections=list(ob.users_collection);props=dict(ob.items())
        bpy.data.objects.remove(ob,do_unlink=True)
        empty=bpy.data.objects.new(name,None)
        for c in collections:c.objects.link(empty)
        for k,v in props.items():empty[k]=v
        empty['geometry_replaced_by']='GEO_001'
        if asset_id=='ROAD_001':
            empty['road_width_m']=9.;empty['length_m']=design['road_length_m'];empty['max_grade_percent']=design['max_grade_percent'];empty['passing_bays']=8
    ground,report=create_ground(col)
    # Seating existing static trucks on the rebuilt road is a placement correction only.
    placements=[]
    for ob in bpy.context.scene.objects:
        asset_id=str(ob.get('asset_id',''))
        if asset_id in ['TRUCK_01','TRUCK_02','TRUCK_03']:
            before=list(ob.location);i,p,g=road_position(ob.location)
            ob.location.z=float(p[2])+.025
            yaw=ob.rotation_euler.z;ob.rotation_mode='XYZ';ob.rotation_euler=(0,math.atan(-g),yaw)
            placements.append({'id':asset_id,'before':before,'after':list(ob.location),'pitch_radians':math.atan(-g)})
    bpy.context.view_layer.update()
    assert unaffected=={name:signature(bpy.data.objects[name]) for name in unaffected},'Equipment geometry changed'
    report.update(unchanged_equipment_meshes=len(unaffected),static_truck_seating=placements)
    return ground,report
def select_all_assets():
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects:
        if o.type in ['MESH','EMPTY']:o.select_set(True)
opts=dict(use_selection=True,export_extras=True,export_tangents=True,export_cameras=False,export_lights=False)
reports={}
bpy.ops.wm.open_mainfile(filepath=str(BACKUP/'Quarry_Diorama.blend'))
ground,reports['master']=integrate();scene=bpy.context.scene
scene['road_width_m']=9.;scene['passing_bays']=8;scene['game_logic_added']=False
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Quarry_Diorama.blend'))
select_all_assets();bpy.ops.export_scene.gltf(filepath=str(ROOT/'Quarry_Diorama.glb'),export_format='GLB',**opts)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'gltf/Quarry_Diorama.gltf'),export_format='GLTF_SEPARATE',export_texture_dir='textures',**opts)
bpy.ops.object.select_all(action='DESELECT');ground.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'Quarry_Terrain.glb'),export_format='GLB',**opts)
for o in list(scene.objects):
    if o!=ground and o.type not in ['CAMERA','LIGHT']:bpy.data.objects.remove(o,do_unlink=True)
for image in bpy.data.images:
    if image.source=='FILE' and not image.packed_file:
        try:image.pack()
        except RuntimeError:pass
scene.camera.location=(1020,-1270,1300);scene.camera.rotation_euler=(Vector((0,0,60))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
scene.camera.data.ortho_scale=1360
scene.render.resolution_x=1800;scene.render.resolution_y=1500;scene.cycles.samples=32
scene.render.threads_mode='FIXED';scene.render.threads=6
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Quarry_Terrain.blend'))
scene.render.filepath=str(OUT/'Terrain_Hero.png');bpy.ops.render.render(write_still=True)
scene.camera.location=(0,-40,1700);scene.camera.rotation_euler=(Vector((0,-20,0))-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=1120
scene.render.resolution_x=1800;scene.render.resolution_y=1500;scene.render.filepath=str(OUT/'Terrain_Top.png');bpy.ops.render.render(write_still=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(BACKUP/'Quarry_WebGL.glb'))
ground,reports['webgl']=integrate();select_all_assets()
bpy.ops.export_scene.gltf(filepath=str(ROOT/'Quarry_WebGL.glb'),export_format='GLB',**opts)
(OUT/'integration_validation.json').write_text(json.dumps(reports,indent=2))
print('TERRAIN INTEGRATED',json.dumps(reports),flush=True)
