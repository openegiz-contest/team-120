"""Reproducible seamless quarry PBR textures; no external source images.

Run with Python, numpy, scipy and Pillow. Normal maps use OpenGL convention.
The existing model and its embedded textures are deliberately left intact.
"""
from pathlib import Path
import numpy as np
from scipy.ndimage import gaussian_filter, zoom
from scipy.spatial import cKDTree
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / 'dist/assets/surfaces'
OUT.mkdir(parents=True, exist_ok=True)
N = 1024
rng = np.random.default_rng(43017)
y, x = np.mgrid[0:N, 0:N] / N


def noise(cells):
    a = rng.random((cells, cells))
    # Periodic interpolation, including the interpolation neighbourhood.
    a = np.tile(a, (3, 3))
    return zoom(a, N / cells, order=3, mode='grid-wrap')[N:2*N, N:2*N]


def cells(count, warp=.012):
    points = rng.random((count, 2))
    q = np.stack([(x + warp * np.sin(y*8*np.pi)) % 1,
                  (y + warp * np.sin(x*6*np.pi)) % 1], axis=-1)
    d, idx = cKDTree(points, boxsize=1).query(q, k=2)
    return d[..., 1]-d[..., 0], idx[..., 0], d[..., 0]


def save(name, color, height, roughness, strength):
    dx = (np.roll(height, -1, 1)-np.roll(height, 1, 1))*strength
    # PNG rows increase downwards; OpenGL tangent-space +Y points upwards.
    dy = (np.roll(height, -1, 0)-np.roll(height, 1, 0))*strength
    normal = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    maps = {'albedo': color, 'normal': normal*.5+.5, 'roughness': roughness}
    for suffix, data in maps.items():
        im = Image.fromarray(np.uint8(np.clip(data, 0, 1)*255))
        im.save(OUT / f'{name}-{suffix}.png', optimize=True)


macro = noise(4)
medium = noise(16)
grain = noise(128)
fine = rng.random((N, N))
fracture, index, distance = cells(190)
face = rng.uniform(.74, 1.2, 190)[index]
joint = np.exp(-fracture*850)
lamina = np.sin((y*38 + .14*np.sin(x*6*np.pi) + medium*.35)*2*np.pi)
chips = np.exp(-np.abs(grain-.43)*45)
height = .23*medium + .16*face - .17*joint + .035*lamina + .035*grain + .014*fine
value = (.74+.28*medium+.14*grain)*face - .19*joint + .04*lamina - .025*chips
rust = np.clip((macro-.53)*2.3, 0, .55)
rock = np.array([.49,.46,.40])[None,None,:]*value[...,None]
rock += rust[...,None]*np.array([.085,.005,-.055])
save('rock', rock, height, .87+.1*grain, 12)

gaps, pebble_index, pebble_distance = cells(6500, .002)
pebble = rng.uniform(.65, 1.23, 6500)[pebble_index]
debris = np.clip(gaps*1000, 0, 1)
dust = gaussian_filter(noise(32), 2, mode='wrap')
value = (.78+.26*dust+.13*grain)*(.75+.25*pebble) - .09*(1-debris)
height = .07*debris+.045*pebble+.05*grain+.016*fine
save('gravel', np.array([.52,.47,.38])*value[...,None], height, .91+.08*grain, 8)

value = .87+.14*medium+.1*grain+.04*(fine-.5)-.035*(1-debris)
height = .018*debris+.018*grain+.008*fine
save('road', np.array([.56,.52,.44])*value[...,None], height, .92+.07*grain, 6)
print(f'Wrote 9 tileable PBR maps to {OUT}')
