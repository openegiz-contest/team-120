"""Normalize tangent vectors; use an orthogonal fallback for singular UVs."""
import struct,json,math,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
path=Path(sys.argv[1]) if len(sys.argv)>1 else root/'Quarry_WebGL.glb';data=bytearray(path.read_bytes())
jn=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+jn])
binstart=20+jn+8;seen=set();fixed=0
def access(index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    assert a['componentType']==5126
    size=4 if a['type']=='VEC4' else 3
    return binstart+v.get('byteOffset',0)+a.get('byteOffset',0),v.get('byteStride',size*4),a['count']
for mesh in doc['meshes']:
    for p in mesh['primitives']:
        ti=p['attributes'].get('TANGENT')
        if ti is None or ti in seen:continue
        seen.add(ti);start,stride,count=access(ti)
        ns,nstride,_=access(p['attributes']['NORMAL'])
        for i in range(count):
            off=start+stride*i;x,y,z,w=struct.unpack_from('<4f',data,off)
            length=math.sqrt(x*x+y*y+z*z)
            if abs(length-1)<1e-5:continue
            if length<1e-7:
                nx,ny,nz=struct.unpack_from('<3f',data,ns+nstride*i)
                x,y,z=(-ny,nx,0) if abs(nz)<.9 else (nz,0,-nx)
                length=math.sqrt(x*x+y*y+z*z)
            struct.pack_into('<4f',data,off,x/length,y/length,z/length,1 if w>=0 else -1)
            fixed+=1
path.write_bytes(data)
print('Repaired tangent vectors:',fixed)
