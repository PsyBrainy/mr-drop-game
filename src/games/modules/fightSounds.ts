/**
 * Los sonidos de la pelea. Los grabó la comunidad: dos audios de WhatsApp, uno
 * por personaje, recortados en pedacitos (`public/sounds/`). El audio 1 es el
 * rasta (jugador 1) y el audio 2 el rasta de la otra paleta (jugador 2). Un
 * tercer par y dos audios más, de otras voces, dieron sonido propio a todos los
 * golpes (`MOVE_VOICES`) y la frase de cuando alguien se cae.
 *
 * Son de la vista, no de la simulación: se deciden comparando el estado del
 * frame anterior con el nuevo ("arrancó un golpe", "le pegaron", "perdió una
 * vida"), así que no cambian nada de la sim, de la red ni de los replays.
 *
 * Se reproducen con Web Audio y un solo contexto para toda la página: Kaplay
 * crea uno por instancia y los navegadores tienen un límite, así que volver a
 * entrar a la pelea muchas veces terminaría sin sonido.
 */

import type { MoveKey } from '../../fight/sim/attack'
import type { MatchState, PlayerIndex } from '../../fight/sim/state'

/**
 * Las familias de siempre (rápido de piso, rápido aéreo, fuerte) y, desde que la
 * comunidad mandó más audios, algunos golpes con sonido propio. Un golpe sin
 * sonido propio suena como su familia (`MOVE_SOUND`).
 */
export type SoundKind =
  | 'lightGround' | 'lightAir' | 'heavy'
  | 'nLight' | 'sLight' | 'dLight' | 'nSig' | 'sSig' | 'dSig'
  | 'nAir' | 'sAir' | 'dAir' | 'recovery' | 'groundPound'
  | 'dodge' | 'hurt' | 'ko'

export interface SoundCue {
  readonly slot: PlayerIndex
  readonly kind: SoundKind
}

/**
 * Los golpes con sonido propio. Salen del tercer par de audios de la comunidad
 * (septiembre de 2026), recortados por silencios y normalizados al mismo pico que
 * los de antes (-2 dB). Son de otra voz que los de cada personaje, así que los
 * comparten los dos: son el sonido del golpe, no del que lo tira. Qué recorte va
 * con qué golpe está en docs/pelea/memoria.md.
 */
const MOVE_VOICES: Partial<Record<SoundKind, readonly string[]>> = {
  nLight: ['golpe_jab'],
  // Del cuarto audio: la frase entera es la bocanada (el golpe que mata) y su
  // primera sílaba, que se separa limpia, el puño de costado.
  sLight: ['golpe_puno'],
  sSig: ['golpe_bocanada'],
  // Del quinto audio (13:21:05): tres onomatopeyas cortas seguidas y un golpe
  // seco. Con esto los once golpes tienen sonido propio.
  dLight: ['golpe_barrida'],
  nSig: ['golpe_gancho'],
  dSig: ['golpe_humo'],
  sAir: ['golpe_patada'],
  nAir: ['golpe_patada_circulo'],
  dAir: ['golpe_pisoton'],
  recovery: ['golpe_recovery'],
  groundPound: ['golpe_picada'],
}

/**
 * Qué sonido va con qué, para cada personaje. Varios sonidos para lo mismo se
 * turnan: tres golpes rápidos seguidos no suenan igual. Un tipo sin sonidos no
 * suena. Para cambiar un recorte, se reemplaza el archivo en `public/sounds/`.
 */
export const FIGHT_SOUNDS: readonly [Partial<Record<SoundKind, readonly string[]>>, Partial<Record<SoundKind, readonly string[]>>] = [
  {
    lightGround: ['rasta_light_1', 'rasta_light_2', 'rasta_light_3'],
    lightAir: ['rasta_light_2', 'rasta_light_3'],
    heavy: ['rasta_heavy'],
    dodge: ['rasta_dodge'],
    hurt: ['rasta_hurt'],
    // "Mirá que te voy a cobrar, psy" (quinto audio): se turna con el de siempre.
    ko: ['rasta_ko', 'frase_cobrar'],
    ...MOVE_VOICES,
  },
  {
    lightGround: ['rasta2_light_1', 'rasta2_light_2'],
    lightAir: ['rasta2_light_2'],
    heavy: ['rasta2_heavy'],
    // Tres soplidos del tercer audio: el rasta 2 no tenía esquive.
    dodge: ['rasta2_dodge'],
    hurt: ['rasta2_hurt'],
    // El rasta 2 no tenía sonido al perder una vida: se queda con la frase.
    ko: ['frase_cobrar'],
    ...MOVE_VOICES,
  },
]

/** Todos los archivos que hay que bajar. */
export function allSoundNames(): string[] {
  const names = new Set<string>()
  for (const character of FIGHT_SOUNDS) for (const list of Object.values(character)) list?.forEach((name) => names.add(name))
  return [...names]
}

export function soundUrl(name: string): string {
  return `/sounds/${name}.mp3`
}

/**
 * Qué suena con cada golpe, en orden de preferencia: el sonido propio si el
 * personaje lo tiene, y si no, el de su familia.
 */
export const MOVE_SOUND: Record<MoveKey, readonly SoundKind[]> = {
  nLight: ['nLight', 'lightGround'],
  sLight: ['sLight', 'lightGround'],
  dLight: ['dLight', 'lightGround'],
  nSig: ['nSig', 'heavy'],
  sSig: ['sSig', 'heavy'],
  dSig: ['dSig', 'heavy'],
  nAir: ['nAir', 'lightAir'],
  sAir: ['sAir', 'lightAir'],
  dAir: ['dAir', 'lightAir'],
  recovery: ['recovery', 'heavy'],
  groundPound: ['groundPound', 'heavy'],
}

/** El primer sonido de la lista que ese personaje tiene. Si no tiene ninguno, el último (no suena). */
export function soundFor(slot: PlayerIndex, move: MoveKey): SoundKind {
  const kinds = MOVE_SOUND[move]
  return kinds.find((kind) => (FIGHT_SOUNDS[slot][kind]?.length ?? 0) > 0) ?? kinds[kinds.length - 1]!
}

/** Lo que pasó entre un frame y el siguiente que tiene que sonar. */
export function soundCues(previous: MatchState, state: MatchState): SoundCue[] {
  const cues: SoundCue[] = []
  for (const slot of [0, 1] as const) {
    const before = previous.fighters[slot]
    const now = state.fighters[slot]
    // Un golpe nuevo: entró al estado de ataque, o encadenó otro (cambia el id).
    if (now.state === 'attack' && now.attack && (before.state !== 'attack' || before.hitId !== now.hitId)) {
      cues.push({ slot, kind: soundFor(slot, now.attack) })
    }
    if (now.state === 'dodge' && before.state !== 'dodge') cues.push({ slot, kind: 'dodge' })
    if (now.stocks < before.stocks) cues.push({ slot, kind: 'ko' })
    else if (now.hitstun > 0 && before.hitstun === 0) cues.push({ slot, kind: 'hurt' })
  }
  return cues
}

// ---------------------------------------------------------------------------
// Reproducción
// ---------------------------------------------------------------------------

interface SharedAudio {
  readonly ctx: AudioContext
  readonly buffers: Map<string, Promise<AudioBuffer | null>>
}

let shared: SharedAudio | null = null

function audio(): SharedAudio | null {
  if (shared) return shared
  const Ctx =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
  if (!Ctx) return null
  shared = { ctx: new Ctx(), buffers: new Map() }
  // Los navegadores arrancan el audio en pausa hasta que la persona toca algo.
  const unlock = () => void shared?.ctx.resume()
  for (const type of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(type, unlock, { passive: true })
  return shared
}

function load(name: string): Promise<AudioBuffer | null> {
  const a = audio()
  if (!a) return Promise.resolve(null)
  let buffer = a.buffers.get(name)
  if (!buffer) {
    buffer = fetch(soundUrl(name))
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(response.statusText))))
      .then((data) => a.ctx.decodeAudioData(data))
      .catch(() => null)
    a.buffers.set(name, buffer)
  }
  return buffer
}

export interface FightSoundPlayer {
  /** Hace sonar lo que pasó entre estos dos frames. */
  update(previous: MatchState, state: MatchState): void
}

export function createFightSoundPlayer(volume = 0.8): FightSoundPlayer {
  // Se bajan todos al entrar, así el primer golpe ya suena.
  allSoundNames().forEach((name) => void load(name))
  const turns = new Map<string, number>()

  const play = (name: string): void => {
    const a = audio()
    if (!a || a.ctx.state !== 'running') return
    void load(name).then((buffer) => {
      if (!buffer) return
      const source = a.ctx.createBufferSource()
      const gain = a.ctx.createGain()
      gain.gain.value = volume
      source.buffer = buffer
      source.connect(gain).connect(a.ctx.destination)
      source.start()
    })
  }

  return {
    update(previous, state) {
      for (const cue of soundCues(previous, state)) {
        const options = FIGHT_SOUNDS[cue.slot][cue.kind]
        if (!options || options.length === 0) continue
        const key = `${cue.slot}:${cue.kind}`
        const turn = turns.get(key) ?? 0
        turns.set(key, turn + 1)
        play(options[turn % options.length]!)
      }
    },
  }
}
