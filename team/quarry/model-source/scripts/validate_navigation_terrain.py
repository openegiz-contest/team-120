"""Offline checks of actual terrain triangles; no runtime navigation or game logic.

Run Blender --background --python this_file [-- --blend path | --glb path] [--output path].
The optional asset checks delivered geometry; route design comes from NPZ.
GLB seam welding affects topology indices only, never triangles used for ray tests.
"""
from pathlib import Path
import json, sys, hashlib
import numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'terrain'
data = np.load(OUT / 'terrain_mesh.npz')
design = json.loads((OUT / 'terrain_design.json').read_text())
source = OUT / 'terrain_mesh.npz'
output = Path(sys.argv[sys.argv.index('--output')+1]) if '--output' in sys.argv else OUT/'navigation_validation.json'
v, f = data['vertices'], data['faces']
road_indices = data['road_faces']
materials = data['materials']
if '--blend' in sys.argv or '--glb' in sys.argv:
    flag = '--glb' if '--glb' in sys.argv else '--blend'
    source = Path(sys.argv[sys.argv.index(flag) + 1])
    if flag == '--blend':bpy.ops.wm.open_mainfile(filepath=str(source))
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(source))
    ob = next(o for o in bpy.context.scene.objects if o.get('asset_id') == 'GEO_001')
    ob.data.calc_loop_triangles()
    v = np.array([ob.matrix_world @ vert.co for vert in ob.data.vertices])
    f = np.array([tuple(t.vertices) for t in ob.data.loop_triangles])
    canonical_materials = {}
    for i,mat in enumerate(ob.data.materials):
        name = mat.name
        if 'Navigation / compacted road' in name:canonical_materials[i]=2
        elif 'Navigation / earth berm' in name:canonical_materials[i]=3
        elif '04_Gravel' in name:canonical_materials[i]=0
        else:canonical_materials[i]=1
    assert 2 in canonical_materials.values(),'Compacted road material not found by name'
    materials = np.array([canonical_materials[ob.data.polygons[t.polygon_index].material_index] for t in ob.data.loop_triangles])
    road_indices = np.flatnonzero(materials==2)

topology_f = f
welded_count = 0
if '--glb' in sys.argv:
    kd = KDTree(len(v))
    for i,point in enumerate(v):kd.insert(Vector(point),i)
    kd.balance()
    representatives=np.arange(len(v))
    for i,point in enumerate(v):
        if representatives[i]!=i:continue
        for _,j,distance in kd.find_range(Vector(point),.0001):
            if j>i and representatives[j]==j:representatives[j]=i
    topology_f=representatives[f]
    welded_count=len(v)-len(np.unique(topology_f))

def components(faces):
    parent = np.arange(len(v))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for a,b,c in faces:
        pa = find(a)
        parent[find(b)] = pa
        parent[find(c)] = pa
    return len({find(x) for x in np.unique(faces)})

def face_edge_components(faces):
    parent = list(range(len(faces)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    owners = {}
    for i,face in enumerate(faces):
        for a,b in zip(face,np.roll(face,-1)):
            edge = tuple(sorted((int(a),int(b))))
            if edge in owners:parent[find(i)] = find(owners[edge])
            else:owners[edge] = i
    return len({find(i) for i in range(len(faces))})

edges = np.concatenate([topology_f[:,[0,1]],topology_f[:,[1,2]],topology_f[:,[2,0]]])
_, inv, count = np.unique(np.sort(edges,axis=1),axis=0,return_inverse=True,return_counts=True)
areas = np.linalg.norm(np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]]),axis=1)/2
winding = np.bincount(inv,weights=np.where(edges[:,0]<edges[:,1],1,-1))
topology = dict(vertices=len(v),triangles=len(f),connected_components=components(topology_f),
                topology_vertices_after_seam_weld=len(np.unique(topology_f)),
                uv_normal_seam_vertices_welded_for_topology_only=welded_count,
                topology_weld_tolerance_m=.0001 if '--glb' in sys.argv else 0,
                boundary_edges=int(sum(count==1)),non_manifold_edges=int(sum(count!=2)),
                inconsistent_winding_edges=int(sum(winding!=0)),
                degenerate_faces_below_1e_10_m2=int(sum(areas<1e-10)),
                minimum_face_area_m2=float(areas.min()))
bvh = BVHTree.FromPolygons(v.tolist(),f.tolist(),all_triangles=True,epsilon=0)
P, S = data['path'], data['station']
# Normals estimated from neighbouring supplied route samples, independent of generator.
derivative = np.gradient(P[:,:2],S,axis=0,edge_order=2)
derivative /= np.linalg.norm(derivative,axis=1)[:,None]
normals = np.c_[-derivative[:,1],derivative[:,0]]
left_edge = P[:,:2] + normals*data['half_left'][:,None]
right_edge = P[:,:2] - normals*data['half_right'][:,None]

def interpolate(array,station):
    if array.ndim==1:return np.interp(station,S,array)
    return np.array([np.interp(station,S,array[:,j]) for j in range(array.shape[1])]).T

def ray(point):
    hit, normal, index, distance = bvh.ray_cast(Vector((float(point[0]),float(point[1]),250)),Vector((0,0,-1)),300)
    return (None,None) if hit is None else (float(hit.z),int(index))

special = [b['station_m']+offset for b in design['passing_bays']
           for offset in [-57.5,-27.5,0,27.5,57.5]]
stations = np.unique(np.r_[S,(S[:-1]+S[1:])/2,special])
errors, misses, berm_hits, cross_slopes, non_road_hits = [], [], [], [], []
actual_center = []
for station in stations:
    a,b = interpolate(right_edge,station),interpolate(left_edge,station)
    z = float(interpolate(P[:,2],station))
    # Edges inset 2 cm: normal inference and floating-point ray-edge tolerance only.
    width = np.linalg.norm(b-a)
    cross_section_heights = []
    for q in np.linspace(.02/width,1-.02/width,int(np.ceil(width/1.0))+1):
        point = a*(1-q)+b*q
        measured,fi = ray(point)
        if measured is None:misses.append([float(station),float(q)])
        else:
            cross_section_heights.append(measured)
            # Exact terminal section shares the level loading-floor face boundary.
            endpoint_floor = abs(station-S[-1])<.001 and materials[fi]==0 and abs(measured)<.0002
            if materials[fi] != 2 and not endpoint_floor:
                non_road_hits.append([float(station),float(q),int(materials[fi])])
            error = abs(measured-z)
            errors.append(error)
            if error>.02:berm_hits.append([float(station),float(q),error])
    if len(cross_section_heights)>1:
        cross_slopes.append((max(cross_section_heights)-min(cross_section_heights))/(width-.04)*100)
    measured,_ = ray(interpolate(P[:,:2],station))
    actual_center.append(measured if measured is not None else float('nan'))
actual_center = np.array(actual_center)
ds = np.diff(stations)
actual_grades = np.diff(actual_center)/ds
expected_grades = np.diff(interpolate(P[:,2],stations))/ds
widths = data['half_left']+data['half_right']

def flat_rectangle(corners,spacing):
    lo,hi=np.array(corners)
    xx=np.linspace(lo[0],hi[0],int(np.ceil((hi[0]-lo[0])/spacing))+1)
    yy=np.linspace(lo[1],hi[1],int(np.ceil((hi[1]-lo[1])/spacing))+1)
    errors=[];misses=0
    for x in xx:
        for y in yy:
            z,_=ray((x,y))
            if z is None:misses+=1
            else:errors.append(abs(z-lo[2]))
    return dict(samples=len(xx)*len(yy),missed_rays=misses,max_height_error_m=max(errors,default=None),
                passed=misses==0 and max(errors,default=1)<.0002)

bay_reports=[]
for bay in design['passing_bays']:
    station=bay['station_m'];center=interpolate(P[:,:2],station)
    tangent=interpolate(derivative,station);tangent/=np.linalg.norm(tangent)
    normal=np.array([-tangent[1],tangent[0]])
    # Parked 5.84 m wide x 9.5 m long truck centred in the 10 m extra bay strip.
    truck_center=center-9.5*normal
    footprint=[];max_error=0.;fits=True;footprint_rays_on_road=True;contact_samples=[]
    for along in np.linspace(-4.75,4.75,11):
        for across in np.linspace(-2.92,2.92,7):
            point=truck_center+along*tangent+across*normal
            # Compare actual hit to nearest projected polyline road elevation.
            segment=P[1:,:2]-P[:-1,:2]
            frac=np.clip(np.sum((point-P[:-1,:2])*segment,axis=1)/np.sum(segment**2,axis=1),0,1)
            closest=P[:-1,:2]+frac[:,None]*segment
            ix=np.linalg.norm(closest-point,axis=1).argmin()
            local_s=S[ix]+frac[ix]*(S[ix+1]-S[ix])
            lateral=float(np.dot(point-closest[ix],interpolate(normals,local_s)))
            width_right=float(interpolate(data['half_right'],local_s))
            fits &= (-width_right+.05<=lateral<=float(interpolate(data['half_left'],local_s))-.05)
            z,face_index=ray(point)
            footprint_rays_on_road &= z is not None and materials[face_index]==2
            if z is not None:contact_samples.append([along,across,z])
            error=1e9 if z is None else abs(z-float(interpolate(P[:,2],local_s)))
            max_error=max(max_error,error)
            if abs(along)==4.75 and abs(across)==2.92:footprint.append([*point,float(z or 0)])
    contact_samples=np.array(contact_samples)
    plane_matrix=np.c_[contact_samples[:,:2],np.ones(len(contact_samples))]
    plane=np.linalg.lstsq(plane_matrix,contact_samples[:,2],rcond=None)[0]
    plane_error=float(np.max(abs(plane_matrix@plane-contact_samples[:,2])))
    bay_reports.append(dict(id=bay['id'],clear_width_at_center_m=float(interpolate(widths,station)),
                            minimum_design_width_over_55m_plateau_m=float(np.min(interpolate(widths,np.linspace(station-27.5,station+27.5,57)))),
                            full_width_length_m=bay['full_width_length_m'],taper_length_each_m=bay['taper_each_end_m'],
                            static_truck_footprint_m=[9.5,5.84],footprint_inside_clear_lane=bool(fits),
                            footprint_max_elevation_difference_from_nearest_polyline_projection_m=max_error,
                            footprint_rays_all_on_clear_road=bool(footprint_rays_on_road),
                            footprint_max_best_fit_plane_error_m=plane_error,
                            footprint_fitted_longitudinal_grade_percent=float(plane[0]*100),
                            footprint_fitted_cross_grade_percent=float(plane[1]*100),
                            footprint_plane_residual_tolerance_m=.03,
                            static_rectangle_fits=bool(fits and footprint_rays_on_road and plane_error<.03),
                            footprint_corners_blender_m=footprint))

floor=flat_rectangle(design['floor_clear_rectangle_blender_m'],3)
crusher=flat_rectangle(design['crusher_platform_blender_m'],3)
endpoints={}
for key,station,elevation in [('upper',S[0],168),('lower',S[-1],0)]:
    point=interpolate(P[:,:2],station);z,_=ray(point)
    endpoints[key]=dict(actual_elevation_m=z,design_elevation_m=elevation,
                         endpoint_error_m=None if z is None else abs(z-elevation))
road=dict(sampled_cross_sections=len(stations),surface_ray_samples=len(errors)+len(misses),
          maximum_station_spacing_m=float(np.diff(stations).max()),cross_section_spacing_m=1.,
          edge_sampling_inset_m=.02,missed_rays=len(misses),maximum_surface_height_error_m=max(errors),
          samples_exceeding_2cm=len(berm_hits),first_failures=berm_hits[:20],
          road_footprint_samples_on_nonroad_material=len(non_road_hits),first_nonroad_hits=non_road_hits[:10],
          minimum_design_clear_width_m=float(widths.min()),
          max_sampled_centerline_grade_percent=float(np.nanmax(abs(actual_grades))*100),
          maximum_cross_section_height_range_over_width_percent=max(cross_slopes),
          max_grade_error_percentage_points=float(np.nanmax(abs(actual_grades-expected_grades))*100),
          max_neighbor_grade_change_percentage_points=float(np.nanmax(abs(np.diff(actual_grades)))*100),
          road_material_connected_components=face_edge_components(topology_f[road_indices]),endpoints=endpoints)
checks=dict(connected_watertight=topology['connected_components']==1 and topology['non_manifold_edges']==0,
            no_degenerate_faces=topology['degenerate_faces_below_1e_10_m2']==0,
            consistent_face_winding=topology['inconsistent_winding_edges']==0,
            continuous_road_surface=not misses and max(errors)<.02,
            road_grade_below_7_percent=road['max_sampled_centerline_grade_percent']<7,
            smooth_grade_changes=road['max_neighbor_grade_change_percentage_points']<.5,
            connected_road_face_subset=road['road_material_connected_components']==1,
            no_berm_in_sampled_clear_lane=not non_road_hits,
            clear_lane_at_least_9m=widths.min()>=9-1e-6,
            all_eight_bays_fit_static_truck=len(bay_reports)==8 and all(b['static_rectangle_fits'] for b in bay_reports),
            floor_flat=floor['passed'],crusher_platform_flat=crusher['passed'],
            endpoints_flush=all(e['endpoint_error_m'] is not None and e['endpoint_error_m']<.0002 for e in endpoints.values()))
report=dict(passed=all(checks.values()),checks=checks,source=str(source),
            source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),topology=topology,road=road,
            passing_bays=bay_reports,floor=floor,crusher_platform=crusher,
            limitations=['Synthetic design, not surveyed site geometry or certified mine-road engineering.',
                        'Static truck rectangles checked; dynamic swept paths, steering and traffic logic are not implemented.',
                        'Static 9.5m x 5.84m truck footprint plane residual tolerance is 3cm; road surface versus design remains limited to 2cm.',
                        'Road surface sampled at <=1.5m longitudinal and <=1m lateral intervals, with additional bay taper boundary stations.',
                        'Road normals independently estimated from supplied route points; 2cm edge inset avoids ray-on-edge ambiguity.'])
def native(value):
    if isinstance(value,np.generic):return value.item()
    raise TypeError(type(value).__name__)
output.write_text(json.dumps(report,indent=2,default=native))
print(json.dumps(dict(passed=report['passed'],checks=checks,topology=topology,road=road,floor=floor,crusher=crusher),indent=2,default=native))
