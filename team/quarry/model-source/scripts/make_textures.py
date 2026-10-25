"""Deterministic, tileable PBR maps. No external or licensed source imagery."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

OUT = Path(__file__).resolve().parents[1] / 'textures'
OUT.mkdir(exist_ok=True)
N = 1024
rng = np.random.default_rng(22026)
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32) / N

def noise(size, seed):
    random = np.random.default_rng(seed)
    a = random.random((size, size)).astype(np.float32)
    # Wrap the coarse grid before interpolation so opposite texture edges match.
    a = np.tile(a, (3, 3))
    im = Image.fromarray(a, mode='F').resize((N*3, N*3), Image.Resampling.BICUBIC)
    return np.asarray(im)[N:2*N, N:2*N].copy()

fine = rng.random((N, N), dtype=np.float32)
n8, n32, n128 = noise(8, 7), noise(32, 9), noise(128, 12)
coarse = .50*n8 + .30*n32 + .20*n128
warp = .012*np.sin(xx*6*np.pi) + .006*np.sin(xx*18*np.pi)
bands = np.sin((yy+warp)*32*np.pi)
thin = np.maximum(0, np.sin((yy+warp)*90*np.pi))**16
cracks = (np.abs(np.sin(xx*27*np.pi + np.sin(yy*4*np.pi)*2)) < .028).astype(float)

def save_set(name, base, height, roughness, variation, strength=3.0):
    rgb = np.clip(np.asarray(base)[None,None,:]*variation[:,:,None], 0, 1)
    Image.fromarray(np.uint8(rgb*255), 'RGB').save(OUT/f'{name}_Albedo.png')
    dx = (np.roll(height,-1,1)-np.roll(height,1,1))*strength
    dy = (np.roll(height,-1,0)-np.roll(height,1,0))*strength
    normal = np.stack([-dx,-dy,np.ones_like(dx)], axis=-1)
    normal /= np.linalg.norm(normal,axis=-1,keepdims=True)
    Image.fromarray(np.uint8(np.clip(normal*.5+.5,0,1)*255), 'RGB').save(OUT/f'{name}_Normal.png')
    rough = np.clip(roughness+.13*(n128-.5)+.06*(fine-.5),0,1)
    Image.fromarray(np.uint8(rough*255),'L').save(OUT/f'{name}_Roughness.png')

rock_h = .43*coarse + .16*n128 + .05*fine + .065*bands - .09*thin - .10*cracks
rock_v = .80+.38*coarse+.11*bands-.09*thin-.08*cracks+.08*(fine-.5)
save_set('Sandstone',(.55,.44,.31),rock_h,.90,rock_v,4)
save_set('Granite',(.42,.43,.42),rock_h+.10*fine,.86,.76+.48*coarse+.13*(fine-.5)+.045*bands,4)
ore_v=.68+.50*coarse+.14*bands-.12*thin
save_set('Ore',(.29,.25,.21),rock_h,.84,ore_v,4)
gravel=.55*n128+.35*fine+.10*n32
save_set('Gravel',(.56,.51,.41),gravel,.95,.91+.15*coarse+.10*(fine-.5),1.6)
metal_h=.07*n128+.05*fine+.015*np.sin(xx*256*np.pi)
save_set('Steel',(.30,.36,.38),metal_h,.57,.90+.15*coarse+.10*(fine-.5),.7)
# A world-height stratigraphic texture prevents material stair-steps across ramp cuts.
# PNG row zero is the top; UV v=0 is the bottom of the 196 m soil section.
z=(1-yy)*196-28
palette=np.zeros((N,N,3),dtype=np.float32)
palette[:]=(.55,.44,.31)
palette[((z>52)&(z<92))|((z>139)&(z<150))]=(.42,.43,.42)
palette[((z%105>43)&(z%105<49))|((z>94)&(z<100))|((z>130)&(z<133))]=(.29,.25,.21)
palette[z<0]=(.25,.24,.22)
lamina=.06*np.sin(yy*360*np.pi + .6*np.sin(xx*6*np.pi))
geo_v=.94+.10*n128+.08*(fine-.5)+lamina
Image.fromarray(np.uint8(np.clip(palette*geo_v[:,:,None],0,1)*255),'RGB').save(OUT/'Geology_Albedo.png')
save_set('Geology_detail',(.5,.5,.5),rock_h,.90,np.ones_like(xx),3)
(OUT/'Geology_detail_Normal.png').replace(OUT/'Geology_Normal.png')
(OUT/'Geology_detail_Roughness.png').replace(OUT/'Geology_Roughness.png')
(OUT/'Geology_detail_Albedo.png').unlink()
print('Created 18 PBR maps in',OUT)
