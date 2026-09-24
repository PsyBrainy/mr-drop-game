import { DEFAULT_RULES, type World } from '../sim/world'
import { OSO } from './characters/oso'
import { SMALL_STAGE } from './stage'

/**
 * El mundo de la pelea online: el escenario, los dos personajes y las reglas.
 *
 * Vive en un solo lugar porque lo usan dos lados que tienen que coincidir bit a
 * bit: la vista online, que juega la partida, y el validador, que la vuelve a
 * jugar desde el log para confirmar quién ganó. Si cada uno armara el suyo, un
 * cambio de un lado solo haría que el validador rechace partidas legítimas.
 */
export const ONLINE_WORLD: World = {
  stage: SMALL_STAGE,
  tuning: [OSO, OSO],
  rules: DEFAULT_RULES,
}
