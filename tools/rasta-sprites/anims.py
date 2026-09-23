"""Las poses de cada animación y la tabla de timing sugerida (frame del juego -> pose)."""
import math
from render import *


def base(**kw):
    P = dict(hip=(0, 24), chest=(1.5, 39.5), head=(3, 48.5), hand_f=(12, 31),
             hand_b=(18, 38), foot_f=(9, 4), foot_b=(-8, 4), hair=28)
    P.update(kw)
    return P


def moved(P, dx=0, dy=0, keys=('hip', 'chest', 'head', 'hand_f', 'hand_b')):
    Q = dict(P)
    for k in keys:
        Q[k] = (P[k][0] + dx, P[k][1] + dy)
    return Q


# ------------------------------------------------------------------ idle (6, loop)
def idle():
    out = []
    bob = [0, 0, -0.6, -1.1, -1.1, -0.6]
    for i in range(6):
        b = bob[i]
        P = base(hair=28 + (i % 3) * 2)
        P = moved(P, 0, b)
        P['hip'] = (0, 24 + b * 0.6)
        P['hand_b'] = (18, 38 + b * 0.5)
        out.append((P, i))
    return out


# ------------------------------------------------------------------ walk (8, loop)
def walk():
    out = []
    for i in range(8):
        ph = 2 * math.pi * i / 8
        b = -abs(math.sin(ph)) * 1.2 + 0.4
        ff = (2 + 8 * math.cos(ph), 4 + max(0, math.sin(ph)) * 4)
        fb = (2 - 8 * math.cos(ph), 4 + max(0, -math.sin(ph)) * 4)
        P = base(hair=36 + 5 * math.sin(ph * 2), belt_sway=-1 - math.sin(ph))
        P = moved(P, 1.5, b)
        P['hip'] = (1, 24 + b)
        P['foot_f'], P['foot_b'] = ff, fb
        P['toe_f'] = 8 if ff[1] > 5 else 0
        P['toe_b'] = 8 if fb[1] > 5 else 0
        P['hand_f'] = (13.5 - 1.5 * math.cos(ph), 31 + b)
        P['hand_b'] = (18.5 + 1.5 * math.cos(ph), 38 + b)
        P['smoke_drift'] = -0.6
        out.append((P, i))
    return out


# ------------------------------------------------------------------ air (4: 2 de subida, 2 de caída)
def air():
    rise1 = base(hip=(0, 30), chest=(2, 45), head=(4, 54), hand_f=(14, 40), hand_b=(10, 50),
                 foot_f=(8, 18), foot_b=(-4, 8), toe_f=20, toe_b=-20, hair=10, hair_len=1.05,
                 kbend_b=1)
    rise2 = dict(rise1, foot_f=(9, 20), foot_b=(-3, 10), hair=4, hand_b=(9, 52))
    fall1 = base(hip=(0, 28), chest=(1.5, 43), head=(3, 52), hand_f=(16, 44), hand_b=(-8, 46),
                 bend_b=1, foot_f=(7, 10), foot_b=(-7, 6), toe_f=-10, toe_b=-25, hair=140,
                 hair_len=0.85, smoke_drift=0.4)
    fall2 = dict(fall1, hair=150, hand_f=(16, 46), hand_b=(-9, 48), foot_f=(8, 8), foot_b=(-8, 4))
    return [(rise1, 0), (rise2, 2), (fall1, 4), (fall2, 6)]


# ------------------------------------------------------------------ land (3)
def land():
    l1 = base(hip=(0, 17), chest=(4, 31), head=(6.5, 39.5), hand_f=(15, 22), hand_b=(19, 30),
              foot_f=(10, 4), foot_b=(-9, 4), hair=70, hair_len=0.9, tam_ang=10)
    l2 = base(hip=(0, 20.5), chest=(3, 35.5), head=(5, 44.5), hand_f=(14, 27), hand_b=(19, 34),
              foot_f=(9.5, 4), foot_b=(-8.5, 4), hair=45)
    l3 = base(hip=(0, 23), chest=(2, 38.5), head=(3.5, 47.5), hand_f=(12.5, 30), hand_b=(18, 37),
              hair=32)
    return [(l1, 0), (l2, 1), (l3, 2)]


# ------------------------------------------------------------------ efectos
def fx_puff(c, r, seed=0):
    return lambda cv_, t: cloud(cv_, c, r, t, seed=seed)


def fx_streaks(y0, x0, x1, n=3, gap=3):
    def f(cv_, t):
        for k in range(n):
            y = y0 + (k - (n - 1) / 2) * gap
            streak(cv_, (x0 + abs(k - 1) * 3, y), (x1, y), 'fx')
    return f


def fx_spark(c, r):
    return lambda cv_, t: spark(cv_, c, r)


def fx_cone(x0, x1, y, h0, h1, seed=3, n=6):
    """Bocanada grande: nubes que crecen hacia adelante."""
    def f(cv_, t):
        for k in range(n):
            u = k / (n - 1)
            x = x0 + (x1 - x0) * u
            r = h0 + (h1 - h0) * u
            cloud(cv_, (x, y + math.sin(k * 2.3 + seed) * r * 0.6), r, t, seed=seed + k)
    return f


# ------------------------------------------------------------------ golpe rápido de piso
# startup 0-3, activo 4-6, recovery 7-16. La caja: x 7..45, y 17..47.
def light_ground():
    a1 = base(hip=(-1, 23.5), chest=(-0.5, 39), head=(1, 48), hand_f=(8, 33), hand_b=(16, 39),
              foot_f=(10, 4), hair=24, face='focus')                      # carga (0-1)
    a2 = base(hip=(1, 23.5), chest=(4, 38.5), head=(6, 47), hand_f=(16, 35), hand_b=(15, 39),
              foot_f=(11, 4), hair=34, face='focus')                     # sale (2-3)
    hit = base(hip=(3, 23), chest=(8.5, 37.5), head=(10.5, 46), hand_f=(30, 35.5), hand_b=(15, 38),
               foot_f=(13, 4), foot_b=(-8, 4), hair=48, face='focus', bend_f=-1,
               fx_back=[fx_streaks(35.5, 8, 24)],
               fx=[fx_puff((40.5, 34), 5.2, seed=1), fx_spark((41, 34), 5)])  # activo (4-6)
    r1 = base(hip=(2.5, 23), chest=(7, 38), head=(9, 46.5), hand_f=(26, 35), hand_b=(15.5, 38),
              foot_f=(12.5, 4), hair=42, face='focus',
              fx=[fx_puff((37, 36), 4.2, seed=2)])                         # recupera (7-10)
    r2 = base(hip=(1, 23.5), chest=(4, 38.5), head=(5.5, 47.5), hand_f=(18, 33), hand_b=(17, 38),
              foot_f=(11, 4), hair=34, fx=[fx_puff((35, 39), 2.8, seed=4)])   # (11-13)
    r3 = base(hair=30)                                                     # (14-16)
    poses = [(a1, 0), (a2, 1), (hit, 2), (r1, 3), (r2, 4), (r3, 5)]
    table = [0, 0, 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5]
    return poses, table


# ------------------------------------------------------------------ golpe rápido aéreo (patada voladora)
# startup 0-4, activo 5-8, recovery 9-20. La caja: x 3..45, y 15..53.
def light_air():
    a1 = base(hip=(0, 29), chest=(-1, 44), head=(1, 53), hand_f=(10, 42), hand_b=(-8, 44),
              bend_b=1, foot_f=(12, 18), foot_b=(-3, 12), toe_f=30, toe_b=-10, hair=60, face='focus')
    a2 = base(hip=(0, 30), chest=(-3, 44), head=(-1.5, 53), hand_f=(8, 44), hand_b=(-10, 42),
              bend_b=1, foot_f=(16, 24), foot_b=(-2, 14), toe_f=10, toe_b=-10, hair=80, face='focus')
    hit = base(hip=(1, 31), chest=(-5, 44.5), head=(-3.5, 53.5), hand_f=(6, 46), hand_b=(-13, 40),
               bend_b=1, foot_f=(24, 33), foot_b=(-3, 18), toe_f=5, toe_b=-20, kbend_b=1,
               hair=95, face='focus', smoke_drift=0.6,
               fx_back=[fx_streaks(33, 4, 22)],
               fx=[fx_puff((39.5, 34), 5.5, seed=5), fx_spark((40, 34), 5.5)])
    r1 = base(hip=(0, 30), chest=(-3, 44.5), head=(-1.5, 53.5), hand_f=(8, 44), hand_b=(-11, 42),
              bend_b=1, foot_f=(18, 28), foot_b=(-3, 16), toe_f=10, toe_b=-15, hair=80,
              fx=[fx_puff((35, 35), 3.8, seed=6)])
    r2 = base(hip=(0, 29), chest=(0, 44), head=(2, 53), hand_f=(13, 42), hand_b=(-6, 46),
              bend_b=1, foot_f=(10, 16), foot_b=(-5, 8), toe_f=10, toe_b=-15, hair=60)
    r3 = dict(air()[2][0])
    poses = [(a1, 0), (a2, 1), (hit, 2), (r1, 3), (r2, 4), (r3, 5)]
    table = [0, 0, 0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5]
    return poses, table


# ------------------------------------------------------------------ golpe fuerte (la pitada y el bocanazo)
# startup 0-11, activo 12-15, recovery 16-37. La caja: x 8..60, y 12..56.
def heavy():
    # Anticipación larga y legible: se echa para atrás y le da una pitada larga
    # al porro (la brasa se prende). 12 frames = 200 ms de "se viene".
    w1 = base(hip=(-2, 23.5), chest=(-3.5, 39), head=(-2, 48), hand_f=(6, 34), hand_b=(-8, 36),
              bend_b=1, foot_f=(11, 4), foot_b=(-9, 4), hair=20, face='drag', glow=1)
    w2 = base(hip=(-4, 22.5), chest=(-7, 37.5), head=(-6, 46.5), hand_f=(4, 33), hand_b=(-14, 34),
              bend_b=1, foot_f=(12, 4), foot_b=(-10, 4), hair=14, face='drag', glow=1,
              joint_ang=-4, tam_ang=24)
    w3 = dict(w2, hip=(-4.5, 22), chest=(-8, 37), head=(-7, 46), hand_b=(-16, 33),
              hand_f=(3, 32), face='focus', glow=1)
    # Impacto: estocada larga, puño adelante y la bocanada que llega hasta 60.
    hit = base(hip=(8, 20.5), chest=(16, 34), head=(19, 42), hand_f=(37, 35), hand_b=(4, 30),
               bend_b=1, foot_f=(22, 4), foot_b=(-8, 4), toe_b=-5, hair=75, hair_len=1.05,
               face='focus', joint_ang=-18, smoke=False,
               fx_back=[fx_streaks(35, 12, 34, n=3, gap=4)],
               fx=[fx_cone(40, 52, 34, 3.5, 8.5, seed=11, n=5), fx_spark((51, 35), 10)])
    h2 = dict(hit, fx_back=[], fx=[fx_cone(40, 51, 35, 4, 9.5, seed=21, n=5)])
    r1 = base(hip=(7, 20.5), chest=(14.5, 34.5), head=(17.5, 42.5), hand_f=(33, 33), hand_b=(5, 30),
              bend_b=1, foot_f=(22, 4), foot_b=(-8, 4), hair=60, face='focus', smoke=False,
              fx=[fx_cone(40, 52, 38, 3.5, 6.5, seed=31, n=4)])
    r2 = base(hip=(5, 21.5), chest=(11, 36), head=(13.5, 44.5), hand_f=(26, 30), hand_b=(8, 32),
              bend_b=1, foot_f=(18, 4), foot_b=(-8, 4), hair=45,
              fx=[fx_puff((44, 44), 3.5, seed=41), fx_puff((50, 40), 2.5, seed=42)])
    r3 = base(hip=(2, 23), chest=(5, 38.5), head=(7, 47.5), hand_f=(16, 31), hand_b=(15, 37),
              foot_f=(13, 4), hair=34)
    r4 = base(hair=30)
    poses = [(w1, 0), (w2, 1), (w3, 2), (hit, 3), (h2, 4), (r1, 5), (r2, 6), (r3, 7), (r4, 8)]
    table = ([0] * 4 + [1] * 4 + [2] * 4 +      # startup 12
             [3, 3, 4, 4] +                     # activo 4
             [5] * 6 + [6] * 6 + [7] * 5 + [8] * 5)  # recovery 22
    return poses, table


# ------------------------------------------------------------------ esquive (26 frames)
# Se agacha y se esconde en su propia nube de humo. Invulnerable 3..14.
def dodge():
    d1 = base(hip=(-1, 19), chest=(3, 33), head=(6, 41), hand_f=(12, 28), hand_b=(15, 33),
              foot_f=(10, 4), foot_b=(-9, 4), hair=50)
    d2 = base(hip=(-3, 15), chest=(4, 26), head=(9, 32), hand_f=(13, 22), hand_b=(15, 27),
              foot_f=(10, 4), foot_b=(-11, 4), hair=85, hair_len=0.9, tam_ang=0,
              fx_back=[fx_puff((-10, 18), 7, seed=51)],
              fx=[fx_puff((-4, 8), 6, seed=52), fx_puff((12, 10), 5, seed=53)])
    d3 = dict(d2, hair=95, fx_back=[fx_puff((-12, 20), 8, seed=61)],
              fx=[fx_puff((-5, 9), 6.5, seed=62), fx_puff((13, 12), 5.5, seed=63),
                  fx_puff((3, 38), 5, seed=64)])
    d4 = dict(d2, fx_back=[fx_puff((-13, 24), 6, seed=71)], fx=[fx_puff((14, 14), 4, seed=72)])
    d5 = base(hip=(-1, 20), chest=(2.5, 35), head=(5, 43.5), hand_f=(12, 29), hand_b=(16, 35),
              foot_f=(10, 4), foot_b=(-9, 4), hair=50, fx=[fx_puff((-14, 32), 3, seed=81)])
    d6 = base(hair=32)
    poses = [(d1, 0), (d2, 1), (d3, 2), (d4, 3), (d5, 4), (d6, 5)]
    table = [0, 0, 0] + [1] * 4 + [2] * 5 + [3] * 3 + [4] * 6 + [5] * 5
    return poses, table


# ------------------------------------------------------------------ colgado de la pared/borde (loop)
# La pared está adelante (a la derecha), en x = +16.
def wall():
    out = []
    for i in range(4):
        b = [0, -0.5, -1, -0.5][i]
        P = base(hip=(2, 24 + b), chest=(6, 38.5 + b), head=(8, 47.5 + b),
                 hand_f=(14, 53 + b), hand_b=(14, 41 + b * 0.5), bend_f=1, bend_b=-1,
                 foot_f=(12, 12), foot_b=(10, 4), toe_f=60, toe_b=50, kbend_f=1, kbend_b=1,
                 hair=35 + i * 2, face='focus', smoke_drift=-0.4)
        out.append((P, i * 2))
    return out


# ------------------------------------------------------------------ recibiendo golpe (sostenida)
def hurt():
    h1 = base(hip=(-2, 24), chest=(-6, 38), head=(-7, 46), hand_f=(9, 27), hand_b=(-17, 42),
              bend_b=1, foot_f=(8, 5), foot_b=(-9, 4), toe_f=10, hair=5, face='hurt',
              joint_ang=20, tilt=-12, tam_ang=30, smoke=False,
              fx=[fx_spark((7, 47), 5)])
    h2 = dict(h1, fx=[], hand_f=(8, 26), hand_b=(-18, 40), head=(-7.5, 46.5))
    return [(h1, 0), (h2, 1)]


# ------------------------------------------------------------------ KO / salir volando (una vez)
def ko():
    fly = base(hip=(0, 28), chest=(-5, 41), head=(-7, 49), hand_f=(10, 50), hand_b=(-2, 54),
               bend_b=1, bend_f=1, foot_f=(12, 16), foot_b=(6, 12), toe_f=20, toe_b=10,
               hair=0, face='ko', no_joint=True, tam_ang=40)
    frames = []
    for k, ang in enumerate([0, -90, -180, -270, 0, -90]):
        frames.append((fly, k, ang))
    return frames
