"""Losslessly repack embedded PNGs to stay within the hosted asset size limit."""
import io,json,struct
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
path=root/'Quarry_WebGL.glb';data=path.read_bytes()
n=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+n])
binary=bytearray(data[20+n+8:]);saved=0;done=set()
for image in doc.get('images',[]):
    if image.get('mimeType')!='image/png':continue
    index=image['bufferView']
    if index in done:continue
    done.add(index);view=doc['bufferViews'][index]
    offset=view.get('byteOffset',0);size=view['byteLength']
    original=Image.open(io.BytesIO(binary[offset:offset+size]));output=io.BytesIO()
    original.save(output,format='PNG',optimize=True,compress_level=9)
    packed=output.getvalue()
    if len(packed)>=size:continue
    check=Image.open(io.BytesIO(packed))
    assert check.mode==original.mode and check.size==original.size and check.tobytes()==original.tobytes()
    binary[offset:offset+len(packed)]=packed
    view['byteLength']=len(packed);saved+=size-len(packed)
metadata=json.dumps(doc,separators=(',',':')).encode();metadata+=b' '*((-len(metadata))%4)
blob=struct.pack('<III',0x46546c67,2,28+len(metadata)+len(binary))+struct.pack('<II',len(metadata),0x4e4f534a)+metadata+struct.pack('<II',len(binary),0x004e4942)+binary
path.write_bytes(blob)
print('Lossless PNG bytes saved on next GLB repack:',saved)
