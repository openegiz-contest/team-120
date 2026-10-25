"""Remove zero-area remnants of simplification without opening the terrain shell."""
import bpy,bmesh,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'Quarry_WebGL.glb'))
ground=next(o for o in bpy.context.scene.objects if o.get('asset_id')=='GEO_001')
bm=bmesh.new();bm.from_mesh(ground.data)
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
small=[f for f in bm.faces if f.calc_area()<1e-8]
print('Small faces before',[(f.calc_area(),[tuple(v.co) for v in f.verts]) for f in small],flush=True)
bmesh.ops.dissolve_degenerate(bm,dist=.00001,edges=list(bm.edges))
bmesh.ops.triangulate(bm,faces=list(bm.faces))
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
bad=sum(not e.is_manifold for e in bm.edges);deg=sum(f.calc_area()<1e-8 for f in bm.faces)
print('Repaired terrain:',bad,'non manifold edges;',deg,'degenerate faces',flush=True)
assert bad==0 and deg==0,'Repair would compromise terrain topology'
bm.to_mesh(ground.data);bm.free()
bpy.ops.export_scene.gltf(filepath=str(ROOT/'Quarry_WebGL.glb'),export_format='GLB',export_extras=True,export_yup=True,export_tangents=True,export_cameras=False,export_lights=False)
