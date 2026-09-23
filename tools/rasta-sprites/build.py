import json, os
from anims import *

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets-src')
os.makedirs(OUT, exist_ok=True)
F = W * SCALE  # 192


def ko_frame(P, t, ang):
    im = render(P, t)
    if ang:
        c = (OX * SCALE, (OY - 30) * SCALE)
        im = im.rotate(ang, resample=Image.NEAREST, center=c)
    return im


def render_all():
    A, T = {}, {}
    A['idle'] = [render(P, t) for P, t in idle()]
    A['walk'] = [render(P, t) for P, t in walk()]
    A['air'] = [render(P, t) for P, t in air()]
    A['land'] = [render(P, t) for P, t in land()]
    for name, fn in [('light_ground', light_ground), ('light_air', light_air), ('heavy', heavy),
                     ('dodge', dodge)]:
        poses, table = fn()
        A[name] = [render(P, t) for P, t in poses]
        T[name] = table
    A['wall'] = [render(P, t) for P, t in wall()]
    A['hurt'] = [render(P, t) for P, t in hurt()]
    A['ko'] = [ko_frame(P, t, a) for P, t, a in ko()]
    return A, T


use_palette('rasta')
ANIMS, TABLES = render_all()


def sheet(frames):
    n = len(frames)
    cols = min(n, 10)
    rows = (n + 9) // 10
    s = Image.new('RGBA', (cols * F, rows * F), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        s.alpha_composite(f, ((i % 10) * F, (i // 10) * F))
    return s, cols, rows


manifest = {}
for variant in PALETTES:
    use_palette(variant)
    A, _ = render_all()
    for name, frames in A.items():
        s, cols, rows = sheet(frames)
        fname = f'{variant}_{name}_{len(frames)}x{rows}_{F}.png'
        s.save(os.path.join(OUT, fname), optimize=True)
        if variant != 'rasta':
            continue
        # caja del alfa de toda la hoja, medida frame por frame (en px de la hoja, 2x)
        bxs = [f.getbbox() for f in frames]
        x0 = min(b[0] for b in bxs); y0 = min(b[1] for b in bxs)
        x1 = max(b[2] for b in bxs); y1 = max(b[3] for b in bxs)
        manifest[name] = dict(file=fname, frames=len(frames), cols=cols, rows=rows, frameSize=F,
                              contentLeft=x0, contentTop=y0, contentWidth=x1 - x0,
                              contentHeight=y1 - y0, feetY=OY * SCALE, originX=OX * SCALE,
                              perFrame=[list(b) for b in bxs])
        if name in TABLES:
            manifest[name]['poseByFrame'] = TABLES[name]
use_palette('rasta')
json.dump(manifest, open(os.path.join(OUT, 'rasta.manifest.json'), 'w'), indent=1)
print({k: v['file'] for k, v in manifest.items()})
