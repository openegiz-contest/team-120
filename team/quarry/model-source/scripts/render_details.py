import bpy
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'Quarry_Diorama.blend'))
s=bpy.context.scene;c=s.camera
c.location=(395,95,380)
c.rotation_euler=(Vector((120,366,181))-c.location).to_track_quat('-Z','Y').to_euler()
c.data.ortho_scale=465
s.render.resolution_x=1800;s.render.resolution_y=1000;s.cycles.samples=48
s.render.filepath=str(ROOT/'Quarry_Plant_Detail.png')
bpy.ops.render.render(write_still=True)
