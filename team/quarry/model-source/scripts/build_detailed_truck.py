"""Detailed rigid mining truck, user-reference interpretation. Metres; +X front, Z up."""
from pathlib import Path
helper=Path(__file__).with_name('build_detailed_excavator.py').read_text().split("hardware=Mesh(")[0]
exec(helper.replace("OUT=ROOT/'excavator'", "OUT=ROOT/'truck'").replace("EXCAVATOR_01 / detailed reference asset", "TRUCK_01 / detailed reference asset").replace("'EXC_'+name", "'TRUCK_'+name"))
M['orange'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.88,.135,.025,1)
M['orange'].diffuse_color=(.88,.135,.025,1)
parts=[]
def part(name,bevel=0):
    m=Mesh('TRUCK / '+name,bevel);parts.append(m);return m
hardware=part('fasteners wheel studs and pivot pins')
def bolt(c,axis,r=.035):
    c=Vector(c);axis=Vector(axis).normalized()
    hardware.cylinder(c-axis*.01,c+axis*.025,r,'steel',6)
    hardware.cylinder(c+axis*.025,c+axis*.031,r*.48,'graphite',6)
frame=part('ladder chassis axles and differential',.015)
for y in [-.83,.83]:frame.box((-.5,y,1.9),(7.7,.24,.52),'graphite')
for x in [-3.5,-2.5,-1.5,-.5,.5,1.5,2.5,3.4]:frame.box((x,0,1.96),(.24,2.1,.32),'graphite')
for x in [-2.6,2.45]:
    frame.cylinder((x,-2.4,1.45),(x,2.4,1.45),.23,'graphite',28)
    frame.cylinder((x,-.6,1.45),(x,.6,1.45),.49,'graphite',36)
frame.cylinder((-2.5,0,1.6),(2.5,0,1.6),.13,'steel',20)
frame.box((1.6,0,2.45),(2.4,1.4,.7),'graphite')
frame.box((-.3,0,2.4),(1.0,1.3,.65),'steel')
# Six radial carcasses, with four banks of staggered chevron lugs per tyre.
tyres=part('six heavy duty tyre carcasses')
tread=part('1536 individual chevron tread lugs')
rims=part('deep orange wheel rims and hubs',.006)
suspension=part('suspension steering and brake assemblies',.006)
def tyre(x,y):
    z=1.43
    profile=[(-.50,.78),(-.53,1.02),(-.47,1.23),(-.35,1.36),(-.20,1.405),(.20,1.405),(.35,1.36),(.47,1.23),(.53,1.02),(.50,.78)]
    n=72;vs=[]
    for yy,r in profile:
        vs += [(x+r*math.sin(j*2*math.pi/n),y+yy,z+r*math.cos(j*2*math.pi/n)) for j in range(n)]
    fs=[]
    for k in range(len(profile)):
        for j in range(n):
            kn=(k+1)%len(profile);jn=(j+1)%n
            fs.append((k*n+j,k*n+jn,kn*n+jn,kn*n+j))
    tyres.add(vs,fs,'rubber')
    for j in range(64):
        for bank in range(4):
            yy=(bank-1.5)*.228;a=(j+(bank%2)*.35)*2*math.pi/64
            radial=Vector((math.sin(a),0,math.cos(a)));tangent=Vector((math.cos(a),0,-math.sin(a)));lat=Vector((0,1,0))
            skew=.45 if bank<2 else -.45
            tx=(tangent*math.cos(skew)+lat*math.sin(skew));ty=(-tangent*math.sin(skew)+lat*math.cos(skew))
            basis=Matrix((tx,ty,radial)).transposed()
            tread.box(Vector((x,y+yy,z))+radial*1.423,(.115,.255,.080),'rubber',basis)
    for side in [-1,1]:
        yc=y+side*.48
        rims.ring((x,yc,z),(0,1,0),.81,.66,.10,'orange',48)
        rims.cylinder((x,yc-side*.16,z),(x,yc-side*.10,z),.66,'orange_dark',48)
        rims.cylinder((x,yc-side*.12,z),(x,yc+side*.025,z),.34,'orange',36)
        rims.ring((x,yc-side*.085,z),(0,1,0),.63,.40,.055,'orange',48)
        for j in range(16):
            a=2*math.pi*j/16
            bolt((x+.42*math.sin(a),yc+side*.009,z+.42*math.cos(a)),(0,side,0),.038)
        for j in range(32):
            a=2*math.pi*j/32
            tread.box((x+1.12*math.sin(a),y+side*.513,z+1.12*math.cos(a)),(.06,.012,.025),'track',Euler((0,a,0)).to_matrix())
for x,y in [(2.45,-2.13),(2.45,2.13),(-2.6,-2.33),(-2.6,-1.19),(-2.6,1.19),(-2.6,2.33)]:tyre(x,y)
for x in [-2.6,2.45]:
    for y in [-1.1,1.1]:
        suspension.cylinder((x,y,1.5),(x+.12,y,2.50),.16,'chrome',20)
        suspension.cylinder((x+.06,y,2.0),(x+.15,y,2.86),.24,'graphite',24)
        suspension.beam((x-.6,y,1.55),(x+.6,y,1.55),.16,.19,'graphite')
suspension.cylinder((2.72,-1.8,1.6),(2.72,1.8,1.6),.07,'steel',20)
# Main deck and broad radiator on the front face.
body=part('orange deck bumper and service housings',.035)
body.box((2.65,0,2.96),(3.4,5.15,.20),'orange')
body.box((4.18,0,1.05),(.40,5.25,.38),'orange')
body.box((3.8,0,2.05),(.50,3.40,1.9),'orange')
body.box((.1,1.56,2.48),(1.5,1.20,.82),'orange')
body.box((.1,-1.56,2.48),(1.5,1.20,.82),'graphite')
for y in [-2.17,2.17]:
    body.profile([(1.10,2.75),(1.45,3.04),(3.35,3.04),(3.87,2.55),(3.70,2.50),(3.25,2.86),(1.5,2.86)],1.07,'orange',y)
    body.box((3.8,y,1.48),(.32,.52,.3),'orange')
grille=part('radiator grid engine vents and cooling pipes')
grille.box((4.075,0,2.10),(.04,3.27,1.73),'rubber')
for y in [i*.068 for i in range(-23,24)]:grille.box((4.11,y,2.1),(.035,.018,1.65),'graphite')
for i in range(26):grille.box((4.127,0,1.30+i*.063),(.03,3.23,.019),'graphite')
for y in [-1.65,1.65]:grille.box((4.15,y,2.1),(.09,.075,1.81),'graphite')
for z in [1.22,2.97]:grille.box((4.15,0,z),(.09,3.36,.075),'graphite')
body.box((2.16,.8,3.61),(1.75,1.55,1.08),'cab')
for i in range(20):grille.box((1.39+i*.08,.8,4.166),(.035,1.45,.025),'graphite')
# Offset operator cab at the vehicle's left side, with closed transparent panes.
cab=part('grey operator cab roof door and seals',.018)
glass=part('transparent cab glazing')
interior=part('operator seat steering pedals and dashboard',.01)
yc=-1.40
cab.box((2.16,yc,3.28),(1.75,1.46,.52),'cab')
cab.box((2.10,yc,4.98),(1.95,1.64,.16),'cab')
cab.box((1.21,yc,4.0),(.12,1.46,1.62),'cab')
for y in [yc-.73,yc+.73]:
    cab.beam((3.02,y,3.50),(2.78,y,4.90),.085,.085,'cab')
    cab.beam((1.24,y,3.50),(1.24,y,4.90),.085,.085,'cab')
    cab.beam((1.25,y,3.53),(3.01,y,3.53),.07,.07,'graphite')
    cab.beam((1.25,y,4.88),(2.79,y,4.88),.07,.07,'graphite')
    cab.beam((1.82,y,3.53),(1.82,y,4.88),.045,.045,'cab')
    glass.profile([(1.30,3.60),(1.76,3.60),(1.76,4.82),(1.30,4.82)],.012,'glass',y)
    glass.profile([(1.88,3.60),(2.96,3.60),(2.75,4.82),(1.88,4.82)],.012,'glass',y)
    cab.tube([(1.84,y,3.13),(2.98,y,3.13),(3.06,y,3.52),(2.80,y,4.91),(1.84,y,4.91),(1.84,y,3.13)],.008,'rubber',6,2)
# windshield as thin prism, sloped rearward at top
v=[(3.01,yc-.67,3.60),(3.01,yc+.67,3.60),(2.80,yc+.67,4.82),(2.80,yc-.67,4.82)]
glass.add(v+[(x+.012,y,z) for x,y,z in v],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'glass')
for x,z in [(3.03,3.54),(2.80,4.89)]:cab.beam((x,yc-.73,z),(x,yc+.73,z),.075,.075,'cab')
interior.box((2.05,yc,3.48),(.22,.30,.25),'graphite')
interior.box((2.05,yc,3.65),(.55,.65,.15),'seat')
interior.box((1.80,yc,3.98),(.14,.64,.69),'seat')
interior.box((1.82,yc,4.41),(.16,.39,.23),'seat')
interior.box((2.74,yc,3.77),(.33,1.25,.24),'graphite')
interior.cylinder((2.65,yc,3.58),(2.54,yc,4.05),.045,'graphite',12)
interior.ring((2.54,yc,4.05),(.2,0,.8),.23,.20,.035,'graphite',24)
for y in [yc-.42,yc+.42]:
    interior.box((2.06,y,3.84),(.42,.12,.12),'graphite')
    interior.cylinder((2.15,y,3.89),(2.12,y,4.08),.027,'graphite',12)
for y in [yc-.15,yc+.15]:interior.box((2.62,y,3.40),(.22,.15,.04),'rubber')
# Access ladders, platforms and continuous tubular guard rails.
access=part('front access stairs grated catwalk and grab rails')
for side in [-1,1]:
    yy=side*2.18
    for j in range(7):
        x=4.63-j*.32;z=.40+j*.39
        access.box((x,yy,z),(.38,.66,.055),'graphite')
        for k in range(6):access.box((x-.145+k*.058,yy,z+.035),(.018,.61,.024),'steel')
    for y in [yy-.36,yy+.36]:
        access.beam((4.75,y,.35),(2.70,y,2.97),.10,.12,'orange')
        access.tube([(4.75,y,.55),(4.75,y,1.4),(2.69,y,3.90),(1.12,y,3.90)],.027,'graphite',10,2)
        access.beam((3.70,y,1.69),(3.70,y,2.70),.045,.045,'graphite')
    access.tube([(4.10,side*1.68,3.08),(4.10,side*1.68,4.03),(3.10,side*1.68,4.03)],.028,'graphite',10,2)
    for x in [1.18,2.0,3.05]:access.cylinder((x,side*2.53,3.06),(x,side*2.53,4.02),.025,'graphite',10)
    access.cylinder((1.15,side*2.53,4.02),(3.08,side*2.53,4.02),.028,'graphite',10)
    access.cylinder((1.15,side*2.53,3.52),(3.08,side*2.53,3.52),.022,'graphite',10)
access.cylinder((4.12,-1.68,4.03),(4.12,1.68,4.03),.029,'graphite',10)
for y in [-.8,0,.8]:access.cylinder((4.12,y,3.07),(4.12,y,4.03),.026,'graphite',10)
# Hollow dump body: thick floor, separate closed plate sides and front bulkhead.
bed=part('hollow dump body floor sidewalls and overcab canopy',.025)
bed.profile([(-4.35,2.79),(.65,2.79),(1.08,3.12),(.89,3.26),(-4.35,3.02)],4.75,'orange')
for side in [-1,1]:
    # slanted outward side wall, leaving an open loading volume and rear discharge lip
    y0=side*2.30;y1=side*2.67
    vv=[(-4.42,y0,2.96),(1.0,y0,3.10),(1.18,y1,4.62),(-4.55,y1,4.62)]
    thick=side*.12
    bed.add(vv+[(x,y+thick,z) for x,y,z in vv],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'orange')
    bed.beam((-4.57,y1+thick/2,4.63),(1.21,y1+thick/2,4.63),.16,.18,'orange')
    bed.beam((-4.45,y0,3.0),(1.05,y0,3.14),.18,.17,'orange_dark')
# Raised front bulkhead + large protective canopy above cabin.
bed.profile([(.76,3.10),(1.02,3.06),(1.68,5.43),(4.65,5.43),(4.65,5.61),(1.43,5.61)],5.42,'orange')
for side in [-1,1]:
    bed.profile([(1.20,4.58),(1.43,5.61),(4.65,5.61),(4.65,5.45),(1.67,5.43),(1.45,4.58)],.14,'orange_dark',side*2.69)
# Bed underside stiffeners visible beside rear wheels.
ribs=part('dump body ribs hinge bosses and wear strips',.012)
for x in [-4,-3,-2,-1,0]:
    ribs.box((x,0,2.72),(.14,4.65,.18),'orange_dark')
    for side in [-1,1]:
        ribs.beam((x,side*2.38,3.07),(x,side*2.75,4.53),.12,.15,'orange_dark')
        for z in [3.40,4.25]:bolt((x,side*(2.42+(z-3.1)*.25),z),(0,side,0),.035)
for y in [-1.0,1.0]:
    ribs.cylinder((-3.75,y-.20,2.59),(-3.75,y+.20,2.59),.20,'orange',28)
    bolt((-3.75,y-.22,2.59),(0,-1,0),.095)
for y in [-1.5,0,1.5]:ribs.box((-.8,y,3.06),(6.9,.14,.032),'wear')
hyd=part('paired dump lift rams hoses and fluid tanks',.005)
for y in [-.90,.90]:
    a=Vector((.95,y,1.95));b=Vector((-.75,y,2.80));v=b-a
    hyd.cylinder(a,a+v*.70,.18,'orange',24)
    hyd.cylinder(a+v*.55,b,.105,'chrome',24)
    for p in [a,b]:hyd.cylinder(p+Vector((0,-.19,0)),p+Vector((0,.19,0)),.16,'graphite',24)
    hyd.tube([(1,y,1.97),(1.25,y,1.80),(.2,y,1.7),(-.7,y,2.4)],.025,'rubber',10,4)
hyd.box((-.3,-1.55,2.3),(1.5,.85,.75),'steel')
hyd.cylinder((-.3,-1.55,2.69),(-.3,-1.55,2.77),.10,'graphite',20)
accessories=part('mirrors wipers work lamps warning beacons and extinguisher',.006)
for side in [-1,1]:
    accessories.box((4.40,side*1.46,1.03),(.04,.44,.19),'graphite')
    for y in [side*1.46-.10,side*1.46+.10]:accessories.cylinder((4.43,y,1.03),(4.46,y,1.03),.066,'lens',20)
    accessories.box((-4.39,side*2.18,2.88),(.04,.28,.12),'orange_dark')
    accessories.box((-4.42,side*2.18,2.88),(.03,.13,.10),'amber')
    accessories.tube([(2.75,side*2.15,4.53),(3.15,side*2.65,4.5),(3.16,side*2.82,4.17)],.028,'graphite',10,3)
    accessories.box((3.17,side*2.82,4.20),(.12,.20,.41),'graphite')
    accessories.box((3.24,side*2.82,4.20),(.012,.17,.35),'chrome')
accessories.tube([(3.033,-1.45,3.59),(3.028,-1.12,3.90),(2.95,-1.63,4.35)],.012,'graphite',8,2)
accessories.box((1.98,-2.15,3.40),(.20,.05,.05),'graphite')
accessories.cylinder((1.35,-1.4,5.07),(1.35,-1.4,5.24),.09,'graphite',20)
accessories.cylinder((1.35,-1.4,5.24),(1.35,-1.4,5.39),.085,'amber',20)
accessories.cylinder((1.18,.15,3.05),(1.18,.15,4.95),.07,'graphite',20)
accessories.cylinder((1.18,.15,4.94),(1.18,.15,5.04),.10,'steel',20)
accessories.cylinder((1.1,-2.2,3.10),(1.1,-2.2,3.67),.105,'orange_dark',20)
accessories.box((1.1,-2.2,3.73),(.13,.15,.06),'graphite')
for x in [3.7,4.3]:
    accessories.box((x,0,5.35),(.23,.55,.12),'graphite')
    accessories.box((x+.12,0,5.34),(.015,.42,.07),'lens')
# Non-branded safety strips and chassis hardware.
for y in [-2.35,-1.9,1.9,2.35]:accessories.box((4.39,y,1.06),(.02,.16,.12),'warning')
for x in [-3.5,-2,-.5,1.0,2.5]:
    for y in [-.96,.96]:
        for z in [1.8,2.0]:bolt((x,y,z),(0,1 if y>0 else -1,0),.033)
root=bpy.data.objects.new('TRUCK_01 / detailed rigid mining truck',None);asset.objects.link(root)
root['asset_id']='TRUCK_01';root['asset_type']='mining_dump_truck';root['reference']='User-supplied visual reference; interpreted design, not manufacturer CAD.'
for p in parts:
    print('Finishing',p.name,flush=True)
    ob=p.finish();ob.parent=root;ob['asset_type']='truck_component'
# Set the lowest tyre lug on the ground while keeping all child transforms identity.
ground_offset=-min(v.co.z for ob in asset.objects if ob.type=='MESH' for v in ob.data.vertices)
for ob in asset.objects:
    if ob.type=='MESH':
        for v in ob.data.vertices:v.co.z+=ground_offset
report={'asset_id':'TRUCK_01','units':'metres','axis':'+X forward, Z up','tyres':6,'tread_lugs':1536,'parts':[]}
allpoints=[]
for ob in asset.objects:
    if ob.type!='MESH':continue
    bm=bmesh.new();bm.from_mesh(ob.data)
    bad=sum(not e.is_manifold for e in bm.edges);deg=sum(f.calc_area()<1e-10 for f in bm.faces);bm.free()
    ob.data.calc_loop_triangles();allpoints += [ob.matrix_world@v.co for v in ob.data.vertices]
    report['parts'].append({'name':ob.name,'triangles':len(ob.data.loop_triangles),'non_manifold_edges':bad,'degenerate_faces':deg})
report.update({k:sum(p[k] for p in report['parts']) for k in ['triangles','non_manifold_edges','degenerate_faces']})
report['bounds']={'min':[min(v[i] for v in allpoints) for i in range(3)],'max':[max(v[i] for v in allpoints) for i in range(3)]}
(OUT/'truck_validation.json').write_text(json.dumps(report,indent=2));print('REPORT',json.dumps(report),flush=True)
def aim(ob,p):ob.rotation_euler=(Vector(p)-ob.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('Truck Camera');cam=bpy.data.objects.new('Truck Camera',camdata);studio.objects.link(cam);scene.camera=cam
cam.location=(15,-19,11);aim(cam,(0,0,2.65));camdata.type='ORTHO';camdata.ortho_scale=12.8;camdata.clip_end=1000
def area(name,p,energy,size):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size
    ob=bpy.data.objects.new(name,d);studio.objects.link(ob);ob.location=p;aim(ob,(0,0,2.5))
area('Key',(5,-8,14),2300,8);area('Fill',(10,2,9),1600,7);area('Rim',(-7,7,12),2900,8)
world=bpy.data.worlds.new('Truck Neutral');scene.world=world;world.use_nodes=True
world.node_tree.nodes.get('Background').inputs[0].default_value=(.65,.68,.72,1)
world.node_tree.nodes.get('Background').inputs[1].default_value=.45
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True;scene.cycles.max_bounces=8
scene.render.film_transparent=True;scene.render.resolution_x=1400;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.view_settings.view_transform='AgX'
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':a.spaces.active.region_3d.view_perspective='CAMERA';a.spaces.active.shading.color_type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Truck_Detailed.blend'))
bpy.ops.object.select_all(action='DESELECT')
for ob in asset.objects:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'Truck_Detailed.glb'),export_format='GLB',use_selection=True,export_extras=True,export_tangents=False,export_cameras=False,export_lights=False)
scene.render.filepath=str(OUT/'Truck_Hero.png');bpy.ops.render.render(write_still=True)
print('DONE',flush=True)
