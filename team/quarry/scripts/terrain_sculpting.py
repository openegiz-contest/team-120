"""Deterministic cliff shelves and a water-cut ravine outside gameplay bounds."""
import numpy as np


def smooth(value):
    value = np.clip(value, 0, 1)
    return value * value * (3 - 2 * value)


def river_x(z):
    return -1160 + 62 * np.sin((z - 830) / 235)


def sculpt_relief(x, z, height, kind, noise):
    # Keep every surface in the manual-driving rectangle exactly as supplied.
    clearance = np.hypot(np.maximum(0, np.abs(x) - 910),
                         np.maximum(0, np.abs(z) - 810))
    influence = smooth(clearance / 165)
    scale = 1 if kind == 'altai' else .74
    massifs = [(-1410, -1440, 1130, 710, 760, -.35),
               (1280, -1740, 1080, 640, 820, .45),
               (-2050, -250, 880, 690, 620, -.65),
               (-1330, 230, 390, 430, 540, .1)]
    bedrock = np.maximum(0, height - 168)
    for cx, cz, peak, rx, rz, angle in massifs:
        dx, dz = x - cx, z - cz
        u = (dx * np.cos(angle) + dz * np.sin(angle)) / rx
        v = (-dx * np.sin(angle) + dz * np.cos(angle)) / rz
        # Intersecting planes produce angular buttresses rather than round cones.
        radius = np.maximum(np.abs(u) * .94 + np.abs(v) * .29,
                            np.abs(u) * .35 + np.abs(v) * .92)
        radius += noise(x, z, 105, 76) * .08
        shelves = (.16 * smooth((1 - radius) / .23)
                   + .24 * smooth((.79 - radius) / .11)
                   + .24 * smooth((.58 - radius) / .065)
                   + .20 * smooth((.40 - radius) / .07)
                   + .16 * np.clip((.25 - radius) / .25, 0, 1))
        joints = (.5 + .5 * np.sin(u * 61 + v * 17
                                   + noise(x, z, 160, 32) * 2)) ** 12
        cuts = joints * .075 * smooth(shelves * 3)
        massif = np.maximum(0, shelves - cuts) * peak * scale
        bedrock = np.maximum(bedrock, massif)
    # Regional strata form benches with steep risers and broken green shelves.
    band_height = 82 if kind == 'altai' else 61
    bands = bedrock / band_height
    terraced = (np.floor(bands) + smooth((bands % 1 - .29) / .24)) * band_height
    strength = .43 * smooth((bedrock - 110) / 350)
    fractured = bedrock * (1 - strength) + terraced * strength
    fractured += noise(x, z, 42, 48) * 12 * smooth(bedrock / 400)
    result = height * (1 - influence) + (168 + fractured) * influence

    # A narrow river cuts the western rock shelf, then drops to the existing lake.
    cross = np.abs(x - river_x(z))
    along = smooth((z + 710) / 100) * (1 - smooth((z - 780) / 100))
    channel = (1 - smooth((cross - 9) / 66)) * along * influence
    level = 330 - .03 * (z + 650) - 150 * smooth((z - 315) / 30)
    bank = level - 2 + 30 * smooth((cross - 7) / 39)
    bank += noise(x, z, 28, 84) * 5 * smooth(cross / 32)
    result = result * (1 - channel) + bank * channel
    return result


def watercourse_profile(xs, zs, height, sample):
    rows = []
    for z in np.linspace(-610, 830, 481):
        x = float(river_x(z))
        y = max(147.14, sample(xs, zs, height, x, float(z)) + .9)
        rows.append([x, y, float(z), 7.5 + 2 * np.sin(z / 83) ** 2])
    return {'points': rows, 'name': 'Western ravine', 'decorative': True}
