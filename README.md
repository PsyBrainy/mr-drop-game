# MrDrop

Web de concursos de la comunidad MrDrop. Se entra con un código, se juegan los juegos
habilitados para ese evento y se compite por el ranking.

- **Front:** Vite + React 19 + TypeScript (CSS propio, sin framework de estilos)
- **Backend:** Supabase (Postgres + Auth + RLS)
- **Motor de juegos:** [Kaplay](https://kaplayjs.com), cargado on-demand

## Arrancar

```bash
npm install
cp .env.example .env     # completá URL y publishable key de tu proyecto Supabase
npm run dev
```

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run dev:host` | Igual, pero accesible desde el celular en la misma red |
| `npm run build` | Build de producción a `dist/` |
| `npm run lint` | Typecheck (`tsc --noEmit`) |
| `npm test` | Tests de dominio (Vitest) |

La home funciona sin Supabase configurado: muestra un aviso y oculta login y concursos.

## Base de datos

En el SQL Editor de tu proyecto Supabase, en orden:

1. `supabase/migrations/0001_init.sql` — tablas, RLS y funciones
2. `supabase/migrations/0002_free_play.sql` — sección de juego libre (`/jugar`)
3. `supabase/migrations/0003_fix_finish_session.sql` — cierre de partida
4. `supabase/migrations/0004_public_leaderboard.sql` — ranking visible para todos
5. `supabase/seed.sql` — un concurso de ejemplo con el juego `mrdrop-run` y el código `MRDROP24`

Después registrate en la app y date permisos de admin:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'TU-EMAIL@ejemplo.com');
```

Con eso te aparece **Panel** en la barra superior.

### Modelo

```
events ──< event_games >── games          event_games.is_enabled = el switch del panel
   │
   ├──< access_codes ───┐
   └──< participations ─┘ (un usuario por evento)
             │
             └──< game_sessions ──> leaderboard (vista: mejor score por usuario y juego)
```

**Juego libre:** un evento con `is_free_play = true` es la sección `/jugar`. No pide código
(la primera partida inscribe al usuario), no limita intentos y su ranking es permanente. El
admin habilita sus juegos desde el Panel como en cualquier concurso; `0002_free_play.sql` crea
el evento `juego-libre` ya en vivo.

**Reglas que impone la base, no el front:**

- `access_codes` no es legible por jugadores. El canje pasa por `redeem_access_code()`,
  que valida vigencia, cupo y que el evento esté abierto.
- `participations` y `game_sessions` no tienen policies de INSERT/UPDATE: se escriben
  solo desde funciones `SECURITY DEFINER`. Un jugador no puede inventarse un puntaje
  ni saltearse el límite de intentos.
- `start_game_session()` verifica habilitación del juego e intentos restantes;
  `finish_game_session()` cierra la partida una sola vez y solo para su dueño.

## Arquitectura

Clean Architecture: las dependencias apuntan siempre hacia adentro.

```
src/
├── domain/          Entidades y reglas puras. Cero imports de infra.
├── application/     ports/ (interfaces) + usecases/ (casos de uso)
├── infrastructure/  Adaptadores Supabase + container.ts (el único cableado)
├── games/           Contrato de juego, registry y adaptador Kaplay
└── ui/              React: páginas, componentes, providers
```

La UI habla con `usecases`, nunca con Supabase directo. Cambiar de backend implica
escribir adaptadores nuevos en `infrastructure/` sin tocar dominio ni pantallas.

## Agregar un juego

1. Creá el módulo en `src/games/modules/miJuego.ts`:

```ts
import { createKaplayGame } from '../kaplay/createKaplayGame'
import { readNumber } from '../GameModule'

export default createKaplayGame({
  slug: 'mi-juego',
  name: 'Mi Juego',
  howToPlay: 'Cómo se juega, en una línea.',
  start(k, context) {
    const duration = readNumber(context.config, 'durationSeconds', 30)
    // ... escena Kaplay ...
    context.onScoreChange(score)          // HUD en vivo
    context.onGameOver(score, { motivo }) // fin de partida -> se persiste
    return () => { /* cleanup opcional */ }
  },
})
```

2. Registralo en `src/games/registry.ts` con su relación de aspecto (el import es
   dinámico: cada juego es su propio chunk y Kaplay solo se descarga al entrar a
   jugar). La app usa esa relación para darle la forma correcta al marco, así que
   cada juego elige si es vertical o apaisado.

3. Insertá la fila en el catálogo, **con el mismo slug**:

```sql
insert into public.games (slug, name, description)
values ('mi-juego', 'Mi Juego', 'Descripción corta.');
```

4. Prendelo para un evento desde **Panel → Disponibilidad de juegos**.

### Puntaje

| | suma |
| --- | --- |
| pozo esquivado | 10 |
| patrullero esquivado | 15 |
| cogollo agarrado | 30 |

Cada vez que sumás aparece un cartel flotante de `+N` armado con
`puntos_digitos_63x63.png` (frame 0 es el `+`, los frames 1..10 son los dígitos
0..9). Son **sprites, no texto de Kaplay**, así que no los toca el problema del
atlas de fuente compartido.

La velocidad la marca la **cantidad** de obstáculos esquivados, no el puntaje: si
saliera del puntaje, agarrar un cogollo dispararía un salto de dificultad que el
jugador no pidió.

### Animación de la camioneta

La marcha usa `acelerando_6x2_672x384.png`, una **grilla de 6×2 = 12 frames** (el
`Sheet` del config soporta `cols`/`rows`, no solo tiras de una fila). Encima:

- **Ritmo atado a la velocidad** (`animSpeed` de Kaplay, en vivo): el ciclo pasa de
  0,60 s a velocidad inicial a 0,29 s a máxima, con techo.
- **Vibración del motor**: unos píxeles a 11 Hz que crecen con la velocidad. Es
  **solo dibujo** — la caja de colisión usa la posición real.

Las cajas de colisión se definen como fracciones del cuerpo real de la camioneta
medido sobre la hoja (`TRUCK_W * 0.65`, etc.), no como números sueltos: por eso
cambiar de sprites no movió el ajuste — los márgenes quedaron en 0,161 s y 0,204 s
contra 0,160 s y 0,202 s de la hoja anterior.

### Sprites: límite de GPU

El arte original vive en `assets-src/` (no se sirve). Lo que va a `public/` lo genera:

```bash
./scripts/optimize-sprites.sh
```

**Ninguna textura puede pasar de 2048 px de lado.** El límite de GPU en celulares
es 4096 px en equipos modernos y 2048 en los viejos: una textura que no entra
simplemente no se sube y el juego se ve todo negro, aunque en la compu funcione
perfecto (ahí el límite son 16384 px). La VRAM total también cuenta — el arte
original pedía 119 MB y eso tira la pestaña en un teléfono.

| | original | servido |
| --- | --- | --- |
| lado máximo | 5880 px | 2048 px |
| VRAM total | 119 MB | 26 MB |
| peso en disco | 2,5 MB | 1,6 MB |

`npm test` verifica los dos techos, que cada hoja se corta en frames exactos y que
las medidas del config caen dentro del frame. Si regenerás los sprites con otro
tamaño, hay que volver a medirlos (bounding box del alfa) y actualizar el
`*.config.ts`, porque esas medidas están en píxeles del archivo servido.

### Sprites y medidas

Los sprites de `public/` tienen padding transparente distinto en cada hoja, así que
los juegos no los centran: los posicionan por el **contenido real** (borde izquierdo
y línea de ruedas medidos sobre el PNG). Esas medidas viven en el `*.config.ts` de
cada juego, separadas del módulo que usa Kaplay, para poder testearlas headless.

En `MrDrop Run` eso además sostiene tres invariantes de jugabilidad que `npm test`
verifica en todo el rango de velocidad:

- **El salto tiene que alcanzar.** El tiempo que el jugador pasa por encima del
  patrullero debe superar al tiempo que las cajas de colisión se solapan; si no,
  ni un salto perfecto esquiva.
- **El choque tiene que verse.** El patrullero choca recién cuando terminó de pasar
  al jugador, así que `PLAYER_X - COP_W` es el margen que queda para mostrar la
  animación. Con el jugador muy a la izquierda el choque arranca fuera de pantalla.
- **Tiene que haber tiempo de reacción.** Correr al jugador a la derecha mejora lo
  anterior pero recorta la distancia desde que el patrullero aparece.
- **El cogollo se gana saltando.** Toda la banda de altura en la que aparece tiene
  que quedar fuera del alcance de la camioneta en el piso, y dentro del alcance en
  la parte alta del salto con margen de sobra.
- **El pozo también se salva.** Casi no hay que subir, pero la franja es ancha y va
  a la velocidad de la ruta: ahí la ventana la marca el ancho, no la altura.
- **El pozo se abre a la vista y a tiempo.** Entra a pantalla por fuera del borde,
  así que la apertura arranca recién cuando está del todo visible (`POZO_BREAK_START_X`);
  si arrancara al aparecer, a velocidad baja se formaría casi entero afuera. Y tiene
  que terminar de abrirse antes de llegar al jugador, incluso a máxima velocidad.

Los obstáculos se programan por su hora de **llegada al jugador**, no por la de
aparición. El patrullero viene de frente y el pozo va con la ruta, así que a la
misma velocidad de juego tardan muy distinto (2,38 s contra 1,83 s al arrancar).
Soltarlos espaciados por aparición haría que un patrullero detrás de un pozo
llegara encima suyo, con el jugador todavía en el aire por el salto anterior.
Lo mismo vale para el cogollo: puede llegar junto a un obstáculo —se saltan los
dos de una— pero nunca justo antes.

Los vehículos se dibujan al 75% de su tamaño original y el jugador va en `x=250`:
así entra más ruta en pantalla y la explosión se ve entera. La física y las
velocidades están escaladas en la misma proporción, así que se juega igual.

### `/sandbox`: probar sin backend

Monta cualquier juego del registry sin evento, sin código y sin sesión. El puntaje
no se guarda ni entra en el ranking.

En desarrollo va siempre. Para probar en un build de producción hay que pedirlo:

```bash
VITE_ENABLE_SANDBOX=true npm run build
```

Sin esa variable la ruta **no existe** y el componente se va entero del bundle
(verificado: 513 kB sin el flag, 516 kB con él). Es un flag de build, así que
apagarlo es rebuildear, no editar código.

Conviene dejarlo apagado cuando el concurso esté en marcha: es una ruta de juego
libre, y aunque no toca el ranking ni gasta intentos, permite practicar sin código.

> Kaplay pausa su loop cuando la pestaña no está visible: si la dejás en segundo plano,
> el canvas se ve negro hasta que volvés. Es del motor, no del juego.

### Los juegos no dibujan texto adentro del canvas

Kaplay cachea el atlas de fuente en `fontAtlases`, un objeto **a nivel de módulo**
con la clave del nombre de la fuente, pero la textura se crea contra el contexto
WebGL de la instancia que la pidió primero:

```ts
// kaplay/src/gfx/formatText.ts
const fontAtlases: Record<string, FontAtlas> = {}
const atlas = fontAtlases[fontName] ?? { font: { tex: new Texture(_k.gfx.ggl, ...) } }
```

Al reiniciar una partida, la instancia nueva encuentra el caché y reutiliza una
textura de un contexto ya muerto: **el texto desaparece mientras los sprites
siguen andando** (van en `bigTextures`, fuera del atlas). El síntoma es que se
rompe el cartel pero no el juego, y solo a partir del primer reinicio. El archivo
no exporta nada para limpiar ese caché.

Por eso el HUD y los carteles se mandan como datos (`onScoreChange`,
`onStatusChange`, `onGameOver`) y los dibuja la app en HTML encima del canvas.
Sale gratis: el texto queda nítido, se puede clickear —el botón de volver a
empezar es un `<button>` de verdad, que funciona en pantalla completa— y se
ahorran los 16 MB de VRAM del atlas de 2048×2048.

El adaptador además suelta el contexto WebGL a mano en `destroy()`. `k.quit()`
engancha el teardown al `"frameEnd"` siguiente, y para entonces la instancia
nueva ya nació: medido en el sandbox, los contextos se acumulaban (2 tras el
primer reinicio, 3 tras el segundo) y ahora queda siempre 1.

## Rutas

| Ruta | Acceso |
| --- | --- |
| `/` | Pública — home con concursos |
| `/entrar` | Pública — login y registro |
| `/codigo`, `/codigo/:code` | Pública — canje (el link que se reparte) |
| `/concurso/:slug` | Pública — detalle, juegos y ranking |
| `/concurso/:slug/:gameSlug` | Con sesión — jugar |
| `/cuenta` | Con sesión |
| `/admin` | Solo admin |
| `/sandbox` | Solo en dev |

El código sobrevive al login: si entrás por el link sin cuenta, se guarda y se canjea
solo después de registrarte.
