"""Reference-led hydraulic excavator. Local metres, +X forward, Z up.

Creates a standalone asset without modifying the quarry. The integration step
replaces only EXCAVATOR_01, preserving all other scene geometry and asset IDs.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector, Matrix, Euler

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'excavator'; OUT.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.unit_settings.system='METRIC'
asset=bpy.data.collections.new('EXCAVATOR_01 / detailed reference asset');scene.collection.children.link(asset)
studio=bpy.data.collections.new('STUDIO / preview only');scene.collection.children.link(studio)
M={}
def mat(name,color,metal=0,rough=.5,alpha=1):
    m=bpy.data.materials.new('EXC_'+name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal
    p.inputs['Roughness'].default_value=rough;p.inputs['Alpha'].default_value=alpha
    m.diffuse_color=(*color,alpha)
    if alpha<1:m.surface_render_method='DITHERED';m.use_backface_culling=True
    M[name]=m;return m
mat('orange',(.88,.225,.035),.18,.34)
mat('orange_dark',(.54,.115,.018),.25,.46)
mat('graphite',(.065,.075,.078),.60,.53)
mat('track',(.105,.116,.115),.62,.69)
mat('wear',(.30,.32,.30),.82,.40)
mat('steel',(.39,.43,.44),.75,.32)
mat('chrome',(.70,.77,.80),.95,.16)
mat('rubber',(.014,.019,.021),.02,.82)
mat('cab',(.54,.59,.59),.48,.38)
mat('glass',(.19,.34,.39),.10,.12,.28)
mat('seat',(.075,.105,.125),.02,.90)
mat('lens',(.86,.92,.90),.20,.20)
mat('amber',(.95,.36,.035),.05,.24)
mat('warning',(.98,.67,.06),.1,.5)
mat('screen',(.045,.13,.15),.2,.24)
KEYS=list(M);MI={k:i for i,k in enumerate(KEYS)}

class Mesh:
    def __init__(self,name,bevel=0):self.name=name;self.v=[];self.f=[];self.m=[];self.bevel=bevel
    def add(self,v,f,material):
        off=len(self.v);self.v.extend(tuple(p) for p in v)
        self.f.extend(tuple(off+i for i in face) for face in f)
        self.m.extend([MI[material]]*len(f))
    def box(self,c,size,material,basis=None):
        c=Vector(c);sx,sy,sz=[n/2 for n in size];basis=basis or Matrix.Identity(3)
        v=[c+basis@Vector((x,y,z)) for x,y,z in [(-sx,-sy,-sz),(sx,-sy,-sz),(sx,sy,-sz),(-sx,sy,-sz),(-sx,-sy,sz),(sx,-sy,sz),(sx,sy,sz),(-sx,sy,sz)]]
        self.add(v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],material)
    def cylinder(self,a,b,r,material,n=20,r2=None):
        a,b=Vector(a),Vector(b);z=(b-a).normalized()
        ref=Vector((0,0,1)) if abs(z.z)<.95 else Vector((1,0,0))
        x=z.cross(ref).normalized();y=z.cross(x).normalized();r2=r if r2 is None else r2
        v=[p+rad*(math.cos(2*math.pi*j/n)*x+math.sin(2*math.pi*j/n)*y) for p,rad in [(a,r),(b,r2)] for j in range(n)]
        f=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
        self.add(v,f,material)
    def beam(self,a,b,width,depth,material):
        a,b=Vector(a),Vector(b);z=(b-a).normalized()
        ref=Vector((0,0,1)) if abs(z.z)<.95 else Vector((1,0,0))
        x=z.cross(ref).normalized();y=z.cross(x).normalized()
        self.box((a+b)/2,(width,depth,(b-a).length),material,Matrix((x,y,z)).transposed())
    def profile(self,points,width,material,y=0):
        n=len(points);v=[(x,y+s*width/2,z) for s in [-1,1] for x,z in points]
        f=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
        self.add(v,f,material)
    def plan(self,points,z0,z1,material):
        n=len(points);v=[(x,y,z) for z in [z0,z1] for x,y in points]
        f=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
        self.add(v,f,material)
    def ring(self,center,axis,outer,inner,depth,material,n=28):
        c=Vector(center);z=Vector(axis).normalized();ref=Vector((0,0,1)) if abs(z.z)<.95 else Vector((1,0,0))
        x=z.cross(ref).normalized();y=z.cross(x).normalized()
        v=[c+z*d+rad*(math.cos(j*2*math.pi/n)*x+math.sin(j*2*math.pi/n)*y) for d,rad in [(-depth/2,outer),(depth/2,outer),(-depth/2,inner),(depth/2,inner)] for j in range(n)]
        f=[]
        for j in range(n):
            k=(j+1)%n
            f.extend([(j,k,n+k,n+j),(2*n+j,3*n+j,3*n+k,2*n+k),(j,2*n+j,2*n+k,k),(n+j,n+k,3*n+k,3*n+j)])
        self.add(v,f,material)
    def tube(self,points,r,material,n=8,samples=6):
        p=[Vector(t) for t in points];curve=[]
        for i in range(len(p)-1):
            a,b,c,d=p[max(i-1,0)],p[i],p[i+1],p[min(i+2,len(p)-1)]
            for j in range(samples):
                t=j/samples
                curve.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
        curve.append(p[-1]);v=[];prev=None
        for i,c in enumerate(curve):
            tangent=(curve[min(i+1,len(curve)-1)]-curve[max(0,i-1)]).normalized()
            ref=Vector((0,1,0)) if abs(tangent.y)<.95 else Vector((1,0,0))
            x=(prev-tangent*prev.dot(tangent)).normalized() if prev is not None else tangent.cross(ref).normalized()
            y=tangent.cross(x).normalized();prev=x
            v.extend(c+r*(math.cos(j*2*math.pi/n)*x+math.sin(j*2*math.pi/n)*y) for j in range(n))
        f=[tuple(reversed(range(n))),tuple((len(curve)-1)*n+j for j in range(n))]
        for i in range(len(curve)-1):
            f.extend((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j) for j in range(n))
        self.add(v,f,material)
    def finish(self):
        me=bpy.data.meshes.new(self.name+'_mesh');me.from_pydata(self.v,[],self.f);me.update()
        for m in M.values():me.materials.append(m)
        for p,i in zip(me.polygons,self.m):p.material_index=i
        bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        if self.bevel:
            edges=[e for e in bm.edges if e.is_manifold and e.calc_face_angle()>.6]
            bmesh.ops.bevel(bm,geom=edges,offset=self.bevel,segments=2,affect='EDGES',clamp_overlap=True,material=-1)
        bmesh.ops.dissolve_degenerate(bm,dist=.000001,edges=list(bm.edges))
        bmesh.ops.triangulate(bm,faces=list(bm.faces))
        bmesh.ops.dissolve_degenerate(bm,dist=.000001,edges=list(bm.edges))
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        for f in bm.faces:f.smooth=True
        for e in bm.edges:
            if e.is_manifold:e.smooth=e.calc_face_angle()<math.radians(42)
        bm.to_mesh(me);bm.free();me.update()
        uv=me.uv_layers.new(name='UV0')
        for p in me.polygons:
            axis=max(range(3),key=lambda k:abs(p.normal[k]))
            for li in p.loop_indices:
                co=me.vertices[me.loops[li].vertex_index].co
                uv.data[li].uv=(co.x,co.y) if axis==2 else ((co.x,co.z) if axis==1 else (co.y,co.z))
        ob=bpy.data.objects.new(self.name,me);asset.objects.link(ob)
        ob['part']=self.name;ob['asset_type']='excavator_component'
        return ob

hardware=Mesh('EXC / fasteners and grease fittings')
def bolt(center,axis,r=.026,material='steel'):
    c=Vector(center);a=Vector(axis).normalized()
    hardware.cylinder(c-a*.007,c+a*.018,r,material,6)
    hardware.cylinder(c+a*.018,c+a*.020,r*.42,'graphite',6)
def axle(mesh,x,y,z,r=.14,width=.8):
    mesh.cylinder((x,y-width/2,z),(x,y+width/2,z),r,'steel',24)
    for side in [-1,1]:
        mesh.cylinder((x,y+side*(width/2+.002),z),(x,y+side*(width/2+.035),z),r*1.15,'orange_dark',24)
        bolt((x,y+side*(width/2+.04),z),(0,side,0),r*.38)

print('Building articulated track shoes and running gear',flush=True)
track=Mesh('EXC / 104 individual crawler shoes')
wheels=Mesh('EXC / sprockets idlers and rollers')
frame=Mesh('EXC / lower chassis and swing bearing',.015)
L=3.5;R=.55;perimeter=2*L+2*math.pi*R
def track_point(s):
    if s<L:return Vector((-1.75+s,0,.64+R)),Vector((1,0,0))
    s-=L
    if s<math.pi*R:
        a=math.pi/2-s/R;return Vector((1.75+R*math.cos(a),0,.64+R*math.sin(a))),Vector((math.sin(a),0,-math.cos(a)))
    s-=math.pi*R
    if s<L:return Vector((1.75-s,0,.64-R)),Vector((-1,0,0))
    s-=L;a=-math.pi/2-s/R
    return Vector((-1.75+R*math.cos(a),0,.64+R*math.sin(a))),Vector((math.sin(a),0,-math.cos(a)))
for side in [-1,1]:
    yc=side*1.22
    frame.box((0,yc,.72),(3.8,.43,.44),'graphite')
    frame.box((0,yc+side*.235,.79),(3.35,.045,.33),'track')
    for i in range(52):
        p,t=track_point((i+.5)*perimeter/52);p.y=yc;lat=Vector((0,1,0));normal=t.cross(lat)
        basis=Matrix((t,lat,normal)).transposed()
        track.box(p,(.181,.69,.085),'track',basis)
        track.box(p+normal*.067,(.046,.705,.052),'wear',basis)
        for yy in [-.24,.24]:
            track.box(p+lat*yy-normal*.057,(.15,.085,.10),'graphite',basis)
            track.cylinder(p+lat*(yy-.06)-normal*.035,p+lat*(yy+.06)-normal*.035,.034,'steel',8)
            for xx in [-.052,.052]:bolt(p+t*xx+lat*yy+normal*.046,normal,.022,'wear')
    for x in [-1.75,1.75]:
        wheels.cylinder((x,yc-.20,.64),(x,yc+.20,.64),.47,'graphite',32)
        wheels.ring((x,yc+side*.215,.64),(0,1,0),.47,.30,.055,'wear',32)
        wheels.cylinder((x,yc+side*.2,.64),(x,yc+side*.28,.64),.21,'track',24)
        wheels.cylinder((x,yc+side*.28,.64),(x,yc+side*.30,.64),.105,'steel',20)
        for j in range(10):
            a=2*math.pi*j/10;bolt((x+.25*math.cos(a),yc+side*.25,.64+.25*math.sin(a)),(0,side,0),.027)
        if x<0:
            for j in range(18):
                a=2*math.pi*j/18
                wheels.box((x+.48*math.cos(a),yc,.64+.48*math.sin(a)),(.11,.34,.10),'wear',Euler((0,-a,0)).to_matrix())
    for x in [-1.25,-.83,-.41,0,.41,.83,1.25]:
        wheels.cylinder((x,yc-.22,.43),(x,yc+.22,.43),.30,'graphite',20)
        for sign in [-1,1]:
            wheels.cylinder((x,yc+sign*.22,.43),(x,yc+sign*.24,.43),.23,'wear',20)
            wheels.cylinder((x,yc+sign*.24,.43),(x,yc+sign*.29,.43),.105,'track',16)
            bolt((x,yc+sign*.30,.43),(0,sign,0),.045)
    for x in [-.9,.9]:wheels.cylinder((x,yc-.16,1.0),(x,yc+.16,1.0),.15,'wear',16)
    for x in [-1.4,-.65,.1,.85,1.4]:
        for z in [.7,.9]:bolt((x,yc+side*.265,z),(0,side,0),.025)
frame.box((-.05,0,.91),(2.8,2.12,.45),'graphite')
for x in [-1.0,1.0]:frame.box((x,0,.78),(.45,2.55,.38),'track')
frame.cylinder((0,0,1.13),(0,0,1.32),.96,'wear',64)
frame.cylinder((0,0,1.32),(0,0,1.48),.88,'graphite',64)
for j in range(48):
    a=2*math.pi*j/48
    bolt((.90*math.cos(a),.90*math.sin(a),1.34),(0,0,1),.026)
    frame.box((.95*math.cos(a),.95*math.sin(a),1.21),(.06,.06,.10),'steel',Euler((0,0,a)).to_matrix())

print('Building upper carriage, engine and operator cabin',flush=True)
body=Mesh('EXC / orange upper carriage and counterweight',.035)
trim=Mesh('EXC / engine vents service panels and trim',.008)
body.plan([(-2.10,-.92),(-2.28,-.57),(-2.31,.45),(-2.15,.97),(1.4,1.0),(1.67,.6),(1.67,-1.12),(-.2,-1.18)],1.41,1.67,'graphite')
body.plan([(-2.03,-.94),(-2.25,-.62),(-2.32,-.15),(-2.31,.42),(-2.16,.91),(-1.78,1.07),(-.61,.98),(-.61,-.90)],1.68,2.62,'orange')
body.plan([(-2.02,-.85),(-2.15,-.55),(-2.17,.45),(-1.91,.88),(-.61,.88),(-.57,-.84)],2.64,2.92,'orange')
body.box((-.02,.65,2.09),(1.1,.85,.86),'orange')
body.box((-.03,.65,2.60),(1.14,.9,.16),'graphite')
trim.box((-1.30,.95,2.22),(1.0,.028,.62),'rubber')
trim.box((-1.50,-.96,2.20),(.68,.025,.58),'rubber')
for i in range(24):trim.box((-1.77+i*.040,.978,2.22),(.014,.035,.60),'orange')
for i in range(18):trim.box((-1.81+i*.037,-.983,2.20),(.012,.035,.57),'orange')
trim.box((-1.35,.06,2.956),(1.12,1.26,.035),'rubber')
for i in range(22):trim.box((-1.86+i*.048,.06,2.984),(.015,1.23,.025),'graphite')
trim.tube([(-2.24,-.52,2.62),(-2.31,0,2.62),(-2.24,.62,2.62),(-1.8,1.08,2.62)],.008,'rubber',6,5)
for x in [-1.95,-.78]:
    for z in [1.8,2.52]:bolt((x,.993,z),(0,1,0),.025)
for x in [-1.78,-1.0]:
    trim.box((x,.993,2.14),(.075,.03,.09),'graphite')
    trim.cylinder((x,1.012,2.14),(x,1.023,2.14),.02,'steel',12)
trim.cylinder((-1.85,.62,2.95),(-1.85,.62,3.36),.055,'graphite',16)
trim.cylinder((-1.85,.62,3.34),(-1.85,.62,3.40),.073,'steel',16)
trim.box((-2.32,-.50,2.10),(.024,.25,.10),'amber')
trim.box((-2.32,.50,2.10),(.024,.25,.10),'amber')

cab=Mesh('EXC / cab frame door roof and glazing seals',.018)
glass=Mesh('EXC / transparent cabin glazing')
interior=Mesh('EXC / seat controls pedals and displays',.012)
accessories=Mesh('EXC / mirrors wipers lamps and access steps',.009)
cab.profile([(-.58,1.64),(1.52,1.64),(1.53,2.14),(-.58,2.14)],1.10,'cab',-.66)
cab.box((.43,-.66,1.72),(1.96,1.03,.10),'rubber')
cab.profile([(-.62,3.32),(-.4,3.53),(1.13,3.53),(1.29,3.40),(1.25,3.28),(-.60,3.27)],1.20,'graphite',-.66)
side_outline=[(-.55,1.78),(1.45,1.78),(1.49,2.20),(1.15,3.39),(-.36,3.39),(-.55,3.20),(-.55,1.78)]
for y in [-1.22,-.10]:
    cab.tube([(x,y,z) for x,z in side_outline],.048,'cab',10,3)
    cab.beam((.10,y,2.05),(.10,y,3.38),.04,.05,'cab')
    cab.beam((-.52,y,2.16),(1.45,y,2.16),.06,.06,'cab')
    win=[(.18,2.23),(1.42,2.23),(1.10,3.31),(.18,3.31)]
    rear=[(-.47,2.23),(.025,2.23),(.025,3.31),(-.31,3.31),(-.47,3.13)]
    for points in [win,rear]:
        glass.profile(points,.009,'glass',y)
        cab.tube([(x,y-.004,z) for x,z in points+[points[0]]],.018,'rubber',8,2)
# Front windshield, between the sloped A pillars.
front_v=[(1.475,-1.17,2.22),(1.475,-.15,2.22),(1.15,-.15,3.35),(1.15,-1.17,3.35)]
glass.add(front_v+[(x+.009,y,z) for x,y,z in front_v],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'glass')
for z,x in [(2.19,1.49),(3.39,1.15)]:cab.beam((x,-1.20,z),(x,-.12,z),.06,.06,'graphite')
glass.box((-.571,-.66,2.77),(.009,.95,.91),'glass')
cab.box((-.594,-.66,2.12),(.07,1.12,.55),'cab')
for y in [-1.2,-.12]:cab.beam((-.59,y,2.13),(-.59,y,3.30),.06,.06,'cab')
for z in [2.16,3.30]:cab.beam((-.59,-1.2,z),(-.59,-.12,z),.06,.06,'cab')
# Door lower panel and perimeter seam.
trim.profile([(.18,1.80),(1.40,1.80),(1.42,2.10),(.18,2.10)],.022,'cab',-1.253)
trim.tube([(.12,-1.27,1.76),(1.43,-1.27,1.76),(1.49,-1.27,2.19),(1.14,-1.27,3.38),(.12,-1.27,3.38),(.12,-1.27,1.76)],.009,'rubber',6,2)
accessories.tube([(.25,-1.30,2.05),(.25,-1.34,2.15),(.48,-1.34,2.15),(.48,-1.30,2.05)],.018,'graphite',8,3)
for z in [2.32,3.10]:
    accessories.cylinder((.11,-1.29,z-.055),(.11,-1.29,z+.055),.028,'steel',12)
    bolt((.11,-1.32,z),(0,-1,0),.018)
# Seat, suspension, console and two joysticks visible through the glass.
interior.box((.02,-.66,1.86),(.40,.44,.27),'graphite')
for z in [1.76,1.81,1.86,1.91]:interior.box((.02,-.66,z),(.43,.46,.025),'rubber')
interior.box((.10,-.66,2.10),(.60,.63,.16),'seat')
interior.box((-.13,-.66,2.40),(.15,.63,.58),'seat',Euler((0,-.10,0)).to_matrix())
interior.box((-.18,-.66,2.78),(.14,.41,.19),'seat')
for y in [-1.0,-.30]:
    interior.box((.15,y,2.22),(.48,.12,.13),'graphite')
    interior.cylinder((.34,y,2.28),(.40,y,2.47),.022,'steel',10)
    interior.box((.40,y,2.48),(.07,.07,.10),'rubber')
    interior.cylinder((.4,y-.038,2.51),(.4,y-.042,2.51),.013,'orange',8)
interior.box((.92,-.36,2.28),(.23,.22,.30),'graphite',Euler((0,.25,0)).to_matrix())
interior.box((.84,-.36,2.40),(.012,.17,.14),'screen')
for y in [-.82,-.56]:
    interior.box((1.0,y,1.82),(.28,.16,.035),'wear',Euler((0,-.23,0)).to_matrix())
    for x in [.9,.96,1.02,1.08]:interior.box((x,y,1.85),(.016,.14,.013),'rubber')
interior.cylinder((-.27,-.25,1.8),(-.27,-.25,2.20),.065,'orange',14)
interior.box((-.27,-.25,2.23),(.06,.08,.05),'graphite')
# Mirrors, wiper and roof details.
accessories.tube([(1.26,-1.20,2.70),(1.55,-1.36,2.73),(1.58,-1.63,2.86)],.024,'graphite',10,4)
accessories.box((1.58,-1.64,2.92),(.24,.075,.34),'graphite')
accessories.box((1.58,-1.684,2.92),(.195,.008,.28),'chrome')
accessories.beam((1.49,-.42,2.22),(1.25,-.92,3.03),.016,.014,'graphite')
accessories.beam((1.28,-1.05,2.94),(1.20,-.75,3.20),.024,.013,'rubber')
for y in [-1.02,-.30]:
    accessories.box((1.19,y,3.49),(.22,.25,.11),'graphite')
    accessories.box((1.306,y,3.49),(.012,.19,.07),'lens')
accessories.box((.35,-.66,3.55),(.88,.65,.04),'rubber')
for x in [-.02,.1,.22,.34,.46,.58,.70]:accessories.box((x,-.66,3.59),(.018,.65,.025),'graphite')
accessories.cylinder((-.33,-.63,3.50),(-.33,-.63,3.61),.11,'graphite',20)
accessories.cylinder((-.33,-.63,3.61),(-.33,-.63,3.77),.09,'amber',20,r2=.075)
accessories.cylinder((-.39,-.25,3.52),(-.48,-.25,4.0),.008,'rubber',8)
for z,x in [(1.35,.8),(1.08,.92)]:
    accessories.box((x,-1.40,z),(.68,.32,.055),'steel')
    for xx in [-.23,-.12,0,.12,.23]:accessories.box((x+xx,-1.40,z+.031),(.034,.27,.008),'rubber')
accessories.tube([(.0,-1.28,1.75),(-.12,-1.43,1.93),(-.12,-1.43,2.42),(.0,-1.28,2.57)],.024,'graphite',10,4)

print('Building boxed boom, stick, hydraulic cylinders and plumbing',flush=True)
boom=Mesh('EXC / boxed boom welds and reinforcements',.022)
stick=Mesh('EXC / dipper arm and pivot housings',.005)
hydraulic=Mesh('EXC / hydraulic barrels chrome rods and pin eyes')
hoses=Mesh('EXC / hydraulic hard lines hoses and clamps')
boom.profile([(.84,1.70),(1.49,1.67),(2.93,3.78),(5.99,4.04),(6.17,4.39),(5.97,4.67),(2.55,4.75),(2.08,4.48)],.44,'orange',.36)
for y in [.115,.605]:
    boom.profile([(1.01,1.82),(1.41,1.82),(2.72,3.91),(5.94,4.17),(6.01,4.40),(5.88,4.51),(2.61,4.56),(2.26,4.35)],.025,'orange_dark',y)
    boom.tube([(1.08,y,1.92),(2.48,y,4.41),(2.67,y,4.57),(5.89,y,4.51)],.012,'orange',8,3)
axle(boom,1.12,.36,1.93,.17,.83)
axle(boom,5.96,.36,4.40,.15,.69)
stick.profile([(6.12,5.16),(6.45,5.11),(6.67,4.35),(6.46,1.13),(6.31,.79),(6.04,.82),(5.95,1.12),(6.13,4.12),(5.92,4.63)],.35,'orange',.36)
for y in [.166,.554]:
    stick.profile([(6.20,4.80),(6.38,4.81),(6.49,4.27),(6.29,1.2),(6.13,1.15),(6.28,4.13)],.023,'orange_dark',y)
axle(stick,6.23,.36,5.02,.105,.57)
axle(stick,6.21,.36,1.04,.13,.66)
for y in [.13,.59]:
    stick.profile([(6.46,3.97),(6.77,4.02),(6.83,4.22),(6.67,4.39),(6.49,4.35)],.08,'orange',y)
axle(stick,6.72,.36,4.19,.08,.62)

def cylinder(a,b,r=.095):
    a,b=Vector(a),Vector(b);delta=b-a;u=delta.normalized();split=a+delta*.59
    hydraulic.cylinder(a+u*.11,split,r,'orange',24)
    hydraulic.cylinder(a+u*.15,a+u*.25,r*1.18,'orange_dark',24)
    hydraulic.cylinder(split-u*.07,split+u*.05,r*1.15,'steel',24)
    hydraulic.cylinder(split+u*.052,split+u*.072,r*.76,'rubber',24)
    hydraulic.cylinder(split,b-u*.10,r*.53,'chrome',24)
    for p in [a,b]:hydraulic.ring(p,(0,1,0),r*1.13,r*.57,r*1.7,'orange',24)
    for p in [a,b]:axle(hydraulic,p.x,p.y,p.z,r*.53,r*2.25)
    for p in [a+u*.31,split-u*.16]:
        hydraulic.cylinder(p+Vector((0,-r,0)),p+Vector((0,-r-.055,0)),.025,'steel',10)
    return a,split,b

for y in [-.03,.75]:cylinder((.64,y,1.83),(2.40,y,4.22),.13)
cylinder((2.82,.36,4.86),(6.23,.36,5.03),.12)
cylinder((6.72,.36,4.19),(6.78,.36,1.44),.092)
axle(boom,2.82,.36,4.86,.11,.64)
boom.profile([(2.60,4.62),(3.07,4.65),(2.91,5.02),(2.74,5.03)],.10,'orange',.08)
boom.profile([(2.60,4.62),(3.07,4.65),(2.91,5.02),(2.74,5.03)],.10,'orange',.64)
# Paired hard lines with bend loops over the boom, service clamps and hose couplings.
for i in range(4):
    y=.16+i*.13
    hoses.tube([(.28,y,1.97),(1.03,y,2.2),(1.73,y,3.65),(2.37,y,4.76),(3.25,y,4.81),(4.75,y,4.73),(5.62,y,4.70)],.018,'graphite',8,5)
    hoses.tube([(5.60,y,4.7),(5.90,y,4.77),(6.27,y,4.56),(6.50,y,3.97),(6.50,y,3.1)],.024,'rubber',10,7)
    hoses.tube([(6.50,y,3.1),(6.48,y,2.54),(6.53,y,2.32)],.015,'steel',8,4)
    for x,z in [(3.4,4.805),(4.5,4.75),(5.3,4.71)]:
        hoses.box((x,y,z),(.065,.055,.065),'steel')
        bolt((x,y,z+.04),(0,0,1),.016)
    for z in [3.0,2.60]:hoses.cylinder((6.50,y,z-.045),(6.50,y,z+.045),.026,'steel',10)
for side in [-1,1]:
    y=.36+side*.44
    hoses.tube([(.22,y,1.75),(.30,y,2.25),(.69,y,2.36),(.85,y,2.08)],.028,'rubber',10,7)
hoses.tube([(2.75,.2,4.86),(3.15,.1,5.10),(4.35,.1,5.02),(4.80,.3,4.88)],.022,'rubber',10,7)

print('Building hollow bucket, linkage and dozer blade',flush=True)
bucket=Mesh('EXC / hollow digging bucket and wear liners',.012)
teeth=Mesh('EXC / six replaceable bucket teeth',.007)
link=Mesh('EXC / bucket linkage and quick coupler',.013)
bucket_fasteners_start=len(hardware.v)
outer=[(5.99,1.28),(5.72,.93),(5.78,.50),(6.05,.18),(6.50,.06),(6.95,.13),(7.50,.42)]
inner=[(6.12,1.28),(5.91,.94),(5.97,.58),(6.21,.36),(6.54,.25),(6.94,.31),(7.45,.57)]
bucket.profile(outer+list(reversed(inner)),1.13,'wear',.36)
sidepoints=outer+[(7.26,1.04),(6.56,1.29),(6.15,1.48)]
for y in [-.25,.97]:
    bucket.profile(sidepoints,.075,'orange',y)
    bucket.profile([(6.08,1.27),(5.84,.90),(5.91,.55),(6.13,.30),(6.53,.18),(6.96,.24),(7.30,.44),(7.14,.82),(6.5,1.13)],.025,'orange_dark',y+(-.05 if y<0 else .05))
    for x,z in [(6.15,1.25),(6.46,1.19),(7.08,.78)]:bolt((x,y+(-.05 if y<0 else .05),z),(0,-1 if y<0 else 1,0),.033)
for y in [-.02,.36,.74]:
    bucket.tube([(x,y,z-.045) for x,z in outer[1:-1]],.045,'graphite',8,3)
for i in range(6):
    y=-.14+i*.20
    teeth.profile([(7.33,.38),(7.62,.35),(7.66,.56),(7.39,.61)],.17,'orange',y)
    teeth.profile([(7.56,.35),(8.02,.43),(7.86,.53),(7.58,.55)],.135,'steel',y)
    bolt((7.53,y-.09,.48),(0,-1,0),.025)
# Backhoe bucket opens towards the chassis; keep the dipper hinge at x=6.21.
# Mirror the shell, cutting edge and their fasteners, preserving the outer rocker.
for part in [bucket,teeth]:
    part.v=[(2*6.21-x,y,z) for x,y,z in part.v]
hardware.v[bucket_fasteners_start:]=[(2*6.21-x,y,z) for x,y,z in hardware.v[bucket_fasteners_start:]]
link.profile([(6.0,1.18),(6.09,1.57),(6.37,1.62),(6.57,1.23)],.35,'graphite',.36)
for y in [.08,.64]:
    link.beam((6.21,y,1.05),(6.78,y,1.45),.14,.09,'orange')
    link.beam((6.78,y,1.45),(6.45,y,1.22),.13,.09,'orange')
axle(link,6.78,.36,1.45,.10,.75)
axle(link,6.45,.36,1.22,.09,.75)
blade=Mesh('EXC / curved dozer blade and lift linkage',.015)
blade.profile([(2.53,.24),(2.78,.18),(2.90,.28),(2.76,.62),(2.67,.96),(2.74,1.18),(2.58,1.20),(2.51,.96)],3.30,'graphite',0)
blade.profile([(2.74,.18),(2.90,.27),(2.86,.37),(2.70,.29)],3.33,'wear',0)
for y in [-1.4,-.70,0,.70,1.4]:blade.beam((2.55,y,.33),(2.55,y,1.10),.08,.10,'track')
for y in [-.88,.88]:
    blade.beam((.52,y,.68),(2.55,y,.55),.17,.19,'graphite')
    axle(blade,.62,y,.68,.095,.28)
    axle(blade,2.50,y,.55,.085,.27)
cylinder((.80,0,1.06),(2.48,0,.64),.085)
for y in [i*.22 for i in range(-7,8)]:bolt((2.872,y,.29),(1,0,-.3),.033,'graphite')
for y in [-1.35,1.35]:
    accessories.box((1.37,y,1.50),(.18,.08,.12),'graphite')
    accessories.box((1.466,y,1.50),(.012,.06,.07),'lens')
# Small safety placards and non-branded serial plate.
trim.box((-.79,.998,2.40),(.24,.012,.13),'warning')
for i in range(4):trim.box((-.88+i*.055,1.008,2.40),(.019,.009,.13),'graphite',Euler((0,.25,0)).to_matrix())
trim.box((-1.96,-.96,1.88),(.21,.018,.11),'steel')
for x in [-2.03,-1.89]:bolt((x,-.976,1.88),(0,-1,0),.009)

parts=[track,wheels,frame,body,trim,cab,glass,interior,accessories,boom,stick,hydraulic,hoses,bucket,teeth,link,blade,hardware]
root=bpy.data.objects.new('EXCAVATOR_01 / detailed hydraulic excavator',None);asset.objects.link(root)
root['asset_id']='EXCAVATOR_01';root['asset_type']='hydraulic_excavator';root['reference']='User supplied image; interpreted dimensional design, not a manufacturer CAD model.'
for p in parts:
    ob=p.finish();ob.parent=root
report={'asset_id':'EXCAVATOR_01','track_shoes':104,'bucket_teeth':6,'bucket_opens_towards':'-X / chassis','parts':[],'units':'metres'}
for ob in asset.objects:
    if ob.type!='MESH':continue
    bm=bmesh.new();bm.from_mesh(ob.data)
    bad=sum(not e.is_manifold for e in bm.edges);deg=sum(f.calc_area()<1e-10 for f in bm.faces);bm.free()
    ob.data.calc_loop_triangles()
    report['parts'].append({'name':ob.name,'triangles':len(ob.data.loop_triangles),'non_manifold_edges':bad,'degenerate_faces':deg})
report['triangles']=sum(p['triangles'] for p in report['parts'])
report['non_manifold_edges']=sum(p['non_manifold_edges'] for p in report['parts'])
report['degenerate_faces']=sum(p['degenerate_faces'] for p in report['parts'])
(OUT/'excavator_validation.json').write_text(json.dumps(report,indent=2))
print('REPORT',json.dumps({k:v for k,v in report.items() if k!='parts'}),flush=True)

def aim(ob,p):ob.rotation_euler=(Vector(p)-ob.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('EXC Camera');cam=bpy.data.objects.new('EXC Camera',camdata);studio.objects.link(cam);scene.camera=cam
cam.location=(12,-16,9);aim(cam,(2.7,0,2.3));camdata.type='ORTHO';camdata.ortho_scale=12.7;camdata.clip_end=1000
def area(name,p,energy,size):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size
    ob=bpy.data.objects.new(name,d);studio.objects.link(ob);ob.location=p;aim(ob,(2,0,2))
area('EXC Key',(-2,-7,12),1900,7)
area('EXC Fill',(9,-2,8),1200,6)
area('EXC Rim',(0,7,10),2100,6)
world=bpy.data.worlds.new('EXC Neutral');scene.world=world;world.use_nodes=True
world.node_tree.nodes.get('Background').inputs[0].default_value=(.65,.68,.72,1)
world.node_tree.nodes.get('Background').inputs[1].default_value=.4
scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True;scene.cycles.max_bounces=8
scene.render.film_transparent=True;scene.render.resolution_x=2000;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.view_settings.view_transform='AgX'
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':a.spaces.active.region_3d.view_perspective='CAMERA';a.spaces.active.shading.color_type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Excavator_Detailed.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in asset.objects:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'Excavator_Detailed.glb'),export_format='GLB',use_selection=True,export_extras=True,export_tangents=False,export_cameras=False,export_lights=False)
scene.render.filepath=str(OUT/'Excavator_Hero.png');bpy.ops.render.render(write_still=True)
cam.location=(9,-18,6);aim(cam,(2.7,0,2.35));camdata.ortho_scale=12.7
scene.render.filepath=str(OUT/'Excavator_Side.png');bpy.ops.render.render(write_still=True)
print('DONE',flush=True)
