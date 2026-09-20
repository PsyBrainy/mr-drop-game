#!/usr/bin/env bash
# Genera las versiones de public/ a partir del arte original de assets-src/.
#
# Ninguna textura puede superar los 2048 px de lado: el límite de GPU en
# celulares es 4096 en equipos modernos y 2048 en los viejos, y una textura que
# no entra no se sube — el juego se ve todo negro. Además baja la VRAM total,
# que es el otro motivo por el que un móvil tira la pestaña.
#
# Los anchos elegidos son múltiplos exactos de la cantidad de frames, para que
# el corte del sprite sheet siga cayendo justo.
set -euo pipefail
cd "$(dirname "$0")/.."

copy() { # archivo (ya entra en el límite, se copia tal cual)
  cp "assets-src/$1.png" "public/$1.png"
  printf '  %-42s -> sin cambios\n' "$1.png"
}

resize() { # archivo alto ancho
  sips -z "$2" "$3" "assets-src/$1.png" --out "public/$1.png" > /dev/null
  printf '  %-42s -> %sx%s\n' "$1.png" "$3" "$2"
}

echo "Generando sprites para public/ (máx. 2048 px):"
for capa in capa_sky capa_far capa_mid capa_near capa_ground; do
  resize "$capa" 480 2048
done
resize jump_sheet_8x688x440            164 2048   # 8 frames x 256
resize patrullero_choque_12x1_half     112 2040   # 12 frames x 170
resize patrullero_marcha_4x1_980x644   336 2048   # 4 frames x 512
resize acelerando_6x2_672x384          384 2016   # grilla 6x2 -> frames de 336x192
copy   puntos_digitos_63x63                  # 11 frames de 63x63
resize cogollo_giro_12x1_392x392       170 2040   # 12 frames x 170
resize cogollo_agarrado_8x1_392x392    256 2048   # 8 frames x 256
resize pozo_rompiendo_12x1_504x182      61 2040   # 12 frames x 170
resize pozo_lava_loop_6x1_504x182      123 2040   # 6 frames x 340
