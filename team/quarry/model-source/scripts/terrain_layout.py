"""Constrained terrain surface: road, bays and benches share the same vertices.
Run with .terrain-env/bin/python. No movement, routing AI or game state.
"""
from pathlib import Path
import json, math, csv
import numpy as np
from scipy.interpolate import CubicSpline
from scipy.spatial import cKDTree
from shapely.geometry import Polygon, LineString, MultiLineString
from shapely.ops import unary_union
import shapely, triangle
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'terrain';OUT.mkdir(exist_ok=True)
RX,RY,CY,TOP,BASE=430.,330.,-20.,168.,-28.
def shape(t):return 1+.025*np.sin(3*t+.3)+.014*np.sin(7*t)+.008*np.sin(13*t+1)
def xy(r,t):return np.stack([r*RX*shape(t)*np.cos(t),CY+r*RY*shape(t)*np.sin(t)],axis=-1)
def smooth(x):x=np.clip(x,0,1);return x*x*(3-2*x)
t=np.linspace(0,1,1401);angle=.12+1.85*2*np.pi*t
original=xy(1.06-.82*t,angle);delta=np.gradient(original,axis=0)
norm=np.stack([-delta[:,1],delta[:,0]],axis=1);norm/=np.linalg.norm(norm,axis=1)[:,None]
shifted=original-4.4*norm
old_s=np.r_[0,np.cumsum(np.linalg.norm(np.diff(shifted,axis=0),axis=1))]
L=old_s[-1];cs=CubicSpline(old_s,shifted,axis=0)
bay_stations=np.linspace(370,L-340,8)
critical=np.array([c+d for c in bay_stations for d in [-57.5,-27.5,0,27.5,57.5]])
s=np.unique(np.r_[np.arange(0,L,3),critical,45,145,L-215,L-75,L]);P=cs(s);D=cs(s,1);D/=np.linalg.norm(D,axis=1)[:,None]
N=np.stack([-D[:,1],D[:,0]],axis=1)
# C1 vertical easing into the upper platform and the loading floor.
weight=smooth((s-45)/100)*smooth((L-75-s)/140)
integral=np.r_[0,np.cumsum((weight[1:]+weight[:-1])/2*np.diff(s))]
Z=TOP*(1-integral/integral[-1]);grade=-TOP*weight/integral[-1]
extra=np.zeros_like(s)
for c in bay_stations:
    extra=np.maximum(extra,10*smooth((57.5-np.abs(s-c))/30))
left=np.full_like(s,4.5);right=4.5+extra
fade=smooth((s-60)/55)*smooth((L-100-s)/65)
offsets=np.stack([-right-3.5,-right-2.4,-right-.8,-right,np.zeros_like(s),left,left+.8,left+2.4,left+3.5],axis=1)
heights=Z[:,None]+fade[:,None]*np.array([0,1.4,1.4,0,0,0,1.4,1.4,0])[None,:]
grid=P[:,None,:]+offsets[:,:,None]*N[:,None,:]
corridor=Polygon(np.r_[grid[:,0],grid[::-1,-1]])
lane=Polygon(np.r_[grid[:,3],grid[::-1,5]])
transition_right=P-(right+15.5)[:,None]*N
transition_left=P+(left+15.5)[:,None]*N
transition_area=Polygon(np.r_[transition_right,transition_left[::-1]])
assert corridor.is_valid and lane.is_valid,'Road offsets overlap'
tree=cKDTree(P)
def nearest(points):
    _,idx=tree.query(points,k=5);choices=np.clip(np.c_[idx,idx-1],0,len(P)-2)
    a=P[choices];v=P[choices+1]-a;u=np.clip(np.sum((points[:,None,:]-a)*v,axis=2)/np.sum(v*v,axis=2),0,1)
    foot=a+u[:,:,None]*v;dist=np.sum((points[:,None,:]-foot)**2,axis=2);k=dist.argmin(axis=1)
    seg=choices[np.arange(len(points)),k];f=u[np.arange(len(points)),k];foot=foot[np.arange(len(points)),k]
    tangent=(P[seg+1]-P[seg]);tangent/=np.linalg.norm(tangent,axis=1)[:,None]
    signed=np.sum((points-foot)*np.stack([-tangent[:,1],tangent[:,0]],axis=1),axis=1)
    station=s[seg]+f*(s[seg+1]-s[seg]);return station,signed
def baseline(points):
    theta=np.arctan2((points[:,1]-CY)/RY,points[:,0]/RX)
    r=np.sqrt((points[:,0]/RX)**2+((points[:,1]-CY)/RY)**2)/shape(theta)
    q=np.clip((r*r-.24**2)/(1.015**2-.24**2)*7,0,7)
    k=np.floor(q);f=q-k;return 24*(k+np.clip((f-.78)/.22,0,1))
def surface_z(points):
    z=baseline(points);station,d=nearest(points);rz=np.interp(station,s,Z)
    rr=np.interp(station,s,right);ff=np.interp(station,s,fade)
    edge=np.where(d<0,-d-rr,d-4.5)
    inside=shapely.covers(corridor.buffer(.004),shapely.points(points))
    transition=shapely.covers(transition_area,shapely.points(points))
    blend=smooth((edge-3.5)/12)
    z[transition]=rz[transition]*(1-blend[transition])+z[transition]*blend[transition]
    berm=np.interp(edge,[0,.8,2.4,3.5],[0,1.4,1.4,0])*ff
    z[inside]=rz[inside]+berm[inside]
    return z
lines=[]
# All longitudinal edges and cross sections are hard triangulation constraints.
for j in range(grid.shape[1]):lines.append(LineString(grid[:,j]))
for row in grid:lines.append(LineString(row))
lines.extend([LineString(transition_right),LineString(transition_left)])
theta=np.linspace(0,2*np.pi,385)
for k in range(7):
    for q in [k+.78,k+1]:
        radius=math.sqrt(.24**2+q/7*(1.015**2-.24**2))
        clipped=LineString(xy(radius,theta)).difference(transition_area)
        if not clipped.is_empty:lines.append(clipped)
# The original crusher access remains on level plateau and joins the broad entrance.
access=np.array([[235,365],[340,365],[397,340],[440,285],[465,220],[475,115],P[0]])
access_area=LineString(access).buffer(12.5,join_style='round')
entrance=Polygon([(438,-21),(493,-21),(493,72),(438,72)])
platform=unary_union([access_area,entrance])
lines.append(platform.boundary.difference(corridor))
outline=Polygon([(-500,-420),(500,-420),(500,420),(-500,420)])
lines.append(outline.boundary)
# Snap intersections to a 2 mm construction grid before triangulation. This avoids
# microscopic constraint slivers and remains far below the road design tolerance.
noded=shapely.union_all([shapely.set_precision(line,.002) for line in lines],grid_size=.002);coords=[];segments=[];indices={}
def index(p):
    key=(round(p[0],7),round(p[1],7))
    if key not in indices:indices[key]=len(coords);coords.append(key)
    return indices[key]
def add_lines(g):
    if g.geom_type=='LineString':
        points=list(g.coords)
        for a,b in zip(points,points[1:]):
            ia,ib=index(a),index(b)
            if ia!=ib:segments.append((ia,ib))
    elif hasattr(g,'geoms'):
        for sub in g.geoms:add_lines(sub)
add_lines(noded)
print('Triangulating',len(coords),'constrained vertices',flush=True)
mesh=triangle.triangulate({'vertices':np.array(coords),'segments':np.array(segments)},'pa70')
V=mesh['vertices'];F=mesh['triangles'];z=surface_z(V)
# Interpolate every road/berm vertex from its constrained design cell. Orthogonal
# nearest-centreline projection drifts at wide curved bays, so it is unsuitable here.
snapped=np.round(grid/.002)*.002
reference_xy=[];reference_z=[]
for i in range(len(s)-1):
    for j in range(grid.shape[1]-1):
        for ij in [[(i,j),(i+1,j),(i+1,j+1)],[(i,j),(i+1,j+1),(i,j+1)]]:
            reference_xy.append([snapped[a,b] for a,b in ij]);reference_z.append([heights[a,b] for a,b in ij])
reference_xy=np.array(reference_xy);reference_z=np.array(reference_z)
refs=shapely.polygons(reference_xy);ref_tree=shapely.STRtree(refs)
hits=ref_tree.query(shapely.points(V),predicate='intersects')
unique,first=np.unique(hits[0],return_index=True);tri=hits[1,first]
a=reference_xy[tri,0];b=reference_xy[tri,1]-a;c=reference_xy[tri,2]-a;p=V[unique]-a
det=b[:,0]*c[:,1]-b[:,1]*c[:,0]
u=(p[:,0]*c[:,1]-p[:,1]*c[:,0])/det;v=(b[:,0]*p[:,1]-b[:,1]*p[:,0])/det
z[unique]=reference_z[tri,0]*(1-u-v)+reference_z[tri,1]*u+reference_z[tri,2]*v
centers=V[F].mean(axis=1);st,lat=nearest(centers)
inlane=shapely.covers(lane,shapely.points(centers))
inplatform=shapely.covers(platform,shapely.points(centers))
incorridor=shapely.covers(corridor,shapely.points(centers))
dz=np.ptp(z[F],axis=1)
# material slots: gravel, geology, clean road, safety berm, deep stratum.
materials=np.where(dz>.5,1,0);materials[incorridor]=3;materials[inlane|inplatform]=2
verts=np.column_stack([V,z]).tolist();faces=F.tolist();mids=materials.tolist()
# Extract the outer boundary from triangulation: no mismatched seams on the block.
edge_counts={}
for tri in F:
    for a,b in zip(tri,np.roll(tri,-1)):
        key=tuple(sorted((int(a),int(b))));edge_counts[key]=edge_counts.get(key,0)+1
boundary=[e for e,c in edge_counts.items() if c==1]
assert boundary and all(abs(abs(V[a,0])-500)<1e-4 or abs(abs(V[a,1])-420)<1e-4 for a,b in boundary)
levels=[150,139,133,130,100,94,49,44,0,-28];rings={}
for a,b in boundary:
    assert abs(z[a]-168)<1e-6 and abs(z[b]-168)<1e-6
    pa,pb=a,b
    for height in levels:
        pair=[]
        for j in [a,b]:
            key=(j,height)
            if key not in rings:rings[key]=len(verts);verts.append([*V[j],height])
            pair.append(rings[key])
        na,nb=pair;faces.extend([[pa,pb,nb],[pa,nb,na]]);mids.extend([1,1]);pa,pb=na,nb
bottom=len(verts);verts.append([0,0,BASE])
for a,b in boundary:faces.append([bottom,rings[(a,BASE)],rings[(b,BASE)]]);mids.append(4)
np.savez_compressed(OUT/'terrain_mesh.npz',vertices=np.array(verts),faces=np.array(faces),materials=np.array(mids),surface_faces=len(F),road_faces=np.flatnonzero(inlane),path=np.c_[P,Z],station=s,half_left=left,half_right=right,grade=grade)
with (OUT/'haul_route.csv').open('w') as fp:
    writer=csv.writer(fp);writer.writerow(['station_m','x_m','y_m','z_m','gltf_x_m','gltf_y_m','gltf_z_m','clear_width_m','grade_percent'])
    for station,p,zv,l,r,g in zip(s,P,Z,left,right,grade):writer.writerow([round(station,5),*np.round([*p,zv,p[0],zv,-p[1],l+r,g*100],6)])
d1,d2=cs(s,1),cs(s,2)
curvature=np.abs(d1[:,0]*d2[:,1]-d1[:,1]*d2[:,0])/np.linalg.norm(d1,axis=1)**3
bays=[]
for i,c in enumerate(bay_stations):
    points=[]
    for ss,off in [(c-27.5,-14.5),(c+27.5,-14.5),(c+27.5,4.5),(c-27.5,4.5)]:
        tangent=cs(ss,1);tangent/=np.linalg.norm(tangent);p=cs(ss)+off*np.array([-tangent[1],tangent[0]])
        points.append([*p,float(np.interp(ss,s,Z))])
    bays.append({'id':f'BAY_{i+1:02d}','station_m':float(c),'clear_width_m':19,'full_width_length_m':55,'taper_each_end_m':30,'boundary_blender_m':points})
report={'road_length_m':float(L),'lane_clear_width_m':9,'max_grade_percent':float(np.abs(grade).max()*100),'minimum_centerline_radius_m':float(1/curvature[3:-3].max()),'passing_bays':bays,'top_elevation_m':168,'floor_elevation_m':0,'bench_height_m':24,'bench_intervals':7,'floor_clear_rectangle_blender_m':[[-90,-65,0],[50,45,0]],'crusher_platform_blender_m':[[10,321,168],[320,409,168]],'continuous_surface':True,'game_logic':False,'triangles':len(faces),'surface_triangles':len(F),'construction':'Single constrained terrain mesh; road and earth safety berms share vertex indices with terrain.'}
(OUT/'terrain_design.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:v for k,v in report.items() if k!='passing_bays'}),flush=True)
