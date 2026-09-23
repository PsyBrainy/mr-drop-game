/**
 * Banderas de build de los juegos. Igual que `VITE_ENABLE_SANDBOX` (ver
 * `src/ui/lib/features.ts`): son comparaciones literales para que Vite pueda
 * plegarlas a `false` al compilar y lo apagado no llegue al bundle.
 */

/**
 * La pelea local (dos jugadores en un teclado) es una herramienta de ajuste, no
 * un juego: sin esta variable no aparece en ningún lado, ni siquiera en el
 * sandbox. Para usarla, `VITE_ENABLE_FIGHT_LOCAL=true` en el `.env` local.
 */
const fightLocal = import.meta.env.VITE_ENABLE_FIGHT_LOCAL

export const fightLocalEnabled =
  fightLocal === 'true'
  || fightLocal === 'TRUE'
  || fightLocal === 'True'
  || fightLocal === '1'
  || fightLocal === 'yes'
  || fightLocal === 'on'
