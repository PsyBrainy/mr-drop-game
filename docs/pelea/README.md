# Pelea — índice

Juego 1v1 online tipo Brawlhalla, en `src/fight` (la sim) y `src/games/modules/fight*` (la vista).
Toda la documentación del harness está en esta carpeta, un archivo por propósito:

| Archivo | Qué tiene | Cuándo leerlo |
| --- | --- | --- |
| [`reglas.md`](reglas.md) | Las reglas duras (sim pura, determinismo, orden del tick, frame data, red, vista, clock) y cómo se trabaja | Siempre. `CLAUDE.md` lo importa |
| [`tareas.md`](tareas.md) | Estado: hitos M0–M6 y las fases en curso, con lo que falta | Antes de arrancar algo. `CLAUDE.md` lo importa |
| [`memoria.md`](memoria.md) | Qué se decidió, por qué, y lo que se midió. Registro con fechas | Antes de reabrir una decisión |
| [`funcional.md`](funcional.md) | Cómo se juega: modos, vidas, daño, movimiento, golpes, esquive, controles, ranking | Para cambiar algo que el jugador nota |
| [`tecnica.md`](tecnica.md) | Cómo está hecho: red, estructura de archivos, cómo probar, de input a golpe, versión de la sim | Para tocar el código |

Contratos con otros repos (protocolo de la pelea con psy-ws): `psy-ws/CLAUDE.md` y la tabla de
contratos del `CLAUDE.md` de la carpeta `psy-game`.

**Regla de mantenimiento:** todo avance se documenta acá en el mismo commit que el código, y cada
cosa vive en un solo archivo. Si algo aparece en dos, uno de los dos sobra.
