/**
 * Versión de la simulación. La comparten el formato de replay y el protocolo de
 * red, y por eso vive suelta acá arriba y no adentro de `sim/` (que no puede
 * importar nada de afuera) ni de uno de los dos consumidores.
 *
 * Se sube cada vez que un cambio hace que los mismos inputs produzcan otro
 * estado: tocar la gravedad, agregar una fase al tick, corregir un redondeo.
 * Dos clientes con versiones distintas NO pueden jugar juntos — no es una
 * incompatibilidad de protocolo, es que van a ver dos partidas diferentes — y
 * los replays viejos no se pueden validar con la sim nueva.
 */
/**
 * 2: el salto de pared sale más para arriba (jumpX 6 → 3, jumpY -11 → -13).
 */
export const SIM_VERSION = 2
