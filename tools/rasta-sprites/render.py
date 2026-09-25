"""Renderer procedural de pixel art para el peleador rasta.

Cada pose es un esqueleto (cadera, pecho, cabeza, manos, pies) en coordenadas del
juego: x hacia adelante, y hacia arriba, origen en los pies (centro). El dibujo se
hace a 1 px de arte = 1 px de juego y después se escala 2x con vecino más cercano,
así que el alcance que se mide en el dibujo nativo es el alcance en el juego.
"""
import math
import numpy as np
from PIL import Image, ImageDraw

W = H = 96          # frame nativo (192 al escalar 2x)
OX, OY = 34, 90     # origen (pies) dentro del frame nativo
# Se exporta a 1 px de arte = 1 px de hoja. Antes se escalaba 2x acá, y eso
# cuadruplicaba la VRAM sin sumar un solo detalle: el juego dibuja con filtro
# "nearest" (`crisp: true`), así que agrandar en la GPU da los mismos píxeles.
# Ver docs/pelea/memoria.md, fase A0.
SCALE = 1

THIGH, SHIN = 11.0, 10.5
UARM, FARM = 8.5, 8.5

C = {
    'out': (26, 16, 28),
    'skin': (140, 88, 56), 'skin_s': (104, 62, 38), 'skin_l': (172, 114, 76),
    'skinB': (112, 68, 42), 'skinB_s': (84, 48, 30), 'skinB_l': (136, 86, 54),
    'gi': (240, 236, 226), 'gi_s': (196, 188, 172), 'gi_l': (255, 255, 255),
    'giB': (200, 192, 178), 'giB_s': (160, 150, 136), 'giB_l': (220, 214, 202),
    'red': (214, 52, 44), 'yel': (244, 196, 44), 'grn': (44, 156, 70),
    'glove': (214, 54, 46), 'glove_s': (150, 32, 30), 'glove_l': (248, 112, 96),
    'gloveB': (170, 40, 36), 'gloveB_s': (118, 24, 24), 'gloveB_l': (206, 80, 70),
    'boot': (120, 74, 42), 'boot_s': (84, 50, 28), 'boot_l': (152, 100, 60),
    'bootB': (94, 58, 32), 'bootB_s': (66, 40, 22), 'bootB_l': (120, 76, 44),
    'dread': (66, 42, 26), 'dread_s': (44, 28, 18), 'dread_l': (104, 70, 42),
    'beard': (40, 26, 18),
    'ink': (38, 44, 72), 'inkB': (34, 36, 56),
    'eye_w': (250, 246, 236), 'eye': (20, 14, 16),
    'paper': (246, 242, 226), 'paper_s': (206, 198, 176),
    'ember': (255, 120, 30), 'ember_hot': (255, 220, 70), 'ash': (120, 120, 120),
    'smoke': (214, 220, 222), 'smoke_s': (170, 178, 182),
    'fx': (255, 255, 255), 'fx_s': (255, 226, 120),
}

# --------------------------------------------------------------- geometría
yy, xx = np.mgrid[0:H, 0:W]
PX = xx + 0.5
PY = yy + 0.5


def cv(p):
    """Coordenadas del juego -> canvas nativo (float)."""
    return (OX + p[0], OY - p[1])


def m_capsule(a, b, r):
    ax, ay = cv(a)
    bx, by = cv(b)
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    if L2 == 0:
        t = np.zeros_like(PX)
    else:
        t = np.clip(((PX - ax) * dx + (PY - ay) * dy) / L2, 0, 1)
    qx, qy = ax + t * dx, ay + t * dy
    return (PX - qx) ** 2 + (PY - qy) ** 2 <= r * r


def m_ellipse(c, rx, ry, ang=0.0):
    cx, cy = cv(c)
    a = math.radians(ang)
    ca, sa = math.cos(a), math.sin(a)
    X, Y = PX - cx, PY - cy
    u = X * ca - Y * sa
    v = X * sa + Y * ca
    return (u / rx) ** 2 + (v / ry) ** 2 <= 1.0


def m_poly(pts):
    im = Image.new('L', (W, H), 0)
    ImageDraw.Draw(im).polygon([cv(p) for p in pts], fill=1)
    return np.array(im, dtype=bool)


def shift(m, dx, dy):
    """m desplazado: out[y,x] = m[y+dy, x+dx] (False fuera)."""
    out = np.zeros_like(m)
    ys = slice(max(0, -dy), H - max(0, dy))
    xs = slice(max(0, -dx), W - max(0, dx))
    yd = slice(max(0, dy), H - max(0, -dy))
    xd = slice(max(0, dx), W - max(0, -dx))
    out[ys, xs] = m[yd, xd]
    return out


def dilate4(m):
    return m | shift(m, 1, 0) | shift(m, -1, 0) | shift(m, 0, 1) | shift(m, 0, -1)


def add(p, q, k=1.0):
    return (p[0] + q[0] * k, p[1] + q[1] * k)


def sub(p, q):
    return (p[0] - q[0], p[1] - q[1])


def lerp(p, q, t):
    return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)


def norm(v):
    L = math.hypot(*v) or 1.0
    return (v[0] / L, v[1] / L)


def ik(root, target, l1, l2, bend):
    """Dos huesos. bend=+1 dobla hacia la izquierda del vector root->target."""
    d = sub(target, root)
    D = math.hypot(*d)
    D = min(max(D, 1e-3), l1 + l2 - 1e-3)
    u = norm(d)
    target = add(root, u, D)
    a = (l1 * l1 - l2 * l2 + D * D) / (2 * D)
    h = math.sqrt(max(l1 * l1 - a * a, 0))
    base = add(root, u, a)
    perp = (-u[1] * bend, u[0] * bend)
    return add(base, perp, h), target


# --------------------------------------------------------------- canvas
class Canvas:
    def __init__(self):
        self.rgb = np.zeros((H, W, 3), np.uint8)
        self.a = np.zeros((H, W), bool)

    def fill(self, m, col):
        self.rgb[m] = col
        self.a |= m

    def part(self, m, base, shade=None, light=None, outline=True, deep=False):
        if outline:
            self.fill(dilate4(m) & ~m, C['out'])
        self.fill(m, C[base])
        if shade:
            s = m & (~shift(m, 1, 1) | ~shift(m, 0, 2))
            if deep:
                s |= m & ~shift(m, 2, 2)
            self.fill(s, C[shade])
        if light:
            l = m & ~shift(m, -1, -1) & shift(m, 1, 1) & shift(m, 0, 2)
            self.fill(l, C[light])

    def px(self, p, col, raw=False):
        if raw:
            x, y = int(p[0]), int(p[1])
        else:
            x, y = cv(p)
            x, y = int(math.floor(x)), int(math.floor(y))
        if 0 <= x < W and 0 <= y < H:
            self.rgb[y, x] = C[col] if isinstance(col, str) else col
            self.a[y, x] = True

    def image(self):
        arr = np.zeros((H, W, 4), np.uint8)
        arr[..., :3] = self.rgb
        arr[..., 3] = self.a * 255
        im = Image.fromarray(arr, 'RGBA')
        return im.resize((W * SCALE, H * SCALE), Image.NEAREST)


# --------------------------------------------------------------- partes
def draw_dreads(cv_, P):
    """Rastas: 5 mechones que salen de la nuca y caen según P['hair'] (grados,
    0 = colgando, + = hacia atrás, 90 = horizontales hacia atrás) y 'hair_len'."""
    head = P['head']
    ang = P.get('hair', 28)
    L = P.get('hair_len', 1.0)
    wave = P.get('hair_wave', 0.0)
    roots = [(-6.5, 2.5), (-7.2, 0.8), (-7, -1), (-6.5, -2.5), (-5.5, -3.8), (-4, -5)]
    lens = [15, 19, 21, 20, 17, 13]
    m = np.zeros((H, W), bool)
    tips = []
    for i, (rx, ry) in enumerate(roots):
        a = math.radians(ang + (i - 2.5) * 8)
        p0 = add(head, (rx, ry))
        seg = lens[i] * L / 3
        pts = [p0]
        cur = p0
        for k in range(3):
            aa = a + math.radians(wave * (k + 1) * (1 if i % 2 else -1) * 0.7)
            d = (-math.sin(aa), -math.cos(aa))
            cur = add(cur, d, seg)
            pts.append(cur)
        for k in range(3):
            m |= m_capsule(pts[k], pts[k + 1], 1.7 - 0.2 * k)
        tips.append(pts)
    cv_.part(m, 'dread', 'dread_s')
    # textura: anillos más claros cada ~3 px a lo largo de cada rasta
    for pts in tips:
        for k in range(3):
            a_, b_ = pts[k], pts[k + 1]
            n = int(math.hypot(*sub(b_, a_)))
            for j in range(1, n, 3):
                cv_.px(lerp(a_, b_, j / max(n, 1)), 'dread_l')
    # puntas con cuentas rasta
    for i, pts in enumerate(tips):
        cv_.px(pts[-1], ['red', 'yel', 'grn', 'red', 'yel', 'grn'][i])


def limb_mask(a, j, b, r1, r2):
    return m_capsule(a, j, r1) | m_capsule(j, b, r2)


def draw_arm(cv_, shoulder, hand, bend, back, tattoo, glove_r=3.6, fist='fist'):
    elbow, hand = ik(shoulder, hand, UARM, FARM, bend)
    sk = 'skinB' if back else 'skin'
    m = limb_mask(shoulder, elbow, hand, 2.6, 2.3)
    cv_.part(m, sk, sk + '_s', sk + '_l')
    ink = 'inkB' if back else 'ink'
    if tattoo:
        # banda tribal en el brazo: dos anillos + puntos en el antebrazo
        for t in (0.45, 0.62):
            c = lerp(shoulder, elbow, t)
            u = norm(sub(elbow, shoulder))
            pp = (-u[1], u[0])
            for s in (-2, -1, 0, 1, 2):
                cv_.px(add(c, pp, s * 0.9), ink)
        for t in (0.3, 0.55):
            c = lerp(elbow, hand, t)
            u = norm(sub(hand, elbow))
            pp = (-u[1], u[0])
            cv_.px(add(c, pp, 0.8), ink)
            cv_.px(add(c, pp, -0.8), ink)
        cv_.px(lerp(elbow, hand, 0.42), ink)
    g = 'gloveB' if back else 'glove'
    u = norm(sub(hand, elbow))
    gc = add(hand, u, 1.2)
    gm = m_ellipse(gc, glove_r, glove_r * 0.95)
    # puño del guante (muñequera blanca)
    cuff = m_capsule(add(hand, u, -1.8), add(hand, u, -0.6), 2.4)
    cv_.part(cuff, 'giB' if back else 'gi', 'giB_s' if back else 'gi_s')
    cv_.part(gm, g, g + '_s', g + '_l')
    # línea del pulgar
    pp = (-u[1], u[0])
    cv_.px(add(add(gc, u, 0.5), pp, -1.2), g + '_s')
    cv_.px(add(add(gc, u, -0.5), pp, -1.2), g + '_s')
    return elbow, hand, gc


def draw_leg(cv_, hip, foot, back, bend=-1, toe=0.0):
    knee, ankle = ik(hip, foot, THIGH, SHIN, bend)
    g = 'giB' if back else 'gi'
    m = m_capsule(hip, knee, 4.4) | m_capsule(knee, ankle, 3.9)
    cv_.part(m, g, g + '_s', g + '_l', deep=True)
    # pliegue en la rodilla
    cv_.px(add(knee, (-1, 0)), g + '_s')
    cv_.px(add(knee, (0, -1)), g + '_s')
    # bota
    b = 'bootB' if back else 'boot'
    a = math.radians(toe)
    fwd = (math.cos(a), math.sin(a))
    up = (-fwd[1], fwd[0])
    heel = add(ankle, fwd, -3)
    tip = add(ankle, fwd, 6)
    pts = [add(heel, up, 3), add(add(ankle, fwd, 2), up, 2.5), add(tip, up, 0.5),
           add(tip, up, -3.5), add(heel, up, -3.5)]
    bm = m_poly(pts) | m_capsule(add(ankle, up, 1), add(ankle, up, -2), 3.2)
    cv_.part(bm, b, b + '_s', b + '_l')
    # suela
    for t in np.linspace(0, 1, 10):
        cv_.px(add(lerp(heel, tip, t), up, -3.2), b + '_s')
    return knee, ankle


def draw_torso(cv_, hip, chest, P):
    spine = norm(sub(chest, hip))
    perp = (spine[1], -spine[0])  # hacia adelante (derecha) cuando está derecho
    sh_f, sh_b = add(chest, perp, 6.5), add(chest, perp, -6.5)
    hp_f, hp_b = add(hip, perp, 5.5), add(hip, perp, -5.5)
    m = m_poly([add(sh_b, spine, 1.5), add(sh_f, spine, 1.5), add(hp_f, spine, -1), add(hp_b, spine, -1)])
    m |= m_capsule(sh_b, sh_f, 3)
    m |= m_capsule(hp_b, hp_f, 2.5)
    cv_.part(m, 'gi', 'gi_s', 'gi_l', deep=True)
    # abertura en V: se ve el pecho con el tatuaje (una hoja)
    neck = add(add(chest, spine, 2.5), perp, 1.5)
    vb = add(lerp(chest, hip, 0.55), perp, 1.0)
    v = m_poly([add(neck, perp, -3), add(neck, perp, 3.5), vb])
    cv_.part(v, 'skin', 'skin_s', outline=False)
    # solapas del gi
    for t in np.linspace(0, 1, 9):
        cv_.px(lerp(add(neck, perp, -3.5), vb, t), 'gi_s')
        cv_.px(lerp(add(neck, perp, 4), add(vb, perp, 0.6), t), 'gi_s')
    leaf = add(lerp(chest, hip, 0.25), perp, 1.5)
    for d in [(0, 0), (-1, 1), (1, 1), (0, 1), (0, 2), (-1, -1), (1, -1), (0, -1)]:
        cv_.px(add(leaf, (d[0], d[1] * 0.9)), 'ink')
    return sh_f, sh_b, hp_f, hp_b, perp, spine


def draw_belt(cv_, hip, perp, spine):
    hp_f, hp_b = add(hip, perp, 6.0), add(hip, perp, -6.0)
    for i, col in enumerate(['red', 'yel', 'grn']):
        a = add(hp_b, spine, 2.4 - i * 1.0)
        b = add(hp_f, spine, 2.4 - i * 1.0)
        for t in np.linspace(0, 1, 30):
            cv_.px(lerp(a, b, t), col)
    for i in (-1, 3.4):
        for t in np.linspace(0, 1, 30):
            cv_.px(lerp(add(hp_b, spine, i), add(hp_f, spine, i), t), 'out')


def draw_belt_knot(cv_, hip, perp, spine, sway=0):
    k = add(add(hip, perp, 3), spine, 1.3)
    km = m_ellipse(k, 1.6, 1.6)
    cv_.part(km, 'red', outline=True)
    for i, col in enumerate(['red', 'yel', 'grn']):
        a = add(k, perp, -0.5 + i * 0.9)
        b = add(add(a, (sway, 0)), (0.5 * i, -5 + i))
        for t in np.linspace(0, 1, 7):
            cv_.px(lerp(a, b, t), col)


def draw_head(cv_, P):
    h = P['head']
    face = P.get('face', 'normal')
    tilt = P.get('tilt', 0)
    m = m_ellipse(h, 6.2, 6.8, tilt)
    # mandíbula un poco más cuadrada hacia adelante
    m |= m_ellipse(add(h, (1.8, -2.5)), 4.6, 3.8, tilt)
    # oreja
    cv_.part(m, 'skin', 'skin_s', 'skin_l')
    # nariz
    cv_.px(add(h, (6.3, -0.5)), 'skin')
    cv_.px(add(h, (6.3, -1.5)), 'skin_s')
    cv_.px(add(h, (7.2, -1.5)), 'out')
    cv_.px(add(h, (7.2, -0.5)), 'out')
    # barba: mandíbula y mentón
    for x in range(-2, 7):
        for y in (-5, -6, -7, -8):
            p = add(h, (x + 0.5, y + 0.5))
            X, Y = cv(p)
            xi, yi = int(X), int(Y)
            if 0 <= xi < W and 0 <= yi < H and m[yi, xi]:
                if y > -8 or x > 0:
                    cv_.px(p, 'beard')
    # patilla
    for y in (-1, -2, -3, -4):
        cv_.px(add(h, (-1.5, y)), 'beard')
    # oreja
    cv_.px(add(h, (-2.5, 0.5)), 'skin_s')
    cv_.px(add(h, (-2.5, -0.5)), 'skin_s')
    cv_.px(add(h, (-3.5, 0.5)), 'skin_l')
    # bigote + boca
    for x in (2, 3, 4, 5):
        cv_.px(add(h, (x + 0.5, -3.5)), 'beard')
    if face == 'hurt':
        cv_.px(add(h, (4.5, -4.5)), 'out'); cv_.px(add(h, (5.5, -4.5)), 'out')
        cv_.px(add(h, (4.5, -5.5)), (160, 40, 40))
    # ojo
    if face in ('normal', 'focus'):
        cv_.px(add(h, (3.5, 1.5)), 'eye_w')
        cv_.px(add(h, (4.5, 1.5)), 'eye')
        cv_.px(add(h, (4.5, 0.5)), 'eye')
        cv_.px(add(h, (3.5, 0.5)), 'eye_w')
        # párpado pesado (relajado) o ceño (focus)
        if face == 'normal':
            cv_.px(add(h, (3.5, 2.5)), 'skin_s'); cv_.px(add(h, (4.5, 2.5)), 'skin_s')
            cv_.px(add(h, (2.5, 3.5)), 'beard'); cv_.px(add(h, (3.5, 3.5)), 'beard'); cv_.px(add(h, (4.5, 3.5)), 'beard')
        else:
            cv_.px(add(h, (2.5, 3.5)), 'beard'); cv_.px(add(h, (3.5, 3.0)), 'beard')
            cv_.px(add(h, (4.5, 2.5)), 'beard'); cv_.px(add(h, (5.5, 2.5)), 'beard')
    elif face == 'hurt':
        # ojo apretado ><
        cv_.px(add(h, (3.5, 2.5)), 'eye'); cv_.px(add(h, (4.5, 1.5)), 'eye'); cv_.px(add(h, (3.5, 0.5)), 'eye')
        cv_.px(add(h, (2.5, 3.5)), 'beard'); cv_.px(add(h, (5.5, 3.0)), 'beard')
    elif face == 'ko':
        for d in [(3.5, 2.5), (5.5, 2.5), (4.5, 1.5), (3.5, 0.5), (5.5, 0.5)]:
            cv_.px(add(h, d), 'eye')
    elif face == 'drag':
        # ojos entrecerrados, pitando fuerte
        cv_.px(add(h, (3.5, 1.5)), 'eye'); cv_.px(add(h, (4.5, 1.5)), 'eye')
        cv_.px(add(h, (2.5, 2.5)), 'beard'); cv_.px(add(h, (3.5, 2.5)), 'beard'); cv_.px(add(h, (4.5, 2.5)), 'beard')


def draw_tam(cv_, P):
    """Gorro rasta tejido: rojo, amarillo y verde, caído hacia atrás."""
    h = P['head']
    ang = P.get('tam_ang', 18)
    c = add(h, (-2.8, 5.0))
    m = m_ellipse(c, 6.9, 4.3, ang)
    m |= m_ellipse(add(h, (-6.8, 3.2)), 3.8, 4.2, ang)
    # no tapar la cara
    cv_.part(m, 'grn', outline=True)
    X, Y = cv(c)
    a = math.radians(ang)
    # bandas según distancia vertical rotada respecto del centro
    v = (PX - X) * math.sin(a) + (PY - Y) * math.cos(a)
    inner = m & ~(dilate4(~m))
    cv_.fill(inner & (v < 1.2), C['yel'])
    cv_.fill(inner & (v < -1.5), C['red'])
    # borde tejido (ribete de abajo)
    rim = m & ~shift(m, 0, 1)
    cv_.fill(rim & ~(dilate4(~m) & ~m), (26, 110, 50))
    # textura tejida
    tex = inner & ((xx + yy) % 3 == 0)
    cv_.rgb[tex] = (cv_.rgb[tex].astype(int) * 0.82).astype(np.uint8)


def draw_joint(cv_, P, t):
    """El porro en la boca y el humo. t = índice de frame, para animar el humo."""
    if P.get('no_joint'):
        return
    h = P['head']
    ja = math.radians(P.get('joint_ang', -12))
    d = (math.cos(ja), math.sin(ja))
    base = add(h, (5.5, -4.2))
    L = 6
    for i in range(L):
        cv_.px(add(base, d, i), 'paper')
    # se ensancha hacia la punta (cono), con la sombra abajo
    for i in range(2, L):
        cv_.px(add(add(base, d, i), (0, -1)), 'paper_s')
    cv_.px(base, (214, 170, 110))  # filtro
    tip = add(base, d, L)
    glow = P.get('glow', 0)
    cv_.px(tip, 'ember_hot' if glow else 'ember')
    cv_.px(add(tip, (0, -1)), 'ember')
    if glow:
        cv_.px(add(tip, d, 1), 'ember')
        cv_.px(add(tip, (0, 1)), 'ember')
    else:
        cv_.px(add(tip, d, 1), 'ash')
    # humo: una columna ondulada que sube desde la brasa
    if P.get('smoke', True):
        drift = P.get('smoke_drift', -0.25)
        for k in range(6):
            s = (t * 2 + k * 3) % 18
            yup = s + 1
            wob = round(math.sin((s + k) * 0.8) * 1.2)
            p = add(tip, (wob + drift * s + 1, yup))
            col = 'smoke' if s < 10 else 'smoke_s'
            cv_.px(p, col)
            if s > 6:
                cv_.px(add(p, (1, 0)), col)
            if s > 11:
                cv_.px(add(p, (0, 1)), 'smoke_s')


def cloud(cv_, center, r, t=0, col='smoke', shade='smoke_s', lumps=5, seed=0):
    """Nube puff: bollos separados, cada uno con su contorno, de atrás hacia adelante."""
    rng = np.random.RandomState(seed)
    lumps_ = []
    for i in range(lumps):
        a = 2 * math.pi * i / lumps + rng.rand() * 0.6
        rr = r * (0.5 + rng.rand() * 0.3)
        c = add(center, (math.cos(a) * r * 0.5, math.sin(a) * r * 0.42))
        lumps_.append((c, rr))
    lumps_.sort(key=lambda l: l[0][1], reverse=True)   # los de arriba primero
    lumps_.insert(len(lumps_) // 2, (center, r * 0.62))
    for c, rr in lumps_:
        cv_.part(m_ellipse(c, rr, rr * 0.88), col, shade, 'eye_w')


def streak(cv_, a, b, col='fx', w=1):
    n = int(math.hypot(*sub(b, a))) + 1
    for i in range(n):
        p = lerp(a, b, i / max(n - 1, 1))
        cv_.px(p, col)
        if w > 1:
            cv_.px(add(p, (0, 1)), col)


def spark(cv_, c, r, col='fx_s'):
    for ang in range(0, 360, 45):
        a = math.radians(ang + 22)
        rr = r if ang % 90 == 0 else r * 0.6
        streak(cv_, add(c, (math.cos(a) * 1.5, math.sin(a) * 1.5)),
               add(c, (math.cos(a) * rr, math.sin(a) * rr)), col)
    cv_.px(c, 'fx')


# --------------------------------------------------------------- pose completa
def render(P, t=0):
    cv_ = Canvas()
    for fx_ in P.get('fx_back', []):
        fx_(cv_, t)
    hip, chest = P['hip'], P['chest']
    draw_dreads(cv_, P)
    spine = norm(sub(chest, hip))
    perp = (spine[1], -spine[0])
    sh_f, sh_b = add(chest, perp, 4.5), add(chest, perp, -3.5)
    sh_b = add(sh_b, (0, 0.5))
    # brazo de atrás
    draw_arm(cv_, sh_b, P['hand_b'], P.get('bend_b', -1), True, True)
    # pierna de atrás
    hp_b = add(hip, perp, -2.5)
    hp_f = add(hip, perp, 2.5)
    draw_leg(cv_, hp_b, P['foot_b'], True, P.get('kbend_b', 1), P.get('toe_b', 0))
    # torso
    _, _, _, _, perp, spine = draw_torso(cv_, hip, chest, P)
    # pierna de adelante
    draw_leg(cv_, hp_f, P['foot_f'], False, P.get('kbend_f', 1), P.get('toe_f', 0))
    draw_belt(cv_, hip, perp, spine)
    draw_belt_knot(cv_, hip, perp, spine, P.get('belt_sway', -1))
    # cuello
    neck_m = m_capsule(add(chest, spine, 1), add(P['head'], (0, -4)), 2.6)
    cv_.part(neck_m, 'skin', 'skin_s', outline=False)
    draw_head(cv_, P)
    draw_tam(cv_, P)
    # brazo de adelante: hombro con el tatuaje grande
    draw_arm(cv_, sh_f, P['hand_f'], P.get('bend_f', -1), False, True)
    draw_joint(cv_, P, t)
    for fx_ in P.get('fx', []):
        fx_(cv_, t)
    return cv_.image()


# --------------------------------------------------------------- paletas
# El jugador 2 es el mismo rasta con otra ropa: gi negro y guantes naranjas (el
# naranja es el color del jugador 2 en la vista). Mismo dibujo, otra paleta.
BASE_PALETTE = dict(C)
PALETTES = {
    'rasta': {},
    'rasta2': {
        'gi': (62, 62, 72), 'gi_s': (40, 40, 50), 'gi_l': (96, 96, 108),
        'giB': (48, 48, 58), 'giB_s': (32, 32, 40), 'giB_l': (72, 72, 84),
        'glove': (242, 140, 38), 'glove_s': (184, 90, 22), 'glove_l': (255, 196, 110),
        'gloveB': (200, 110, 28), 'gloveB_s': (140, 70, 18), 'gloveB_l': (230, 150, 70),
        'skin': (116, 72, 46), 'skin_s': (86, 52, 32), 'skin_l': (146, 94, 62),
        'skinB': (94, 58, 36), 'skinB_s': (70, 42, 26), 'skinB_l': (116, 74, 46),
        'dread': (40, 30, 24), 'dread_s': (26, 20, 16), 'dread_l': (78, 58, 40),
        'boot': (60, 44, 34), 'boot_s': (40, 28, 22), 'boot_l': (88, 66, 50),
        'bootB': (48, 36, 28), 'bootB_s': (32, 24, 18), 'bootB_l': (70, 52, 40),
    },
}


def use_palette(name):
    C.clear()
    C.update(BASE_PALETTE)
    C.update(PALETTES[name])
