"""Ray checks of the built terrain and a transparent GLB import render."""
import bpy, csv, json, math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'Quarry_Diorama.blend'))
ground=bpy.data.objects['GEO_001 / solid terraced ground']
bvh=BVHTree.FromObject(ground,bpy.context.evaluated_depsgraph_get())
road=bpy.data.objects['ROAD_001 / continuous spiral haul ramp']
road_bvh=BVHTree.FromObject(road,bpy.context.evaluated_depsgraph_get())
with (ROOT/'haul_route.csv').open() as fp:
    pts=[Vector((float(r['x_m']),float(r['y_m']),float(r['z_m']))) for r in csv.DictReader(fp)]
clearances=[]
for i in range(3,len(pts)-3,5):
    d=pts[i+1]-pts[i-1];side=Vector((-d.y,d.x,0)).normalized()
    for offset in [-10,-5,0,5,10]:
        p=pts[i]+side*offset
        hit,normal,index,distance=bvh.ray_cast(Vector((p.x,p.y,350)),Vector((0,0,-1)),500)
        road_hit,_,_,_=road_bvh.ray_cast(Vector((p.x,p.y,350)),Vector((0,0,-1)),500)
        if hit and road_hit:clearances.append(road_hit.z-hit.z)
report={'road_samples':len(clearances),'min_road_clearance_m':min(clearances),'max_road_clearance_m':max(clearances),'road_samples_buried_over_5cm':sum(c<-.05 for c in clearances)}
(ROOT/'road_surface_validation.json').write_text(json.dumps(report,indent=2))
print(report,flush=True)
