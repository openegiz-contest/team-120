"""Export the two independent constrained pits and their steppe surroundings.

First run terrain_layout.py with QUARRY_TERRAIN_VARIANT=sarbay or sokolov.
Then run Blender --background --python this-file. No existing GLB is overwritten.
"""
import bpy, bmesh, json, os, math
import numpy as np
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/assets/rudny';OUT.mkdir(parents=True,exist_ok=True)
ART=Path(os.environ.get('QUARRY_ART_OUTPUT','/tmp/quarry-rudny-art'));ART.mkdir(parents=True,exist_ok=True)


def smooth(v):
    v=np.clip(v,0,1);return v*v*(3-2*v)


def field(x,z,kind):
    d=np.hypot(np.maximum(0,np.abs(x)-900),np.maximum(0,np.abs(z)-800))
    rolling=5*np.sin(x/730)*np.cos(z/810)+2*np.sin((x+z)/210)
    height=168+smooth(d/300)*rolling
    heaps=([(-1250,-250,95,510,330),(-1570,-700,140,600,390),(1350,600,70,470,350)]
           if kind=='sarbay' else [(1120,-570,125,390,620),(1500,-900,180,440,710),(-1320,800,65,650,300)])
    for cx,cz,h,rx,rz in heaps:
        r=np.maximum(np.abs((x-cx)/rx),np.abs((z-cz)/rz))
        ramp=np.clip((1.12-r)/.38,0,1)
        bench=(np.floor(ramp*5)+smooth((ramp*5)%1)) / 5
        height+=h*bench*smooth(d/200)
    return height.astype(np.float32)


def material(name,rgb):
    if bpy.data.materials.get(name):return bpy.data.materials[name]
    mat=bpy.data.materials.new(name);mat.diffuse_color=(*rgb,1);mat.use_nodes=True
    p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=.96
    return mat


def export(kind):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    source=ROOT/'model-source/terrain'/kind
    data=np.load(source/'terrain_mesh.npz');design=json.loads((source/'terrain_design.json').read_text())
    mesh=bpy.data.meshes.new(kind+' / constrained benches');mesh.from_pydata(data['vertices'].tolist(),[],data['faces'].tolist());mesh.update()
    names=['04_Gravel','16_Continuous_geology','Navigation / compacted road','Navigation / earth berm','15_Deep_stratum']
    for name in names:mesh.materials.append(material(name,(.5,.45,.35)))
    for polygon,index in zip(mesh.polygons,data['materials']):polygon.material_index=int(index)
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bad=sum(not edge.is_manifold for edge in bm.edges);degenerate=sum(face.calc_area()<1e-10 for face in bm.faces)
    assert bad==0 and degenerate==0,(kind,bad,degenerate)
    bm.to_mesh(mesh);bm.free()
    terrain=bpy.data.objects.new(kind+' / working quarry',mesh);bpy.context.collection.objects.link(terrain)
    terrain['asset_id']='GEO_001';terrain['map_id']=kind
    values=set(np.r_[0,420,500,np.arange(25,900,25),np.arange(900,2200,50),np.arange(2200,6000,200),np.arange(6000,14001,1000)])
    xs=zs=np.array(sorted(values|{-v for v in values}),dtype=np.float32);x,z=np.meshgrid(xs,zs);h=field(x,z,kind)
    vertices=np.stack([x,-z,h],axis=-1).reshape(-1,3);faces=[]
    for j in range(len(zs)-1):
        for i in range(len(xs)-1):
            if abs((xs[i]+xs[i+1])/2)<500 and abs((zs[j]+zs[j+1])/2)<420:continue
            a=j*len(xs)+i;b=a+1;c=a+len(xs);d=c+1;faces.extend([(a,c,b),(b,c,d)])
    land=bpy.data.meshes.new(kind+' / steppe and terraced spoil heaps');land.from_pydata(vertices.tolist(),[],faces);land.update()
    mat=material('Rudny / '+kind+' steppe',(.54,.43,.25) if kind=='sarbay' else (.37,.43,.35));mat.use_nodes=True
    colour=mat.node_tree.nodes.new('ShaderNodeVertexColor');colour.layer_name='Color';mat.node_tree.links.new(colour.outputs['Color'],mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color']);land.materials.append(mat)
    attr=land.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
    patch=.5+.5*np.sin(x/170)*np.cos(z/250);base=np.array([.82,.83,.73] if kind=='sarbay' else [.70,.86,.77]);colors=np.ones((x.size,4));blend=smooth((np.hypot(np.maximum(0,np.abs(x)-500),np.maximum(0,np.abs(z)-420))-28)/700).reshape(-1,1);colors[:,:3]=1+blend*(base+patch.reshape(-1,1)*.07-1);attr.data.foreach_set('color',colors.ravel())
    for polygon in land.polygons:polygon.use_smooth=True
    outside=bpy.data.objects.new('Continuous land outside quarry',land);bpy.context.collection.objects.link(outside)
    outside['rudny_surface']='outside'
    uv=land.uv_layers.new(name='UVMap')
    for loop in land.loops:
        co=land.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(co.x/30,co.y/30)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(OUT/(kind+'-terrain.glb')),export_format='GLB',use_selection=True,export_extras=True,export_draco_mesh_compression_enable=False,export_yup=True)
    route={'units':'metres','up':'Y','samples':[[float(s),float(p[0]),float(p[2]),float(-p[1])] for s,p in zip(data['station'],data['path'])]}
    (OUT/(kind+'-route.json')).write_text(json.dumps(route,separators=(',',':')))
    (OUT/(kind+'-design.json')).write_text(json.dumps(design,indent=2))
    h.astype('<f4').tofile(OUT/(kind+'-heights.f32'))
    profile={'map_id':kind,'xs':xs.tolist(),'zs':zs.tolist(),'heightFile':kind+'-heights.f32','artistic_interpretation':True,'coreTriangles':len(data['faces']),'outsideTriangles':len(faces),'nonManifoldEdges':bad,'degenerateFaces':degenerate}
    (OUT/(kind+'-profile.json')).write_text(json.dumps(profile,separators=(',',':')))
    bpy.ops.wm.save_as_mainfile(filepath=str(ART/(kind+'.blend')))
    print('RUDNY_EXPORT',kind,len(data['faces']),len(faces),flush=True)


for variant in ['sarbay','sokolov']:export(variant)
