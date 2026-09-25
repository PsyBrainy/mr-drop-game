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
 * 3: plataformas flotantes que se mueven; el estado del peleador suma
 *    `platform` y `dropThrough`, y abajo (DOWN) sirve para bajarse de ellas.
 * 4: once golpes con dirección (M6 F0). El estado guarda la clave nueva del golpe
 *    y abajo + golpe arriba de una flotante pega en vez de bajarse.
 * 5: buffer de golpe (M6 F1). El estado suma `attackBuffer`, `bufferedButton` y
 *    `bufferedAim`: un golpe apretado antes de poder pegar sale apenas se pueda.
 * 6: el recovery (M6 F2). El fuerte en el aire impulsa (`motion`), una vez por
 *    vuelo (`airMovesUsed`), y la deriva baja de 5,6 a 4,8.
 */
export const SIM_VERSION = 6
