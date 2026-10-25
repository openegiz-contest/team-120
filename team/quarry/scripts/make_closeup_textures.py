"""Seamless close-range surface detail: RG normal, B grain, A roughness.

Generated from periodic fields; no source photos or paid texture services.
"""
from pathlib import Path
import numpy as np
from scipy.ndimage import gaussian_filter
from PIL import Image

OUT=Path(__file__).resolve().parents[1]/'dist/assets/surfaces'
OUT.mkdir(parents=True,exist_ok=True)
N=1024


def create(kind,seed):
    rng=np.random.default_rng(seed)
    fields=[gaussian_filter(rng.normal(size=(N,N)),scale,mode='wrap') for scale in [.65,2,7,26]]
    fields=[a/max(float(a.std()),1e-8) for a in fields]
    grain=np.clip(.5+fields[0]*.11+fields[1]*.065,0,1)
    if kind=='rock':
        # Fine fracture networks and broken laminations, without polygon mosaics.
        fissure=np.exp(-np.abs(fields[2]+fields[3]*.3)*30)
        pores=np.maximum(0,fields[1]-1.5)
        height=fields[0]*.06+fields[1]*.13+fields[2]*.16-fissure*.23-pores*.08
        tone=np.clip(.5+fields[2]*.10+grain*.12-fissure*.17,0,1)
        strength=1.7
    else:
        grains=np.clip((fields[1]+.3)*1.2,0,1)
        height=fields[0]*.055+grains*.14+fields[2]*.045
        tone=np.clip(.5+fields[0]*.10+fields[1]*.065,0,1)
        strength=1.6
    dx=(np.roll(height,-1,1)-np.roll(height,1,1))*strength
    dy=(np.roll(height,-1,0)-np.roll(height,1,0))*strength
    normal=np.stack([-dx,dy,np.ones_like(dx)],axis=-1);normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    packed=np.stack([normal[:,:,0]*.5+.5,normal[:,:,1]*.5+.5,tone,np.clip(.87+grain*.12,0,1)],axis=-1)
    Image.fromarray(np.uint8(np.clip(packed,0,1)*255)).save(OUT/(kind+'-micro.png'),optimize=True)


create('rock',71051);create('soil',71052)
print('Created two 1024px closeup detail maps')
