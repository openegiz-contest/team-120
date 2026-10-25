"""Validate exported graph samples against original terrain, without changing assets."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
root=Path('/home/ali/Documents/Quarry_Diorama')
bpy.ops.wm.open_mainfile(filepath=str(root/'terrain/Quarry_Terrain.blend'))
ob=next(o for o in bpy.context.scene.objects if o.get('asset_id')=='GEO_001')
bvh=BVHTree.FromObject(ob,bpy.context.evaluated_depsgraph_get())
g=json.loads((root/'site-viewer/dist/assets/road-graph.json').read_text())
nodes={n['id']:n for n in g['nodes']};failures=[];count=0;max_error=0
for e in g['edges']:
    a,b=nodes[e['from']],nodes[e['to']]
    pa,pb=Vector(a['position']),Vector(b['position']);d=pb-pa
    normal=Vector((-d.z,0,d.x)).normalized()
    for step in range(math.ceil(e['length']/1.5)+1):
        u=min(1,step*1.5/e['length']);center=pa.lerp(pb,u)
        for side in [-2.92,0,2.92]:
            p=center+normal*side;hit,no,face,dist=bvh.ray_cast(Vector((p.x,-p.z,400)),Vector((0,0,-1)))
            count+=1
            if hit is None:failures.append({'edge':e['id'],'miss':True});continue
            error=abs(hit.z-p.y);max_error=max(max_error,error)
            if error>.3:failures.append({'edge':e['id'],'s':a['s']+(b['s']-a['s'])*u,'lateral':side,'error_m':error})
report={'samples':count,'maximum_height_error_m':max_error,'errors_over_30cm':len(failures),'first_errors':failures[:30]}
(root/'site-viewer/tests/graph_surface_report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report),flush=True)
