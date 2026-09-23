# Sprites del rasta

Pixel art generado por código: cada pose es un esqueleto (cadera, pecho, cabeza,
manos, pies) y `render.py` lo dibuja con contornos, sombreado, rastas, gorro,
tatuajes y el porro con humo. Para retocar una pose se cambian números en
`anims.py`, no píxeles.

```
pip install pillow numpy
python3 tools/rasta-sprites/build.py      # regenera assets-src/rasta_*.png y rasta.manifest.json
python3 tools/rasta-sprites/preview.py /tmp/cajas.png idle,light_ground,heavy   # con hurtbox y hitbox
```

## Escala y origen

- Se dibuja a 1 px de arte = 1 px de juego y se escala 2x (vecino más cercano):
  frames de **192×192**, cuerpo de 56 px de juego = 112 px de hoja.
- El origen (pies, centro del cuerpo) está en **x = 68, y = 180** de cada frame, igual
  en todas las hojas. No está centrado a propósito: el golpe fuerte llega 60 px
  adelante y del lado de atrás sólo hay rastas.
- Todo mira a la derecha.

## Hojas

| Hoja | Dibujos | Cómo corre |
| --- | --- | --- |
| idle | 6 | loop (~7 ticks por dibujo) |
| walk | 8 | loop |
| air | 4 | 0-1 subida, 2-3 caída |
| land | 3 | un dibujo por frame (landFrames = 3) |
| light_ground | 6 | tabla abajo |
| light_air | 6 | tabla abajo |
| heavy | 9 | tabla abajo |
| dodge | 6 | tabla abajo |
| wall | 4 | loop |
| hurt | 2 | 0 al recibir, 1 sostenida |
| ko | 6 | una vez (vueltas en el aire) |

## Timing: qué dibujo va en cada frame del ataque

El dibujo del impacto cae justo en el primer frame activo.

- **light_ground** (4+3+10): `0 0 1 1 | 2 2 2 | 3 3 3 3 4 4 4 5 5 5`. El índice 4, el primero activo, es el puño estirado.
- **light_air** (5+4+12): `0 0 0 1 1 | 2 2 2 2 | 3 3 3 3 4 4 4 4 5 5 5 5`
- **heavy** (12+4+22): `0×4 1×4 2×4 | 3 3 4 4 | 5×6 6×6 7×5 8×5`. La anticipación es la pitada larga: la brasa se prende y se echa para atrás.
- **dodge** (26, invulnerable del 3 al 14): `0 0 0 | 1×4 2×5 3×3 | 4×6 5×5`. Se esconde en su propia nube.

Las tablas también están en `assets-src/rasta.manifest.json` (`poseByFrame`).

## Alcance dibujado vs caja

| Golpe | Caja | Dibujo |
| --- | --- | --- |
| Rápido de piso | 45 | puño a ~34 + bocanada/chispa hasta 45-48 |
| Rápido aéreo | 45 | bota a ~31 + bocanada hasta 45-47 |
| Fuerte | 60 | puño a ~42 + nube de humo hasta 60-62 |

El cuerpo no llega solo a esas distancias con proporciones creíbles, así que el
humo del impacto cubre el tramo final de cada caja. Las chispas pasan 1 a 3 px el borde.

## Medidas

`rasta.manifest.json` trae, por hoja, la caja del alfa (`contentLeft`, `contentTop`,
`contentWidth`, `contentHeight`, en px de hoja) medida sobre todos los frames, la de cada
frame (`perFrame`) y la línea de los pies (`feetY = 180`, `originX = 68`).
