"""Blender-authored mountain meshes, graded access road and botanical LODs.

Run with Blender --background --python this-file -- [quarry|altai|both] [--render].
The working quarry is imported only for .blend previews, never rewritten.
"""
import bpy, math, json, random, sys, struct, os
import numpy as np
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from terrain_sculpting import sculpt_relief, river_x, watercourse_profile

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/assets/mountains';OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT.parent/'mountain-worlds';SOURCE.mkdir(exist_ok=True)
if os.environ.get('QUARRY_ART_OUTPUT'):
    SOURCE=Path(os.environ['QUARRY_ART_OUTPUT']);SOURCE.mkdir(parents=True,exist_ok=True)
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []

def smooth(a):
    a=np.clip(a,0,1);return a*a*(3-2*a)

def noise(x,z,scale,seed=0):
    x=x/scale;z=z/scale;ix=np.floor(x);iz=np.floor(z);u=smooth(x-ix);v=smooth(z-iz)
    def h(a,b):
        n=np.sin(a*127.1+b*311.7+seed*74.7)*43758.5453123
        return n-np.floor(n)
    return ((h(ix,iz)*(1-u)+h(ix+1,iz)*u)*(1-v)+(h(ix,iz+1)*(1-u)+h(ix+1,iz+1)*u)*v)*2-1

def axes(half):
    values=set([0.,float(half),500.,420.,14000.])
    values.update(np.arange(12.5,900,12.5));values.update(np.arange(900,2000,25));values.update(np.arange(2000,6000,100));values.update(np.arange(6000,14000,500))
    return np.array(sorted(values|{-v for v in values}),dtype=np.float32)

def spline(points,steps=24):
    points=np.array(points,dtype=float);out=[]
    for i in range(len(points)-1):
        a,b,c,d=points[max(0,i-1)],points[i],points[i+1],points[min(len(points)-1,i+2)]
        for t in np.linspace(0,1,steps,endpoint=False):out.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
    return np.array(out+[points[-1]])

ROAD=spline([[260,-408,168],[285,-510,168],[385,-660,171],[610,-830,185],[830,-1050,203],[825,-1270,218],[610,-1450,230],[310,-1520,242],[40,-1720,255],[20,-1960,267],[200,-2180,282],[470,-2460,300],[730,-2830,322],[650,-3230,345],[420,-3660,369],[510,-4300,390],[890,-5100,418],[1100,-6200,447],[1350,-8000,490],[1250,-10500,520],[900,-14000,550]])
ROAD_S=np.r_[0,np.cumsum(np.linalg.norm(np.diff(ROAD,axis=0),axis=1))]

def road_distance(x,z):
    best=np.full(np.shape(x),np.inf);height=np.zeros(np.shape(x));station=np.zeros(np.shape(x))
    for i,(a,b) in enumerate(zip(ROAD[:-1],ROAD[1:])):
        d=b-a;u=np.clip(((x-a[0])*d[0]+(z-a[1])*d[1])/(d[0]**2+d[1]**2),0,1)
        dist=(x-a[0]-u*d[0])**2+(z-a[1]-u*d[1])**2;mask=dist<best
        height=np.where(mask,a[2]+u*d[2],height);station=np.where(mask,ROAD_S[i]+u*(ROAD_S[i+1]-ROAD_S[i]),station);best=np.minimum(best,dist)
    return np.sqrt(best),height,station

def make_field(kind):
    xs,zs=axes(500),axes(420);x,z=np.meshgrid(xs,zs);distance=np.hypot(np.maximum(0,np.abs(x)-500),np.maximum(0,np.abs(z)-420))
    altai=kind=='altai'
    chains=[([[-2100,-650,570],[-1650,-1170,1040],[-1050,-1970,1510],[-800,-3000,2230],[-2000,-4500,2520]],950),
            ([[900,-900,400],[1550,-1550,1300],[2460,-2220,1870],[3400,-3300,2520],[4600,-4300,2760]],1100),
            ([[-1800,750,500],[-2650,1500,1300],[-3350,2600,2080],[-4500,3500,2300]],1050),
            ([[1900,1100,380],[3000,2150,1240],[3450,3600,1870],[4400,4800,2200]],1100)]
    wx=x+noise(x,z,750,4)*125;wz=z+noise(x,z,850,8)*145
    mountain=np.zeros_like(x)
    for points,width in chains:
        for a,b in zip(points[:-1],points[1:]):
            a=np.array(a);b=np.array(b);d=b-a;t=np.clip(((wx-a[0])*d[0]+(wz-a[1])*d[1])/(d[0]**2+d[1]**2),0,1)
            r=np.hypot(wx-a[0]-t*d[0],wz-a[1]-t*d[1]);ridge=np.maximum(0,1-r/width)**1.45
            mountain=np.maximum(mountain,(a[2]+t*d[2])*ridge)
    # Sharp ridges and multiscale erosion, rather than radial Gaussian domes.
    erosion=np.zeros_like(x);amp=1
    for j,scale in enumerate([480,230,105,48,22]):
        n=noise(wx,wz,scale,20+j);erosion+=amp*(.55-np.abs(n));amp*=.48
    mountain*=np.clip(.84+erosion*.66,.43,1.38)
    channel=np.abs(noise(wx+noise(x,z,320,6)*90,wz,185,9))
    mountain-=mountain*.37*np.exp(-channel*8)
    if not altai:mountain*=.53
    foothill=18*noise(x,z,340,2)+9*noise(x,z,90,12)+4*noise(x,z,30,3)
    # Layered bedrock steps make the foothills visibly fractured.
    terrace=(np.floor((mountain+foothill)/18)*18-(mountain+foothill))*smooth(mountain/300)*.05
    h=168+smooth((distance-28)/220)*(mountain+foothill+terrace)
    h=sculpt_relief(x,z,h,kind,noise)
    # An incised dry drainage channel on the southern foreland.
    creek=np.abs(z-(820+150*np.sin(x/430)+.12*x));h-=smooth((distance-80)/220)*(17 if altai else 25)*np.exp(-(creek/42)**2)
    rd,rh,station=road_distance(x,z)
    # Broad cut-and-fill shoulders prevent a narrow road carving saw-tooth cliffs
    # into the progressively coarser distant mesh.
    corridor=np.maximum(48,np.maximum(np.abs(x),np.abs(z))*.065)
    shoulder=180+np.abs(h-rh)*2.1
    road_blend=1-smooth((rd-corridor)/shoulder);h=h*(1-road_blend)+rh*road_blend
    # A contained basin lies outside the drivable perimeter.
    lake=(-1160.,830.,185.,100.);lx,lz,rx,rz=lake;q=np.sqrt(((x-lx)/rx)**2+((z-lz)/rz)**2)
    lake_mix=1-smooth((q-.78)/.65);basin=135+27*smooth((q-.65)/.65);h=h*(1-lake_mix)+basin*lake_mix
    h=np.where(distance<=28,168,h).astype(np.float32)
    return xs,zs,h,rd,lake

def sample(xs,zs,h,x,z):
    i=int(np.clip(np.searchsorted(xs,x,side='right')-1,0,len(xs)-2));j=int(np.clip(np.searchsorted(zs,z,side='right')-1,0,len(zs)-2))
    u=np.clip((x-xs[i])/(xs[i+1]-xs[i]),0,1);v=np.clip((z-zs[j])/(zs[j+1]-zs[j]),0,1)
    a,b,c,d=map(float,[h[j,i],h[j,i+1],h[j+1,i],h[j+1,i+1]])
    return float(a+(b-a)*u+(c-a)*v if u+v<=1 else d+(c-d)*(1-u)+(b-d)*(1-v))

def mesh(name,vertices,faces,material,uv=None,colors=None):
    me=bpy.data.meshes.new(name);me.from_pydata(vertices,[],faces);me.update();ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob)
    if material:me.materials.append(material)
    if uv is not None:
        layer=me.uv_layers.new(name='UVMap');flat=np.array(uv,dtype=np.float32)[np.array([l.vertex_index for l in me.loops])].ravel();layer.data.foreach_set('uv',flat)
    if colors is not None:
        attr=me.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT');attr.data.foreach_set('color',np.array(colors,dtype=np.float32).ravel())
    for p in me.polygons:p.use_smooth=True
    return ob

def material(name,color,texture=None,vertex=False,roughness=.9):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1);n=m.node_tree.nodes;p=n.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=roughness
    output=None
    if texture:
        t=n.new('ShaderNodeTexImage');t.image=texture;output=t.outputs['Color']
    if vertex:
        c=n.new('ShaderNodeVertexColor');c.layer_name='Color'
        if output:
            mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;m.node_tree.links.new(output,mix.inputs[1]);m.node_tree.links.new(c.outputs['Color'],mix.inputs[2]);output=mix.outputs[0]
        else:output=c.outputs['Color']
    if output:m.node_tree.links.new(output,p.inputs['Base Color'])
    return m

def image_from_array(name,a):
    im=bpy.data.images.new(name,width=a.shape[1],height=a.shape[0],alpha=True);im.pixels.foreach_set(a.astype(np.float32).ravel());im.filepath_raw=str(OUT/(name+'.png'));im.file_format='PNG';im.save();im.pack();return im

def textures():
    n=512;z,x=np.mgrid[0:n,0:n];detail=.68+.11*noise(x,z,130,4)+.12*noise(x,z,21,8)+.08*noise(x,z,4,2);a=np.ones((n,n,4));a[:,:,:3]=detail[:,:,None];stone=image_from_array('mountain-grain',a)
    n=256;a=np.zeros((n,n,4));rng=random.Random(8612)
    def line(x0,y0,x1,y1,color,width=1):
        num=int(max(abs(x1-x0),abs(y1-y0))*1.5)+1
        for xx,yy in zip(np.linspace(x0,x1,num),np.linspace(y0,y1,num)):
            ix,iy=int(xx),int(yy)
            if width<=ix<n-width and width<=iy<n-width:a[iy-width:iy+width+1,ix-width:ix+width+1]=(*color,1)
    line(128,12,128,241,(.24,.21,.12),1)
    for yy in range(30,239,6):
        for side in [-1,1]:
            length=(1-(yy/260)**1.7)*92*rng.uniform(.6,1);endx=128+side*length;endy=yy+28
            line(128,yy,endx,endy,(.18,.22,.08),1)
            for t in np.linspace(.08,1,14):
                px=128+side*length*t;py=yy+28*t;c=(rng.uniform(.19,.33),rng.uniform(.30,.48),rng.uniform(.10,.22))
                line(px,py,px+side*rng.uniform(3,11),py+rng.uniform(8,20),c,1)
                line(px,py,px-side*3,py+rng.uniform(8,17),c,1)
    needles=image_from_array('cedar-bough',a)
    leaf=material('Botany / needles',(.3,.44,.17),needles,roughness=.85);p=leaf.node_tree.nodes.get('Principled BSDF');tex=next(n for n in leaf.node_tree.nodes if n.type=='TEX_IMAGE');cut=leaf.node_tree.nodes.new('ShaderNodeMath');cut.operation='GREATER_THAN';cut.inputs[1].default_value=.32;leaf.node_tree.links.new(tex.outputs['Alpha'],cut.inputs[0]);leaf.node_tree.links.new(cut.outputs[0],p.inputs['Alpha']);leaf.use_backface_culling=False
    return stone,leaf

def tree_template(leaf,detail):
    rng=random.Random(58+detail);verts=[];faces=[];uv=[];tiers=10 if detail else 5
    for tier in range(tiers):
        height=3+tier*(16/(tiers-1));length=(1-tier/(tiers+1))*4.5;arms=6 if detail else 4
        for arm in range(arms):
            angle=arm*math.tau/arms+tier*2.4+rng.uniform(-.18,.18);rad=Vector((math.cos(angle),math.sin(angle),0));side=Vector((-rad.y,rad.x,0));start=Vector((0,0,height));end=start+rad*(length*rng.uniform(.85,1.13))+Vector((0,0,-length*.15))
            for tilt in [0,1.15]:
                half=side*math.cos(tilt)*length*.45+Vector((0,0,math.sin(tilt)*length*.45));i=len(verts);verts.extend([tuple(start-half),tuple(start+half),tuple(end+half),tuple(end-half)]);faces.extend([(i,i+1,i+2),(i,i+2,i+3)]);uv.extend([(0,0),(1,0),(1,1),(0,1)])
    foliage=mesh('Cedar_'+('near' if detail else 'far')+'_needles',verts,faces,leaf,uv)
    bark=material('Botany / bark',(.16,.12,.075));bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=.39,radius2=.045,depth=21,location=(0,0,10.5));trunk=bpy.context.object;trunk.name='Cedar_'+('near' if detail else 'far')+'_trunk';trunk.data.materials.append(bark)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    return [foliage,trunk]

def terrain_mesh(kind,xs,zs,h,rd,stone):
    x,z=np.meshgrid(xs,zs);vertices=np.stack([x,-z,h],axis=-1).reshape(-1,3);faces=[]
    for j in range(len(zs)-1):
        for i in range(len(xs)-1):
            if abs((xs[i]+xs[i+1])/2)<500 and abs((zs[j]+zs[j+1])/2)<420:continue
            a=j*len(xs)+i;b=a+1;c=a+len(xs);d=c+1;faces.extend([(a,c,b),(b,c,d)])
    dz,dx=np.gradient(h,zs,xs);slope=np.hypot(dx,dz);mottle=noise(x,z,170,3)*.12+noise(x,z,35,31)*.045
    grass=np.array([.22,.29,.12] if kind=='altai' else [.34,.32,.21]);rock=np.array([.34,.35,.34] if kind=='altai' else [.39,.35,.29]);cliff=smooth((slope-.37)/.8)
    c=grass[None,None,:]*(1-cliff[:,:,None])+rock[None,None,:]*cliff[:,:,None];c+=mottle[:,:,None]*.35
    # Dark jointed rock faces and green shelves use geometry-derived slope masks.
    stone_tint=np.array([.065,.082,.078] if kind=='altai' else [.095,.108,.095])
    meadow_tint=np.array([.19,.355,.075] if kind=='altai' else [.29,.335,.135])
    rock_face=smooth((slope-.52)/.9)
    wet=np.exp(-(np.abs(x-river_x(z))/110)**2)*smooth((z+710)/100)*(1-smooth((z-780)/100))
    meadow=meadow_tint[None,None,:]+np.array([-.025,.065,-.01])*wet[:,:,None]
    geology=meadow*(1-rock_face[:,:,None])+stone_tint*rock_face[:,:,None]
    strata=.5+.5*np.sin(h*.16+noise(x,z,120,63)*3)
    geology*= (.86+strata*.17+mottle*.4)[:,:,None]
    exterior=smooth(np.hypot(np.maximum(0,np.abs(x)-500),np.maximum(0,np.abs(z)-420))/130)
    c=c*(1-exterior[:,:,None]*.88)+geology*exterior[:,:,None]*.88
    # Depositional fans and mineral seams break up the single sand-colour field.
    scree=smooth((noise(x,z,240,20)+.2)*1.3)*smooth(slope*1.4);c=c*(1-scree[:,:,None]*.3)+np.array([.44,.40,.31])*scree[:,:,None]*.3
    if kind=='altai':
        snow=smooth((h-1450+noise(x,z,130,8)*160)/520)*(1-smooth((slope-.75)/1.0));c=c*(1-snow[:,:,None])+np.array([.92,.97,1.])*snow[:,:,None]
    rim=smooth((np.hypot(np.maximum(0,np.abs(x)-500),np.maximum(0,np.abs(z)-420))-20)/110);c=c*rim[:,:,None]+np.array([.42,.37,.28])*(1-rim[:,:,None])
    dust=1-smooth((rd-12)/12);c=c*(1-dust[:,:,None])+np.array([.42,.39,.32])*dust[:,:,None]
    colors=np.concatenate([np.clip(c,0,1),np.ones((*h.shape,1))],axis=-1).reshape(-1,4)
    mat=material('Mountain / geological ground',(1,1,1),vertex=True)
    ob=mesh('MountainGround',vertices.tolist(),faces,mat,np.stack([x/25,z/25],axis=-1).reshape(-1,2),colors);ob['mountainGround']=True
    return ob,len(faces)

def road_mesh(xs,zs,h,stone):
    verts=[];uv=[];faces=[];width=8
    for i,p in enumerate(ROAD):
        d=ROAD[min(i+1,len(ROAD)-1)]-ROAD[max(i-1,0)];n=np.array([-d[1],d[0]])/np.linalg.norm(d[:2])
        for side in [-1,1]:
            x,z=p[:2]+n*width*side;verts.append((float(x),float(-z),sample(xs,zs,h,x,z)+.12));uv.append(((side+1)*.5,ROAD_S[i]/12))
        if i<len(ROAD)-1:a=i*2;faces.extend([(a,a+2,a+1),(a+1,a+2,a+3)])
    ob=mesh('ValleyAccessRoad',verts,faces,material('Road / graded compacted gravel',(.56,.52,.43),stone),uv);ob['accessRoad']=True
    return ob

def placement_data(kind,xs,zs,h,lake):
    rng=random.Random(174 if kind=='altai' else 57);trees=[];rocks=[];grass=[];lx,lz,rx,rz=lake
    def valid(x,z,margin=0):
        if abs(x)<500+margin and abs(z)<420+margin:return False
        d,_,_=road_distance(np.array(x),np.array(z))
        if d<29:return False
        if ((x-lx)/(rx*1.4))**2+((z-lz)/(rz*1.4))**2<1:return False
        return True
    # Batch distance queries; keep the route corridor clear of every prop.
    count=22000;angles=np.array([rng.random()*math.tau for _ in range(count)]);radii=np.array([620+(rng.random()**1.8)*3300 for _ in range(count)]);xx=np.cos(angles)*radii;zz=np.sin(angles)*radii;dist,_,_=road_distance(xx,zz)
    for x,z,d in zip(xx,zz,dist):
        x,z=float(x),float(z)
        if -710<z<880 and abs(x-float(river_x(z)))<34:continue
        if d<30 or (abs(x)<555 and abs(z)<475) or ((x-lx)/(rx*1.4))**2+((z-lz)/(rz*1.4))**2<1:continue
        y=sample(xs,zs,h,x,z);slope=math.hypot((sample(xs,zs,h,x+5,z)-sample(xs,zs,h,x-5,z))/10,(sample(xs,zs,h,x,z+5)-sample(xs,zs,h,x,z-5))/10)
        remote=abs(x)>910 or abs(z)>810
        if remote and slope<.82 and y<1350 and len(trees)<(3800 if kind=='altai' else 1500) and noise(x,z,270,7)>(-.6 if kind=='altai' else -.05):trees.append([x,y,z,rng.uniform(.85,1.6),rng.random()*math.tau])
        if remote and slope<1.7 and len(rocks)<(850 if kind=='altai' else 1450) and (slope>.18 or noise(x,z,180,2)>.32):rocks.append([x,y,z,rng.uniform(.6,4.2)*(1+slope*1.4),rng.random()*math.tau])
        if slope<.65 and y<1450 and len(grass)<2800:grass.append([x,y+.08,z,rng.uniform(1.4,4.5),rng.random()*math.tau])
    return dict(trees=trees,rocks=rocks,grass=grass)

def export_selected(path,objects):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:ob.hide_set(False);ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True,export_cameras=False,export_lights=False,export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_vertex_color='ACTIVE',export_all_vertex_colors=False)

def build(kind):
    bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
    stone,leaf=textures();near=tree_template(leaf,1);far=tree_template(leaf,0);export_selected(OUT/'botany.glb',near+far)
    for ob in near+far:ob.hide_render=True;ob.hide_set(True)
    xs,zs,h,rd,lake=make_field(kind);ground,triangles=terrain_mesh(kind,xs,zs,h,rd,stone);road=road_mesh(xs,zs,h,stone)
    export_selected(OUT/(kind+'-landscape.glb'),[ground,road])
    props=placement_data(kind,xs,zs,h,lake)
    metadata=dict(version=1,kind=kind,xs=xs.tolist(),zs=zs.tolist(),heightFile=kind+'-heights.f32',lake=list(lake)+[147],road=[[round(float(s),4),*map(float,[p[0],p[2],p[1]])] for s,p in zip(ROAD_S,ROAD)],roadWidth=16,triangles=triangles,**props)
    metadata['landformVersion']=2
    metadata['watercourse']=watercourse_profile(xs,zs,h,sample)
    (OUT/(kind+'-profile.json')).write_text(json.dumps(metadata,separators=(',',':')));h.astype('<f4').tofile(OUT/(kind+'-heights.f32'))
    # Editable Blender scene retains real instanced tree geometry for art direction.
    for i,(x,y,z,scale,angle) in enumerate(props['trees']):
        templates=near if math.hypot(x,z)<1700 else far
        for source in templates:
            ob=bpy.data.objects.new('Forest %04d / '%i+source.name,source.data);scene.collection.objects.link(ob);ob.location=(x,-z,y);ob.scale=(scale,scale,scale);ob.rotation_euler.z=-angle
    stone_mat=material('Outcrops / angular slate',(.26,.28,.25),stone)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1);proto=bpy.context.object;proto.name='Scree prototype';proto.data.materials.append(stone_mat);proto.hide_render=True;proto.hide_set(True)
    for i,(x,y,z,s,a) in enumerate(props['rocks']):
        ob=bpy.data.objects.new('Scree %04d'%i,proto.data);scene.collection.objects.link(ob);ob.location=(x,-z,y+s*.23);ob.scale=(s,s*.74,s*.58);ob.rotation_euler=(.1,.25,-a)
    water=material('Lake / mountain water',(.025,.18,.19),roughness=.18);p=water.node_tree.nodes.get('Principled BSDF');p.inputs['Metallic'].default_value=.35
    lx,lz,rx,rz=lake;vertices=[(lx,-lz,147)]+[(lx+rx*.92*math.cos(a),-lz+rz*.92*math.sin(a),147) for a in np.linspace(0,math.tau,64,endpoint=False)];mesh('Mountain lake',vertices,[(0,i+1,(i+1)%64+1) for i in range(64)],water)
    # Append original assets for a faithful framing check, without saving over them.
    preview_source=ROOT.parent/'Quarry_Diorama.blend'
    if preview_source.exists():
        with bpy.data.libraries.load(str(preview_source),link=False) as (source,dest):dest.objects=[n for n in source.objects if not n.startswith(('Camera','Light','Area','Sun'))]
        for ob in dest.objects:
            if ob and not ob.users_collection:scene.collection.objects.link(ob)
    else:
        bpy.ops.import_scene.gltf(filepath=str(ROOT/'dist/assets/quarry-v4.glb'))
    scene.world=bpy.data.worlds.new('Atmosphere');scene.world.use_nodes=True;scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.5,.61,.72,1);scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.55
    bpy.ops.object.light_add(type='SUN',location=(-900,-500,1800));sun=bpy.context.object;sun.rotation_euler=(math.radians(28),math.radians(-25),math.radians(-25));sun.data.energy=2.2;sun.data.angle=.12
    bpy.ops.object.camera_add(location=(1250,-1530,1200));camera=bpy.context.object;camera.rotation_euler=(Vector((0,150,120))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=34;camera.data.clip_end=40000;scene.camera=camera
    scene.render.engine='CYCLES';scene.cycles.samples=20;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=8;scene.render.resolution_x=1400;scene.render.resolution_y=950;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(SOURCE/(kind+'-overview.png'))
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(kind+'-mountains.blend')))
    report={'kind':kind,'vertices':int(h.size),'triangles':triangles,'maxHeight':float(h.max()),'trees':len(props['trees']),'rocks':len(props['rocks']),'grass':len(props['grass']),'roadMaxGrade':float(np.max(np.abs(np.diff(ROAD[:,2]))/np.linalg.norm(np.diff(ROAD[:,:2],axis=0),axis=1)))}
    report['landformVersion']=2
    report['watercoursePoints']=len(metadata['watercourse']['points'])
    (OUT/(kind+'-report.json')).write_text(json.dumps(report,indent=2));print('MOUNTAIN_BUILD',json.dumps(report),flush=True)
    if '--render' in ARGS:bpy.ops.render.render(write_still=True)

kind=next((a for a in ARGS if a in ['quarry','altai','both']),'both')
for name in (['quarry','altai'] if kind=='both' else [kind]):build(name)
