"""Re-import both deployment GLBs and check the welded ground topology."""
import bpy,bmesh,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
reports=[]
for name in ['Quarry_WebGL.glb','Quarry_WebGL_Draco.glb']:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/name))
    obs=[o for o in bpy.context.scene.objects if o.type=='MESH']
    ground=next(o for o in obs if o.get('asset_id')=='GEO_001')
    bm=bmesh.new();bm.from_mesh(ground.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001)
    bad=sum(not e.is_manifold for e in bm.edges)
    deg=sum(f.calc_area()<1e-8 for f in bm.faces)
    bm.free()
    report={'file':name,'reimported_mesh_objects':len(obs),'ground_non_manifold_edges_after_seam_weld':bad,'ground_degenerate_faces':deg,'named_assets_with_ids':sum(bool(o.get('asset_id')) for o in obs)}
    print(report,flush=True);reports.append(report)
(ROOT/'roundtrip_validation.json').write_text(json.dumps(reports,indent=2))
