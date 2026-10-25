"""Standalone quarry diorama generator for Blender 5.2; all dimensions in metres."""
import bpy, bmesh, math, json, random, csv
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
random.seed(22026)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for datablock in list(bpy.data.materials):
    bpy.data.materials.remove(datablock)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c

terrain_col = collection('01 • GEOLOGY / watertight cutaway')
roads_col = collection('02 • HAUL NETWORK / continuous ramp')
plant_col = collection('03 • PROCESS PLANT')
fleet_col = collection('04 • MOBILE ASSETS')
detail_col = collection('05 • SITE FURNITURE')
studio_col = collection('99 • PRESENTATION / excluded from GLB')

materials = {}
def material(name, color, rough=.8, metal=0, texture=None, normal=.7):
    m = bpy.data.materials.new(name)
    m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=rough
    bs.inputs['Metallic'].default_value=metal
    if texture:
        for suffix, socket in [('Albedo','Base Color'),('Roughness','Roughness'),('Normal',None)]:
            tex=m.node_tree.nodes.new('ShaderNodeTexImage')
            tex.image=bpy.data.images.load(str(ROOT/'textures'/f'{texture}_{suffix}.png'),check_existing=True)
            tex.image.colorspace_settings.name='sRGB' if suffix=='Albedo' else 'Non-Color'
            tex.extension='REPEAT'
            if suffix=='Normal':
                node=m.node_tree.nodes.new('ShaderNodeNormalMap')
                node.inputs['Strength'].default_value=normal
                m.node_tree.links.new(tex.outputs['Color'],node.inputs['Color'])
                m.node_tree.links.new(node.outputs['Normal'],bs.inputs['Normal'])
            else:
                m.node_tree.links.new(tex.outputs['Color'],bs.inputs[socket])
    m.diffuse_color=(*color,1)
    materials[name]=m
    return m

material('01_Sandstone',(.55,.44,.31),texture='Sandstone')
material('02_Granite',(.42,.43,.42),texture='Granite')
material('03_Ore_seams',(.29,.25,.21),texture='Ore')
material('04_Gravel',(.56,.51,.41),texture='Gravel',normal=.35)
material('05_Galvanized_steel',(.30,.36,.38),metal=.72,texture='Steel',normal=.2)
material('06_Safety_ochre',(.82,.43,.065),.51,.22)
material('07_Off_white',(.66,.70,.68),.62,.25)
material('08_Rubber',(.025,.029,.028),.94)
material('09_Glass',(.055,.13,.16),.22,.35)
material('10_Concrete',(.38,.39,.36),.95)
material('11_Belt',(.055,.063,.059),.96)
material('12_Tire_tracks',(.24,.22,.18),.98)
material('13_Red_oxide',(.30,.105,.044),.83,.12)
material('14_Lamp_lens',(.85,.88,.78),.34,.10)
material('15_Deep_stratum',(.25,.24,.22),.95)
material('16_Continuous_geology',(.5,.42,.32),texture='Geology',normal=.6)
MAT=list(materials.values())
MI={m.name:i for i,m in enumerate(MAT)}

def mesh_object(name,verts,faces,mids,col,uvmode='box'):
    mesh=bpy.data.meshes.new(name+'_mesh')
    mesh.from_pydata(verts,[],faces)
    mesh.materials.clear()
    for m in MAT: mesh.materials.append(m)
    for p,idx in zip(mesh.polygons,mids): p.material_index=idx
    mesh.update()
    bm=bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    if uvmode in ['geology','ribbon']:
        for face in bm.faces: face.smooth=True
        for edge in bm.edges:
            if edge.is_manifold: edge.smooth=edge.calc_face_angle()<math.radians(32)
    bm.to_mesh(mesh); bm.free()
    uv=mesh.uv_layers.new(name='UV0')
    for p in mesh.polygons:
        n=p.normal
        wall=uvmode=='geology' and p.material_index==MI['16_Continuous_geology']
        axis=max(range(3),key=lambda i:abs(n[i]))
        for li in p.loop_indices:
            co=mesh.vertices[mesh.loops[li].vertex_index].co
            if wall:
                u=math.atan2(co.y+20,co.x)*10
                v=(co.z+28)/196
            elif axis==2: u,v=co.x/18,co.y/18
            elif axis==1: u,v=co.x/18,co.z/18
            else: u,v=co.y/18,co.z/18
            uv.data[li].uv=(u,v)
        if wall:
            vals=[uv.data[li].uv.x for li in p.loop_indices]
            if max(vals)-min(vals)>30:
                for li in p.loop_indices:
                    if uv.data[li].uv.x<0: uv.data[li].uv.x+=20*math.pi
    ob=bpy.data.objects.new(name,mesh); col.objects.link(ob)
    ob['asset_id']=name.split(' / ')[0]
    return ob

class Batch:
    def __init__(self,name,col):
        self.name,self.col=name,col; self.v=[];self.f=[];self.m=[]
    def add(self,v,f,mat):
        off=len(self.v);self.v.extend(v)
        self.f.extend(tuple(off+i for i in face) for face in f)
        self.m.extend([MI[mat]]*len(f))
    def box(self,c,s,mat,angle=0):
        c=np.asarray(c);sx,sy,sz=np.array(s)/2
        v=[]
        for x,y,z in [(-sx,-sy,-sz),(sx,-sy,-sz),(sx,sy,-sz),(-sx,sy,-sz),(-sx,-sy,sz),(sx,-sy,sz),(sx,sy,sz),(-sx,sy,sz)]:
            v.append(tuple(c+np.array([x*math.cos(angle)-y*math.sin(angle),x*math.sin(angle)+y*math.cos(angle),z])))
        self.add(v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
    def beam(self,a,b,width,mat,depth=None):
        a,b=Vector(a),Vector(b);d=b-a
        z=d.normalized(); helper=Vector((0,0,1)) if abs(z.z)<.95 else Vector((1,0,0))
        x=z.cross(helper).normalized()*width/2;y=z.cross(x).normalized()*(depth or width)/2
        v=[tuple(p+sx*x+sy*y) for p in (a,b) for sx,sy in [(-1,-1),(1,-1),(1,1),(-1,1)]]
        self.add(v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
    def cylinder(self,a,b,r,mat,n=10,r2=None):
        a,b=Vector(a),Vector(b);z=(b-a).normalized();helper=Vector((0,0,1)) if abs(z.z)<.95 else Vector((1,0,0))
        x=z.cross(helper).normalized();y=z.cross(x).normalized();r2=r if r2 is None else r2
        v=[tuple(p+rad*(math.cos(t*2*math.pi/n)*x+math.sin(t*2*math.pi/n)*y)) for p,rad in [(a,r),(b,r2)] for t in range(n)]
        f=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        self.add(v,f,mat)
    def finish(self): return mesh_object(self.name,self.v,self.f,self.m,self.col)

SAND='01_Sandstone'; GRAN='02_Granite'; ORE='03_Ore_seams'; GRAVEL='04_Gravel'
STEEL='05_Galvanized_steel';YELLOW='06_Safety_ochre';WHITE='07_Off_white';RUBBER='08_Rubber';GLASS='09_Glass';CONCRETE='10_Concrete';BELT='11_Belt'
RX,RY,CY=430.,330.,-20.
TOP,BASE=168.,-28.
RSTART,REND=1.06,.24
TURNS=1.85
PHI=.12
ROAD_W=25.
def shape(t): return 1+.025*np.sin(3*t+.3)+.014*np.sin(7*t)+.008*np.sin(13*t+1)
def xy(r,t): return np.array([r*RX*shape(t)*np.cos(t),CY+r*RY*shape(t)*np.sin(t)])
ts=np.linspace(0,1,1401)
angles=PHI+TURNS*2*np.pi*ts
rr=RSTART+(REND-RSTART)*ts
pathxy=np.array([xy(r,t) for r,t in zip(rr,angles)])
lengths=np.concatenate([[0],np.cumsum(np.linalg.norm(np.diff(pathxy,axis=0),axis=1))])
zs=TOP*(1-lengths/lengths[-1])
path=np.column_stack([pathxy,zs])

def baseline(r,t):
    q=np.clip((r*r-REND**2)/(1.015**2-REND**2)*7,0,7)
    k=np.floor(q);f=q-k
    a=np.clip((f-.78)/.22,0,1)
    z=24*(k+a)
    if r>=1.015: return TOP
    # Small scale relief remains below a metre, with clean flat catch benches.
    rough=.27*np.sin(t*53+r*127)+.20*np.sin(t*119-r*89)
    return float(z+rough*(np.sin(np.pi*a)**2)+.045*np.sin(t*81+r*170))

def terrain_z(r,t):
    z=baseline(r,t)
    radial_scale=np.linalg.norm(xy(1,t)-np.array([0,CY]))
    for wrap in range(-1,4):
        u=(t-PHI+wrap*2*np.pi)/(TURNS*2*np.pi)
        if 0<=u<=1:
            road_r=RSTART+(REND-RSTART)*u
            dist=abs(r-road_r)*radial_scale
            if dist<ROAD_W/2+11:
                point=xy(r,t)
                for _ in range(2):
                    idx=min(len(pathxy)-2,max(0,int(u*(len(pathxy)-1))))
                    tangent=(pathxy[idx+1]-pathxy[idx])*(len(pathxy)-1)
                    center=np.array([np.interp(u,ts,pathxy[:,0]),np.interp(u,ts,pathxy[:,1])])
                    u=float(np.clip(u+np.dot(point-center,tangent)/np.dot(tangent,tangent),0,1))
                center=np.array([np.interp(u,ts,pathxy[:,0]),np.interp(u,ts,pathxy[:,1])])
                dist=np.linalg.norm(point-center)
                blend=np.clip((dist-ROAD_W/2-1.5)/9.5,0,1)
                blend=blend*blend*(3-2*blend)
                road_z=float(np.interp(u,ts,zs))-.11
                z=road_z*(1-blend)+z*blend
    return z

def strata(z):
    if z<0:return '15_Deep_stratum'
    if 43<z%105<49 or 94<z<100 or 130<z<133:return ORE
    if 52<z<92 or 139<z<150:return GRAN
    return SAND

print('Building conforming terrain...',flush=True)
thetas=sorted(set(np.linspace(0,2*np.pi,384,endpoint=False).tolist()+[math.atan2(y-CY,x)%(2*math.pi) for x in [-500,500] for y in [-420,420]]))
radials=list(np.linspace(.013,1.08,210))
for k in range(7):
    for q in [k+.78,k+.89,k+1]:
        radials.append(math.sqrt(REND**2+q/7*(1.015**2-REND**2)))
radials=sorted(set(radials))
n=len(thetas);verts=[(0,CY,0)];faces=[];mids=[]
for r in radials:
    for t in thetas:
        x,y=xy(r,t);verts.append((x,y,terrain_z(r,t)))
for j in range(n):faces.append((0,1+j,1+(j+1)%n));mids.append(MI[GRAVEL])
for ri in range(len(radials)-1):
    for j in range(n):
        a=1+ri*n+j;b=1+ri*n+(j+1)%n;c=b+n;d=a+n
        faces.append((a,b,c,d))
        z=sum(verts[v][2] for v in [a,b,c,d])/4
        dz=max(verts[v][2] for v in [a,b,c,d])-min(verts[v][2] for v in [a,b,c,d])
        mids.append(MI['16_Continuous_geology' if dz>1.1 else GRAVEL])
outer=[]
for t in thetas:
    dx,dy=math.cos(t),math.sin(t)
    tx=500/max(abs(dx),1e-12)
    ty=((420-CY) if dy>0 else (420+CY))/max(abs(dy),1e-12)
    dist=min(tx,ty);outer.append((dist*dx,CY+dist*dy))
last=1+(len(radials)-1)*n
off=len(verts);verts.extend((x,y,TOP) for x,y in outer)
for j in range(n): faces.append((last+j,last+(j+1)%n,off+(j+1)%n,off+j));mids.append(MI[GRAVEL])
last=off
for z in sorted(set(list(np.arange(BASE,TOP,6))+[44,49,94,100,130,133,139,150,0]),reverse=True):
    off=len(verts);verts.extend((x,y,float(z)) for x,y in outer)
    for j in range(n):faces.append((last+j,last+(j+1)%n,off+(j+1)%n,off+j));mids.append(MI['16_Continuous_geology'])
    last=off
bottom=len(verts);verts.append((0,0,BASE))
for j in range(n):faces.append((bottom,last+(j+1)%n,last+j));mids.append(MI['15_Deep_stratum'])
terrain=mesh_object('GEO_001 / solid terraced ground',verts,faces,mids,terrain_col,'geology')
terrain['description']='Closed manifold cutaway, seven 24 m bench intervals, road-conforming surface.'

print('Building haul network...',flush=True)
def ribbon(name,points,width,mat,col,offset=0,thickness=.18,profile=None):
    v=[];f=[]
    section=profile or [(-width/2,0),(width/2,0),(width/2,-thickness),(-width/2,-thickness)]
    for i,p in enumerate(points):
        d=points[min(i+1,len(points)-1)]-points[max(i-1,0)];l=np.linalg.norm(d[:2]);side=np.array([-d[1]/l,d[0]/l,0])
        for x,z in section:v.append(tuple(p+side*(x+offset)+[0,0,z]))
    m=len(section)
    f.append(tuple(reversed(range(m))))
    for i in range(len(points)-1):
        for j in range(m):f.append((i*m+j,i*m+(j+1)%m,(i+1)*m+(j+1)%m,(i+1)*m+j))
    f.append(tuple((len(points)-1)*m+j for j in range(m)))
    return mesh_object(name,v,f,[MI[mat]]*len(f),col,'ribbon')

meshpath=path[np.unique(np.r_[np.arange(0,len(path),3),len(path)-1])]
road=ribbon('ROAD_001 / continuous spiral haul ramp',meshpath+[0,0,.10],ROAD_W,GRAVEL,roads_col)
road['road_width_m']=ROAD_W;road['length_m']=round(float(lengths[-1]),2)
road['grade_percent']=round(TOP/lengths[-1]*100,3)
berms=ribbon('ROAD_002 / outer earth safety windrow',meshpath+[0,0,.12],4,SAND,roads_col,offset=ROAD_W/2-1.5,profile=[(-2,0),(-.75,1.85),(.65,1.85),(2,0)])
ribbon('ROAD_003 / inner earth safety windrow',meshpath+[0,0,.12],3,SAND,roads_col,offset=-ROAD_W/2+1.1,profile=[(-1.6,0),(-.4,1.4),(.4,1.4),(1.6,0)])
for i,off in enumerate([-7.0,-5.4,4.9,6.5]):
    ribbon(f'ROAD_TRACK_{i+1:02d}',meshpath+[0,0,.115],.34,'12_Tire_tracks',roads_col,off,thickness=.012)
# Connect the ramp entrance to the crushing yard on the intact surface.
start=path[0].copy();access=np.array([start,[465,115,TOP],[465,220,TOP],[440,285,TOP],[397,340,TOP],[340,365,TOP],[235,365,TOP]])
ribbon('ROAD_004 / crusher access',access+[0,0,.13],25,GRAVEL,roads_col)

site=Batch('SITE_001 / yard and service infrastructure',plant_col)
site.box((165,365,TOP+.25),(310,88,.5),CONCRETE)
# Slightly raised crusher foundation, modular processing shed, steel legs.
site.box((90,366,TOP+1.3),(66,52,2.1),CONCRETE)
steel=Batch('PLANT_001 / crusher structural frame',plant_col)
panels=Batch('PLANT_002 / crusher cladding and machinery',plant_col)
rails=Batch('PLANT_003 / safety rails stairs and walkways',plant_col)
for x in [66,89,112]:
    for y in [349,383]:
        steel.beam((x,y,TOP+2),(x,y,TOP+30),1.0,STEEL)
        site.box((x,y,TOP+1.9),(3.4,3.4,1.2),CONCRETE)
for y in [349,383]:
    for za in [9,20,29]:steel.beam((64,y,TOP+za),(114,y,TOP+za),1,STEEL)
    for x in [66,89]:
        steel.beam((x,y,TOP+2),(x+23,y,TOP+20),.45,STEEL)
        steel.beam((x,y,TOP+20),(x+23,y,TOP+2),.45,STEEL)
for x in [66,89,112]:steel.beam((x,347,TOP+20),(x,385,TOP+20),1,STEEL)
panels.box((89,366,TOP+27),(46,33,15),WHITE)
panels.box((89,366,TOP+35),(50,36,1),STEEL)
for x in np.arange(68,113,2.5):
    panels.box((x,349.35,TOP+27),(.16,.3,14.5),STEEL)
    panels.box((x,382.65,TOP+27),(.16,.3,14.5),STEEL)
for x in [72,83,94,105]:panels.box((x,349.05,TOP+29),(6,.2,3),GLASS)
panels.box((89,366,TOP+15),(23,18,8),YELLOW)
panels.cylinder((89,365,TOP+7),(89,365,TOP+16),6,STEEL,16,r2=9)
panels.box((52,364,TOP+10),(19,22,17),YELLOW)
panels.cylinder((52,364,TOP+13),(52,364,TOP+24),6.5,STEEL,4,r2=13)
panels.box((52,364,TOP+24),(18,18,.7),RUBBER)
panels.box((52,364,TOP+24.8),(12,13,1.3),ORE)

def guardrail(a,b,z,batch=rails):
    a=np.array(a,dtype=float);b=np.array(b,dtype=float)
    for h in [.65,1.35]:batch.beam((*a,z+h),(*b,z+h),.13,YELLOW)
    for t in np.linspace(0,1,max(2,int(np.linalg.norm(b-a)/3)+1)):
        p=a*(1-t)+b*t;batch.beam((*p,z),(*p,z+1.45),.13,YELLOW)
rails.box((89,345,TOP+20),(54,5,.5),STEEL)
guardrail((62,342.5),(116,342.5),TOP+20.3)
guardrail((62,347.5),(116,347.5),TOP+20.3)
for i in range(40):rails.box((119+i*.53,345,TOP+20-i*.46),(1.05,3,.23),STEEL)
rails.beam((118,343,TOP+21.6),(141,343,TOP+2),.17,YELLOW)
rails.beam((118,347,TOP+21.6),(141,347,TOP+2),.17,YELLOW)
for x in [150,165]:
    panels.cylinder((x,392,TOP+8),(x,392,TOP+30),5.3,WHITE,20)
    panels.cylinder((x,392,TOP+30),(x,392,TOP+32),5.3,STEEL,20,r2=.4)
    panels.cylinder((x,392,TOP+3),(x,392,TOP+8),1.3,STEEL,16,r2=5.3)
    for dx,dy in [(-3,-3),(-3,3),(3,-3),(3,3)]:steel.beam((x+dx,392+dy,TOP),(x+dx,392+dy,TOP+10),.45,STEEL)
    panels.cylinder((x,392,TOP+32),(x,392,TOP+37),.8,STEEL,10)

def conveyor(name,a,b):
    a=np.array(a,dtype=float);b=np.array(b,dtype=float);delta=b-a
    side=np.cross(delta,[0,0,1]);side=side/np.linalg.norm(side)
    cb=Batch(name,plant_col)
    cb.beam(a,b,5.5,STEEL,1.0)
    cb.beam(a+[0,0,.7],b+[0,0,.7],3.8,BELT,.25)
    for sign in [-1,1]:
        shift=side*sign*3.2
        cb.beam(a+shift+[0,0,2],b+shift+[0,0,2],.22,STEEL)
        cb.beam(a+shift-[0,0,1.5],b+shift-[0,0,1.5],.22,STEEL)
    steps=max(3,int(np.linalg.norm(delta)/6))
    for i in range(steps):
        p=a+delta*i/steps;q=a+delta*(i+1)/steps
        cb.cylinder(p-side*2.3+[0,0,.65],p+side*2.3+[0,0,.65],.28,STEEL,8)
        for sign in [-1,1]:
            shift=side*sign*3.2
            cb.beam(p+shift-[0,0,1.5],q+shift+[0,0,2],.18,STEEL)
            cb.beam(p+shift+[0,0,2],p+shift-[0,0,1.5],.18,STEEL)
    for t in np.linspace(.10,.9,max(2,int(np.linalg.norm(delta)/25))):
        p=a+delta*t
        for sign in [-1,1]:
            top=p+side*sign*2.6-[0,0,1.5];foot=top.copy();foot[2]=TOP+.5
            cb.beam(foot,top,.65,STEEL)
            site.box((foot[0],foot[1],TOP+.3),(3,3,.6),CONCRETE)
        cb.beam((p-side*2.6)*[1,1,0]+[0,0,TOP+1],p+side*2.6-[0,0,1.5],.27,STEEL)
    cb.cylinder(a-side*2.4+[0,0,.6],a+side*2.4+[0,0,.6],.85,YELLOW,12)
    cb.cylinder(b-side*2.4+[0,0,.6],b+side*2.4+[0,0,.6],.85,YELLOW,12)
    ob=cb.finish();ob['asset_type']='belt_conveyor';return ob

conveyor('CONV_01 / primary transfer',(109,366,TOP+18),(194,366,TOP+26))
panels.box((196,365,TOP+22),(22,20,11),YELLOW)
for x in [187,205]:
    for y in [357,373]:steel.beam((x,y,TOP+1),(x,y,TOP+26),.7,STEEL)
conveyor('CONV_02 / screened aggregate stacker',(205,366,TOP+21),(284,355,TOP+25))
conveyor('CONV_03 / ore stacker',(197,373,TOP+19),(250,398,TOP+20))
conveyor('CONV_04 / lateral feed',(-74,369,TOP+4),(43,366,TOP+20))

piles=Batch('STOCK_001 / crushed aggregate stockpiles',plant_col)
for cx,cy,rad,h,mat in [(284,355,24,20,GRAN),(250,396,18,15,ORE),(-82,365,25,15,SAND),(-145,366,21,12,GRAVEL)]:
    n=40;v=[(cx,cy,TOP+h)]
    for k in range(n):
        t=k*2*math.pi/n;r=rad*(1+random.uniform(-.07,.07));v.append((cx+r*math.cos(t),cy+r*.72*math.sin(t),TOP+.25))
    v.append((cx,cy,TOP+.25));f=[(0,k+1,(k+1)%n+1) for k in range(n)]+[(n+1,(k+1)%n+1,k+1) for k in range(n)]
    piles.add(v,f,mat)
piles.finish()
for x in [-220,-182]:
    panels.box((x,378,TOP+5.1),(30,15,10),WHITE)
    panels.box((x,378,TOP+10.4),(32,17,.6),STEEL)
    for xx in [-9,0,9]:panels.box((x+xx,370.4,TOP+6.2),(5,.15,3.8),GLASS)
    panels.box((x+11,370.2,TOP+3),(3,.25,5.8),STEEL)
for x in [-270,-258,-246]:
    panels.cylinder((x,378,TOP+.2),(x,378,TOP+9),4.5,WHITE,16)
    panels.cylinder((x,378,TOP+9),(x,378,TOP+9.6),4.5,STEEL,16,r2=3.8)
site.finish();steel.finish();panels.finish();rails.finish()

print('Building fleet and site details...',flush=True)
def truck(name,p,heading):
    tb=Batch(name,fleet_col)
    tb.box((0,0,2.9),(12.4,6.1,1.2),STEEL)
    tb.box((-2,0,5.2),(8.7,6.7,1.15),YELLOW)
    tb.box((-2,3.25,6.4),(9,.30,2.6),YELLOW)
    tb.box((-2,-3.25,6.4),(9,.30,2.6),YELLOW)
    tb.box((-6.35,0,6.4),(.4,6.7,2.6),YELLOW)
    tb.box((2.4,0,7.1),(.45,6.8,4.3),YELLOW)
    tb.box((-2,0,6.1),(8.1,5.9,1.6),ORE)
    tb.box((4.8,-1.3,5.5),(3.2,3.1,3.8),YELLOW)
    tb.box((4.8,-1.3,7.6),(3.8,3.7,.35),YELLOW)
    tb.box((6.43,-1.3,6.3),(.10,2.75,1.65),GLASS)
    tb.box((4.8,-2.88,6.3),(2.65,.10,1.65),GLASS)
    tb.box((4.8,.3,6.3),(2.65,.10,1.65),GLASS)
    tb.box((5,1.8,4.5),(3,2.3,2.1),YELLOW)
    tb.box((6.7,0,3.1),(.4,6.3,.65),YELLOW)
    for x in [-4,-.8,4.4]:
        for side in [-1,1]:
            tb.cylinder((x,side*2.8,2.1),(x,side*3.8,2.1),2.05,RUBBER,16)
            tb.cylinder((x,side*3.81,2.1),(x,side*3.87,2.1),.9,YELLOW,12)
    for y in [-2.3,2.3]:tb.box((6.94,y,3.7),(.1,.65,.45),'14_Lamp_lens')
    tb.cylinder((3.2,2.3,4.2),(3.2,2.3,7.5),.2,STEEL,8)
    ob=tb.finish();ob.location=p;ob.rotation_euler.z=heading
    ob['asset_type']='haul_truck';ob['nominal_length_m']=13.6
    return ob
for num,u in enumerate([.10,.40,.76]):
    i=int(u*(len(path)-1));d=path[i+1]-path[i-1];p=path[i].copy();side=np.array([-d[1],d[0],0]);side/=np.linalg.norm(side);p+=side*(-4.4);p[2]+=.2
    truck(f'TRUCK_{num+1:02d} / haul truck',p,math.atan2(d[1],d[0]))
truck('TRUCK_04 / yard haul truck',(-31,356,TOP+.4),0)

# Excavator / electric face shovel at the central floor.
dig=Batch('EXCAVATOR_01 / floor loading shovel',fleet_col)
for y in [-4.2,4.2]:
    dig.box((-29,y-37,1.6),(14,2.7,3),RUBBER)
    for x in np.linspace(-35,-23,6):dig.cylinder((x,y-38.45,1.7),(x,y-35.55,1.7),1.05,STEEL,10)
dig.cylinder((-29,-37,2),(-29,-37,4.2),4.8,STEEL,16)
dig.box((-29,-37,6.3),(11,8,5),YELLOW)
dig.box((-24,-40,7.8),(4.8,3.3,4),YELLOW)
dig.box((-21.55,-40,8.4),(.15,3,2.1),GLASS)
dig.box((-24,-41.7,8.4),(4.3,.15,2.1),GLASS)
dig.beam((-24,-36,7),(-12,-36,21),2.2,YELLOW)
dig.beam((-12,-36,21),(3,-36,6),1.7,YELLOW)
dig.cylinder((-25,-36,8),(-13,-36,16),.48,STEEL,10)
dig.cylinder((-14,-36,20),(-1,-36,11),.42,STEEL,10)
dig.box((3,-36,3.2),(5,7.5,4.3),STEEL)
for y in np.arange(-39,-32.5,1.2):dig.box((6,y,1.1),(2,.55,.6),STEEL)
dig.finish()

lamps=Batch('SITE_002 / lighting masts',detail_col)
def lamp(x,y,z,angle=0):
    lamps.box((x,y,z+.35),(2.6,2.6,.7),CONCRETE)
    lamps.cylinder((x,y,z+.7),(x,y,z+19),.35,STEEL,8,r2=.19)
    lamps.beam((x-2.5,y,z+18.5),(x+2.5,y,z+18.5),.18,STEEL)
    for dx in [-1.9,0,1.9]:
        lamps.box((x+dx,y,z+19),(1.4,.9,.5),STEEL)
        lamps.box((x+dx,y,z+18.72),(1.1,.7,.08),'14_Lamp_lens')
for i in range(35,len(path)-15,110):
    d=path[i+1]-path[i-1];side=np.array([-d[1],d[0],0]);side/=np.linalg.norm(side);p=path[i]+side*10.6
    lamp(*p)
for p in [(-320,355,TOP),(-122,407,TOP),(29,408,TOP),(325,404,TOP),(435,311,TOP)]:lamp(*p)
lamps.finish()

posts=Batch('SITE_003 / delineators and yard barriers',detail_col)
for i in range(8,len(path)-8,22):
    d=path[i+1]-path[i-1];side=np.array([-d[1],d[0],0]);side/=np.linalg.norm(side)
    for sign in [-1,1]:
        p=path[i]+side*sign*10.3
        posts.cylinder(p,p+[0,0,2.0],.12,WHITE,6)
        posts.cylinder(p+[0,0,1.5],p+[0,0,1.9],.126,'13_Red_oxide',6)
for x in np.arange(-330,335,12):
    posts.box((x,413,TOP+1.0),(9,1.2,2),CONCRETE)
    for dx in [-2,2]:posts.box((x+dx,412.35,TOP+1),(.8,.1,1.5),YELLOW)
posts.finish()

# Deterministic loose fragments; kept away from the haul road.
rock=Batch('GEO_002 / bench talus and blasted fragments',detail_col)
for i in range(1650):
    r=random.uniform(.34,1.015);t=random.uniform(0,2*math.pi);z=baseline(r,t)
    if abs(terrain_z(r,t)-z)>.2:continue
    q=(r*r-REND**2)/(1.015**2-REND**2)*7
    if q%1>.73:continue
    x,y=xy(r,t);rad=random.uniform(.45,1.65)
    if random.random()<.08:rad*=1.7
    v=[(x,y,z+rad*.9)]
    for j in range(5):
        a=j*2*math.pi/5;v.append((x+math.cos(a)*rad*random.uniform(.7,1.2),y+math.sin(a)*rad*random.uniform(.7,1.2),z+.03))
    rock.add(v,[(0,j+1,(j+1)%5+1) for j in range(5)]+[(5,4,3,2,1)],strata(z+random.uniform(0,8)))
rock.finish()

# A few realistic catch-berm ridges distinguish the horizontal bench breaks.
for k in [1,2,3,4,5,6]:
    q=k+.13;r=math.sqrt(REND**2+q/7*(1.015**2-REND**2))
    chunks=[];chunk=[]
    for t in np.linspace(0,2*np.pi,500):
        z=baseline(r,t)
        if abs(terrain_z(r,t)-z)<.18:
            x,y=xy(r,t);chunk.append((x,y,z+.1))
        else:
            if len(chunk)>2:chunks.append(chunk)
            chunk=[]
    if len(chunk)>2:chunks.append(chunk)
    for j,c in enumerate(chunks):ribbon(f'BERM_{k:02d}_{j:02d} / catch bench rubble',np.array(c),1.4,strata(k*24),detail_col,profile=[(-.8,0),(-.2,.6),(.2,.6),(.8,0)])

print('Preparing presentation and exports...',flush=True)
def aim(ob,target):ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('Camera_Hero');cam=bpy.data.objects.new('Camera_Hero',camdata);studio_col.objects.link(cam)
cam.location=(1110,-1420,1190);aim(cam,(0,0,64));camdata.type='ORTHO';camdata.ortho_scale=1390;camdata.clip_end=10000;scene.camera=cam
def area(name,loc,power,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    ob=bpy.data.objects.new(name,data);studio_col.objects.link(ob);ob.location=loc;aim(ob,(0,0,0))
area('Key / large softbox',(-400,-600,1200),12000000,700)
area('Fill / neutral',(700,100,800),5500000,650)
area('Rim / processing yard',(-100,750,900),8000000,600)
world=bpy.data.worlds.new('Neutral studio / transparent camera');scene.world=world;world.use_nodes=True
world.node_tree.nodes.get('Background').inputs[0].default_value=(.65,.68,.72,1)
world.node_tree.nodes.get('Background').inputs[1].default_value=.65
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
scene.cycles.max_bounces=6
scene.render.film_transparent=True
scene.render.resolution_x=1800;scene.render.resolution_y=1600;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='AgX'
scene.render.threads_mode='FIXED';scene.render.threads=10
scene['title']='OPEN PIT / industrial terrain study'
scene['coordinate_system']='Local metres; Blender Z up; glTF +Y up. No surveyed georeference.'
scene['bench_count']=7;scene['bench_height_m']=24
scene['source']='Procedurally modelled conceptual quarry, not a survey reconstruction.'
scene['road_width_m']=ROAD_W

# Validate each component's topological closure before the export.
report={'units':'metres','extent_m':[1000,840,196], 'bench_count':7,'bench_height_m':24,'road_width_m':ROAD_W,'road_length_m':round(float(lengths[-1]),2),'road_grade_percent':round(float(TOP/lengths[-1]*100),3),'georeferenced':False,'objects':[]}
for ob in bpy.data.objects:
    if ob.type!='MESH':continue
    bm=bmesh.new();bm.from_mesh(ob.data)
    bad=sum(1 for e in bm.edges if not e.is_manifold)
    deg=sum(1 for f in bm.faces if f.calc_area()<1e-8)
    bm.free();ob.data.calc_loop_triangles()
    report['objects'].append({'name':ob.name,'vertices':len(ob.data.vertices),'triangles':len(ob.data.loop_triangles),'non_manifold_edges':bad,'degenerate_faces':deg})
report['total_triangles']=sum(o['triangles'] for o in report['objects'])
report['total_vertices']=sum(o['vertices'] for o in report['objects'])
report['non_manifold_edges']=sum(o['non_manifold_edges'] for o in report['objects'])
report['degenerate_faces']=sum(o['degenerate_faces'] for o in report['objects'])
(ROOT/'validation.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
with (ROOT/'haul_route.csv').open('w') as fp:
    writer=csv.writer(fp);writer.writerow(['station_m','x_m','y_m','z_m','gltf_x_m','gltf_y_m','gltf_z_m'])
    for s,(x,y,z) in zip(lengths,path):writer.writerow([round(float(v),4) for v in [s,x,y,z,x,z,-y]])

for image in bpy.data.images:
    if image.source=='FILE':image.pack()
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.clip_end=10000
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.color_type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Quarry_Diorama.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in bpy.data.objects:
    if ob.type=='MESH':ob.select_set(True)
bpy.context.view_layer.objects.active=terrain
opts=dict(use_selection=True,export_extras=True,export_yup=True,export_apply=True,export_normals=True,export_tangents=True,export_texcoords=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'Quarry_Diorama.glb'),export_format='GLB',**opts)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'gltf'/'Quarry_Diorama.gltf'),export_format='GLTF_SEPARATE',export_texture_dir='textures',**opts)
print('REPORT',json.dumps({k:v for k,v in report.items() if k!='objects'}),flush=True)
scene.render.filepath=str(ROOT/'Quarry_Hero.png')
bpy.ops.render.render(write_still=True)
cam.location=(880,-1080,1470);aim(cam,(0,0,65));camdata.ortho_scale=1270
scene.render.resolution_x=1600;scene.render.resolution_y=1500
scene.render.filepath=str(ROOT/'Quarry_Overview.png')
bpy.ops.render.render(write_still=True)
print('DONE',flush=True)
