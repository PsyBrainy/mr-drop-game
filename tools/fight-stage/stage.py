"""Escenario 'Terraza': azotea flotante de noche sobre una ciudad.

Genera cuatro PNG:
  terraza_cielo_960x540.png      cielo en espacio de pantalla (fijo)
  terraza_lejos_1400x460.png     skyline lejano (parallax 0.25), pixel de arte = 2 px de mundo
  terraza_medio_1700x560.png     edificios cercanos (parallax 0.5), pixel de arte = 1 px de mundo
  terraza_plataforma_1180x470.png la azotea jugable, 2 px de textura por px de mundo (como los peleadores)

Las medidas de mundo de cada capa van en fightStage.config.ts; si se cambian acá,
se cambian allá (el test cruza los PNG contra el config).
"""
import math
import os
import sys
import numpy as np
from PIL import Image, ImageDraw

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', 'assets-src')
os.makedirs(OUT, exist_ok=True)
rng = np.random.RandomState(7)

OUTLINE = (18, 12, 26)
RED, YEL, GRN = (214, 52, 44), (244, 196, 44), (44, 170, 80)


def up(im, k):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


def lerpc(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


# ------------------------------------------------------------------ cielo
def sky():
    W, H = 480, 270  # arte; se escala 2x a 960x540
    stops = [(0.0, (12, 10, 30)), (0.45, (30, 20, 60)), (0.75, (70, 34, 88)), (1.0, (122, 56, 96))]
    arr = np.zeros((H, W, 3), np.uint8)
    for y in range(H):
        t = y / (H - 1)
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t0 <= t <= t1:
                c = lerpc(c0, c1, (t - t0) / (t1 - t0))
        # bandas (dithering ordenado entre banda y banda, estilo pixel art)
        arr[y, :] = c
    # dither: en cada límite de 6 filas alterna píxeles con la fila anterior
    for y in range(6, H, 6):
        prev = arr[y - 3].copy()
        arr[y, ::2] = prev[::2]
    # cuantizar el degradé en escalones
    arr = (arr // 6) * 6
    im = Image.fromarray(arr, 'RGB').convert('RGBA')
    d = ImageDraw.Draw(im)
    # estrellas
    for _ in range(140):
        x, y = rng.randint(0, W), rng.randint(0, int(H * 0.7))
        b = rng.randint(140, 255)
        d.point((x, y), fill=(b, b, min(255, b + 20)))
        if rng.rand() < 0.08:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                d.point((x + dx, y + dy), fill=(b // 2, b // 2, b // 2 + 30))
    # luna con halo
    mx, my, r = 380, 52, 17
    for rr, col in ((r + 12, (46, 36, 82)), (r + 7, (62, 50, 104)), (r + 3, (90, 80, 130))):
        d.ellipse((mx - rr, my - rr, mx + rr, my + rr), fill=col)
    d.ellipse((mx - r, my - r, mx + r, my + r), fill=(236, 230, 206))
    d.ellipse((mx - r + 6, my - r + 2, mx + r, my + r - 2), fill=(250, 246, 226))
    for cx, cy, cr in ((mx - 6, my - 4, 3), (mx + 4, my + 6, 4), (mx - 2, my + 9, 2), (mx + 7, my - 7, 2)):
        d.ellipse((cx - cr, cy - cr, cx + cr, cy + cr), fill=(214, 206, 180))
    # nubes finitas cruzando la luna
    for cy, x0, x1 in ((58, 330, 440), (64, 350, 470), (140, 40, 180), (148, 60, 150), (120, 250, 330)):
        d.line((x0, cy, x1, cy), fill=(84, 60, 112))
        d.line((x0 + 10, cy + 1, x1 - 14, cy + 1), fill=(70, 48, 100))
    return up(im, 2)


# ------------------------------------------------------------------ helpers de edificios
def window_grid(d, x0, y0, x1, y1, lit_p, lit_cols, dark, wx=2, wy=3, gx=2, gy=3, seed=0):
    r = np.random.RandomState(abs(seed) % (2**32))
    y = y0
    while y + wy <= y1:
        x = x0
        while x + wx <= x1:
            if r.rand() < lit_p:
                c = lit_cols[r.randint(len(lit_cols))]
            else:
                c = dark
            d.rectangle((x, y, x + wx - 1, y + wy - 1), fill=c)
            x += wx + gx
        y += wy + gy


def far_layer():
    W, H = 700, 230  # arte, cada píxel = 2 px de mundo (textura 1400x460)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    body, rim = (40, 32, 72), (56, 46, 94)
    x = 0
    r = np.random.RandomState(3)
    while x < W:
        w = r.randint(18, 46)
        h = r.randint(60, 170)
        top = H - h
        d.rectangle((x, top, x + w, H), fill=body)
        d.line((x, top, x, H), fill=rim)
        # remates: antena, escalonado, tanque
        k = r.rand()
        if k < 0.3:
            ax = x + w // 2
            d.line((ax, top - 14, ax, top), fill=body)
            d.point((ax, top - 15), fill=(230, 60, 60))
        elif k < 0.55:
            d.rectangle((x + 4, top - 8, x + w - 4, top), fill=body)
        elif k < 0.7:
            d.rectangle((x + w // 2 - 4, top - 10, x + w // 2 + 4, top - 3), fill=body)
            d.line((x + w // 2 - 3, top - 3, x + w // 2 - 3, top), fill=body)
            d.line((x + w // 2 + 3, top - 3, x + w // 2 + 3, top), fill=body)
        window_grid(d, x + 3, top + 5, x + w - 2, H - 4, 0.12,
                    [(150, 120, 80), (110, 100, 150), (170, 140, 90)], (34, 28, 62), 1, 2, 2, 3, seed=int(x))
        x += w + r.randint(-4, 3)
    # neblina baja: las últimas filas más claras (la luz de la calle)
    arr = np.array(im)
    for i in range(40):
        y = H - 40 + i
        t = i / 40
        m = arr[y, :, 3] > 0
        arr[y, m, :3] = (arr[y, m, :3] * (1 - t * 0.5) + np.array([90, 50, 90]) * t * 0.5).astype(np.uint8)
    return up(Image.fromarray(arr), 2)


def leaf_points(cx, cy, s):
    """Hoja de cannabis de 7 folíolos, como lista de polígonos (arte chico)."""
    polys = []
    for ang, L in ((-90, 1.0), (-55, 0.85), (-125, 0.85), (-20, 0.62), (-160, 0.62), (15, 0.38), (-195, 0.38)):
        a = math.radians(ang)
        tip = (cx + math.cos(a) * s * L, cy + math.sin(a) * s * L)
        n = (-math.sin(a), math.cos(a))
        w = s * 0.14 * (0.6 + L * 0.4)
        mid = (cx + math.cos(a) * s * L * 0.5, cy + math.sin(a) * s * L * 0.5)
        polys.append([(cx, cy), (mid[0] + n[0] * w, mid[1] + n[1] * w), tip,
                      (mid[0] - n[0] * w, mid[1] - n[1] * w)])
    return polys


def mid_layer():
    W, H = 1700, 560  # arte = mundo
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = np.random.RandomState(11)
    lit = [(255, 206, 110), (246, 170, 84), (255, 226, 150), (120, 220, 210)]
    # patas del cartel de neón: se dibujan antes que los edificios, que las tapan abajo
    for px in (1230 + 20, 1230 + 100):
        d.rectangle((px - 2, 244, px + 2, H), fill=(28, 22, 40))
        for yy in range(250, H, 16):
            d.line((px - 2, yy, px + 2, yy + 8), fill=(40, 32, 56))
    x = -10
    i = 0
    while x < W:
        w = r.randint(90, 190)
        h = r.randint(170, 330)
        top = H - h
        body = [(52, 44, 90), (60, 48, 98), (48, 42, 84), (66, 50, 92)][i % 4]
        shade = tuple(int(c * 0.78) for c in body)
        d.rectangle((x, top, x + w, H), fill=body)
        # borde de luz de luna a la izquierda, sombra a la derecha
        d.rectangle((x, top, x + 2, H), fill=tuple(min(255, c + 24) for c in body))
        d.rectangle((x + w - 6, top, x + w, H), fill=shade)
        # cornisa
        d.rectangle((x - 3, top, x + w + 3, top + 4), fill=tuple(min(255, c + 16) for c in body))
        d.line((x - 3, top + 5, x + w + 3, top + 5), fill=OUTLINE)
        # ventanas
        window_grid(d, x + 10, top + 16, x + w - 12, H - 10, 0.26, lit, (30, 26, 54), 6, 9, 7, 9, seed=int(x) + 5)
        # escalera de incendio en algunos
        if i % 3 == 1:
            fx = x + w // 2 - 20
            for fy in range(top + 40, H - 20, 38):
                d.rectangle((fx, fy, fx + 40, fy + 2), fill=(26, 22, 44))
                for bx in range(fx, fx + 41, 5):
                    d.line((bx, fy - 8, bx, fy), fill=(26, 22, 44))
                d.line((fx, fy - 8, fx + 40, fy - 8), fill=(26, 22, 44))
                d.line((fx + 34, fy + 2, fx + 6, fy + 36), fill=(26, 22, 44))
        # remate: tanque de agua de madera
        if i % 4 == 0:
            tx = x + w // 3
            tw, th = 34, 30
            ty = top - 16 - th
            for lx in (tx + 4, tx + tw - 5):
                d.line((lx, ty + th, lx - 3, top), fill=(34, 26, 40), width=2)
            d.line((tx + 4, ty + th + 8, tx + tw - 5, ty + th + 2), fill=(34, 26, 40))
            d.rectangle((tx, ty, tx + tw, ty + th), fill=(92, 60, 58))
            for sx in range(tx + 3, tx + tw, 5):
                d.line((sx, ty, sx, ty + th), fill=(76, 48, 50))
            for by in (ty + 7, ty + th - 7):
                d.line((tx, by, tx + tw, by), fill=(40, 30, 40))
            d.polygon([(tx - 2, ty), (tx + tw // 2, ty - 12), (tx + tw + 2, ty)], fill=(70, 46, 50))
            d.polygon([(tx - 2, ty), (tx + tw // 2, ty - 12), (tx + tw + 2, ty)], outline=OUTLINE)
            d.rectangle((tx, ty, tx + tw, ty + th), outline=OUTLINE)
        elif i % 4 == 2:
            ax = x + w - 30
            d.line((ax, top - 60, ax, top), fill=(30, 26, 48), width=2)
            for k in range(3):
                d.line((ax - 10 + k * 3, top - 50 + k * 14, ax + 10 - k * 3, top - 50 + k * 14), fill=(30, 26, 48))
            d.rectangle((ax - 1, top - 63, ax + 1, top - 61), fill=(240, 60, 60))
        x += w + r.randint(4, 30)
        i += 1

    # letrero de neón con la hoja y la franja rasta, en el edificio del centro
    sx, sy = 1230, 170
    d.rectangle((sx - 4, sy - 4, sx + 124, sy + 74), fill=(22, 16, 30))
    d.rectangle((sx - 4, sy - 4, sx + 124, sy + 74), outline=(60, 50, 80))
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    for poly in leaf_points(sx + 32, sy + 58, 44):
        g.polygon(poly, outline=(90, 255, 140))
    g.line((sx + 32, sy + 58, sx + 32, sy + 70), fill=(90, 255, 140), width=2)
    for k, col in enumerate(((255, 80, 70), (255, 220, 70), (80, 240, 120))):
        g.rectangle((sx + 70, sy + 12 + k * 18, sx + 116, sy + 12 + k * 18 + 8), outline=col)
        g.rectangle((sx + 72, sy + 14 + k * 18, sx + 114, sy + 18 + k * 18), fill=tuple(c // 2 for c in col))
    # halo del neón: dilatación suave pintada debajo
    ga = np.array(glow)
    halo = np.zeros_like(ga)
    m = ga[..., 3] > 0
    for dx in range(-3, 4):
        for dy in range(-3, 4):
            if dx * dx + dy * dy > 9:
                continue
            sh = np.roll(np.roll(m, dy, 0), dx, 1)
            halo[sh & ~m] = [120, 60, 140, 90]
    arr = np.array(im).astype(float)
    arr[..., :3] *= 0.85
    im = Image.fromarray(arr.astype(np.uint8))
    base = Image.alpha_composite(im, Image.fromarray(halo))
    base = Image.alpha_composite(base, glow)
    return base


# ------------------------------------------------------------------ la plataforma
# Mundo: el piso va de x 200 a 760 y de y 420 a 560. La textura cubre de x 185 a
# 775 y de y 350 a 585, a 2 px de textura por px de mundo.
PL_X0, PL_Y0, PL_W, PL_H = 185, 350, 590, 235


def platform():
    W, H = PL_W, PL_H
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    gx0, gx1 = 200 - PL_X0, 760 - PL_X0          # 15 .. 575
    top, bot = 420 - PL_Y0, 560 - PL_Y0          # 70 .. 210

    # --- postes y guirnalda de luces rasta, atrás de todo
    for px in (gx0 + 18, gx1 - 18):
        d.rectangle((px - 1, top - 62, px + 1, top), fill=(40, 34, 52))
        d.point((px, top - 63), fill=(70, 60, 90))
    a, b = (gx0 + 18, top - 58), (gx1 - 18, top - 58)
    pts = []
    for k in range(0, 101):
        t = k / 100
        x = a[0] + (b[0] - a[0]) * t
        y = a[1] + math.sin(t * math.pi) * 22
        pts.append((x, y))
    d.line(pts, fill=(26, 22, 36))
    cols = [RED, YEL, GRN]
    for k in range(1, 26):
        x, y = pts[k * 4]
        c = cols[k % 3]
        d.rectangle((x - 1, y + 1, x + 1, y + 3), fill=c)
        d.point((x, y + 1), fill=tuple(min(255, v + 60) for v in c))

    # --- macetas y equipo de música en las puntas (decorado, no colisiona)
    # maceta con planta a la izquierda
    mx = gx0 + 36
    d.polygon([(mx - 9, top - 12), (mx + 9, top - 12), (mx + 7, top), (mx - 7, top)], fill=(150, 72, 44), outline=OUTLINE)
    d.line((mx - 9, top - 10, mx + 9, top - 10), fill=(180, 96, 60))
    for ang in (-90, -60, -120, -35, -145):
        for poly in leaf_points(mx + math.cos(math.radians(ang)) * 10, top - 14 + math.sin(math.radians(ang)) * 12, 9):
            d.polygon(poly, fill=(52, 150, 70))
    d.line((mx, top - 13, mx, top - 26), fill=(40, 110, 50))
    # parlante a la derecha
    sx = gx1 - 44
    d.rectangle((sx, top - 22, sx + 16, top), fill=(34, 30, 40), outline=OUTLINE)
    for cy, rr in ((top - 15, 4), (top - 6, 3)):
        d.ellipse((sx + 8 - rr, cy - rr, sx + 8 + rr, cy + rr), fill=(70, 64, 80), outline=(20, 18, 24))
    d.line((sx + 2, top - 20, sx + 14, top - 20), fill=YEL)
    # un balde / silla plegable
    cx = gx1 - 70
    d.rectangle((cx, top - 9, cx + 10, top), fill=(70, 120, 150), outline=OUTLINE)

    # --- el bloque de la azotea
    wall = (116, 64, 58)
    d.rectangle((gx0, top, gx1, bot), fill=wall)
    # ladrillos
    arr = np.array(im)
    for y in range(top + 8, bot):
        row = (y - top - 8) // 5
        for x in range(gx0, gx1 + 1):
            off = 0 if row % 2 == 0 else 6
            if (y - top - 8) % 5 == 4 or (x + off - gx0) % 12 == 0:
                arr[y, x, :3] = (78, 40, 42)
            else:
                v = ((x + off - gx0) // 12 * 7 + row * 13) % 5
                arr[y, x, :3] = [(116, 64, 58), (124, 70, 60), (108, 58, 54), (130, 76, 64), (112, 62, 56)][v]
    im = Image.fromarray(arr)
    d = ImageDraw.Draw(im)
    # sombra bajo la cornisa y oscurecido hacia abajo
    arr = np.array(im).astype(float)
    for y in range(top, bot + 1):
        t = (y - top) / (bot - top)
        arr[y, gx0:gx1 + 1, :3] *= 1 - 0.35 * t
    for y in range(top + 8, top + 13):
        arr[y, gx0:gx1 + 1, :3] *= 0.7
    im = Image.fromarray(arr.astype(np.uint8))
    d = ImageDraw.Draw(im)

    # cornisa de cemento: esta línea ES el piso (y = 420)
    d.rectangle((gx0 - 3, top, gx1 + 3, top + 7), fill=(150, 146, 160))
    d.line((gx0 - 3, top, gx1 + 3, top), fill=(206, 204, 214))
    d.line((gx0 - 3, top + 1, gx1 + 3, top + 1), fill=(180, 178, 190))
    d.line((gx0 - 3, top + 7, gx1 + 3, top + 7), fill=(92, 88, 104))
    for x in range(gx0 + 20, gx1, 40):
        d.line((x, top + 2, x, top + 6), fill=(118, 114, 130))

    # ventanas tapiadas y una iluminada
    for k, wx in enumerate((gx0 + 70, gx0 + 180, gx1 - 190, gx1 - 80)):
        wy = top + 34
        lit = k == 2
        d.rectangle((wx - 3, wy - 3, wx + 27, wy + 37), fill=(90, 84, 96))
        d.rectangle((wx, wy, wx + 24, wy + 34), fill=(255, 196, 110) if lit else (34, 30, 48))
        d.line((wx + 12, wy, wx + 12, wy + 34), fill=(90, 84, 96))
        d.line((wx, wy + 17, wx + 24, wy + 17), fill=(90, 84, 96))
        if lit:
            d.rectangle((wx + 2, wy + 2, wx + 10, wy + 15), fill=(255, 224, 160))
        d.rectangle((wx - 3, wy - 3, wx + 27, wy + 37), outline=OUTLINE)
        d.line((wx - 5, wy + 38, wx + 29, wy + 38), fill=(150, 146, 160))

    # graffiti en el medio: hoja grande con contorno y burbujas rasta
    cx, cy = (gx0 + gx1) // 2, top + 72
    gra = Image.new('RGBA', im.size, (0, 0, 0, 0))
    g = ImageDraw.Draw(gra)
    for rr, col in ((34, (20, 16, 24)), (31, (250, 250, 240))):
        pass
    # tres burbujas de fondo: rojo, amarillo, verde
    for k, (col, ox) in enumerate(((RED, -58), (YEL, 0), (GRN, 58))):
        g.ellipse((cx + ox - 30, cy - 22, cx + ox + 30, cy + 26), fill=OUTLINE)
        g.ellipse((cx + ox - 27, cy - 19, cx + ox + 27, cy + 23), fill=col)
        g.ellipse((cx + ox - 20, cy - 14, cx + ox + 2, cy - 4), fill=tuple(min(255, v + 50) for v in col))
    for poly in leaf_points(cx, cy + 22, 50):
        g.polygon([(p[0] + 1, p[1] + 2) for p in poly], fill=OUTLINE)
    for poly in leaf_points(cx, cy + 22, 47):
        g.polygon(poly, fill=(30, 110, 50))
    g.line((cx, cy + 22, cx, cy + 36), fill=(30, 110, 50), width=3)
    # goteo de pintura
    for ox, L in ((-70, 10), (-40, 16), (22, 8), (64, 14), (80, 6)):
        col = RED if ox < -30 else (YEL if ox < 40 else GRN)
        g.line((cx + ox, cy + 20, cx + ox, cy + 20 + L), fill=col, width=2)
    # el graffiti hereda un poco el oscurecido de la pared
    ga = np.array(gra).astype(float)
    ga[..., :3] *= 0.88
    im = Image.alpha_composite(im, Image.fromarray(ga.astype(np.uint8)))
    d = ImageDraw.Draw(im)

    # los costados: caño de desagüe (se lee como "de acá te podés agarrar")
    for px in (gx0 + 3, gx1 - 3):
        d.rectangle((px - 3, top + 8, px + 3, bot), fill=(84, 96, 104))
        d.line((px - 2, top + 8, px - 2, bot), fill=(130, 146, 156))
        d.line((px + 3, top + 8, px + 3, bot), fill=(50, 58, 66))
        for by in range(top + 24, bot, 30):
            d.rectangle((px - 4, by, px + 4, by + 2), fill=(60, 70, 78))
    # contorno exterior del bloque
    d.line((gx0, top + 8, gx0, bot), fill=OUTLINE)
    d.line((gx1, top + 8, gx1, bot), fill=OUTLINE)

    # abajo: la losa rota, con cables y fierros colgando
    r = np.random.RandomState(5)
    y = bot
    pts = [(gx0, bot)]
    for x in range(gx0, gx1 + 1, 6):
        pts.append((x, bot + r.randint(0, 9)))
    pts.append((gx1, bot))
    d.polygon(pts, fill=(64, 38, 40))
    d.line(pts, fill=OUTLINE)
    d.rectangle((gx0, bot - 3, gx1, bot), fill=(92, 88, 104))
    for x0 in range(gx0 + 40, gx1 - 20, 70):
        L = r.randint(8, 22)
        d.line((x0, bot + 4, x0 + r.randint(-4, 5), bot + 4 + L), fill=(40, 36, 44), width=2)
        if r.rand() < 0.5:
            d.line((x0 + 8, bot + 4, x0 + 10, bot + 10), fill=(120, 110, 100))

    # contorno del cielo arriba de la cornisa, para que el borde del piso lea fuerte
    d.line((gx0 - 4, top - 1, gx1 + 4, top - 1), fill=OUTLINE)
    return up(im, 2)


# ------------------------------------------------------------------ plataforma flotante
# Mundo: 120 px de piso. La textura suma 4 px de cada lado (los soportes) y
# abajo la luz rasta que tira hacia el vacío. 2 px de textura por px de mundo.
SOFT_W, SOFT_H, SOFT_INSET, SOFT_TOP = 128, 30, 4, 3


def soft_platform():
    W, H = SOFT_W, SOFT_H
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x0, x1 = SOFT_INSET, W - SOFT_INSET - 1
    top = SOFT_TOP
    # halo de la tira de luz, abajo: bandas cada vez más transparentes
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    for i, a in enumerate((70, 45, 25, 12)):
        y = top + 11 + i * 3
        for k, col in enumerate((RED, YEL, GRN)):
            seg0 = x0 + 6 + k * (x1 - x0 - 12) // 3
            seg1 = x0 + 6 + (k + 1) * (x1 - x0 - 12) // 3
            g.rectangle((seg0 + i * 2, y, seg1 - i * 2, y + 2), fill=col + (a,))
    im = Image.alpha_composite(im, glow)
    d = ImageDraw.Draw(im)
    # cuerpo: una pasarela de chapa con borde de cemento, como la cornisa
    d.rectangle((x0, top, x1, top + 8), fill=(70, 74, 92))
    d.rectangle((x0, top, x1, top + 2), fill=(150, 146, 160))
    d.line((x0, top, x1, top), fill=(206, 204, 214))
    # rejilla
    for x in range(x0 + 3, x1 - 2, 4):
        d.line((x, top + 4, x + 2, top + 7), fill=(48, 50, 64))
    # tira de LEDs rasta debajo
    for k, col in enumerate((RED, YEL, GRN)):
        seg0 = x0 + 6 + k * (x1 - x0 - 12) // 3
        seg1 = x0 + 6 + (k + 1) * (x1 - x0 - 12) // 3
        d.rectangle((seg0, top + 9, seg1 - 1, top + 10), fill=col)
        for x in range(seg0 + 1, seg1 - 1, 3):
            d.point((x, top + 9), fill=tuple(min(255, v + 70) for v in col))
    # soportes / tornillos en las puntas
    for x in (x0, x1 - 3):
        d.rectangle((x, top - 1, x + 3, top + 9), fill=(110, 114, 130))
        d.point((x + 1, top + 2), fill=(40, 40, 50))
    # contorno
    d.rectangle((x0 - 1, top - 1, x1 + 1, top + 11), outline=OUTLINE)
    return up(im, 2)


if __name__ == '__main__':
    sky().save(os.path.join(OUT, 'terraza_cielo_960x540.png'), optimize=True)
    far_layer().save(os.path.join(OUT, 'terraza_lejos_1400x460.png'), optimize=True)
    mid_layer().save(os.path.join(OUT, 'terraza_medio_1700x560.png'), optimize=True)
    platform().save(os.path.join(OUT, 'terraza_plataforma_1180x470.png'), optimize=True)
    soft_platform().save(os.path.join(OUT, 'terraza_flotante_256x60.png'), optimize=True)
    print('ok')
