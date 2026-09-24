import { BOT_LEVEL_LABELS, BOT_LEVEL_ORDER, type BotLevel } from '../../fight/bot/levels'

interface Props {
  value: BotLevel
  onChange: (level: BotLevel) => void
}

/** Fácil / Medio / Difícil, para pelear contra la máquina. */
export function BotLevelPicker({ value, onChange }: Props) {
  return (
    <div className="bot-levels" role="radiogroup" aria-label="Dificultad">
      {BOT_LEVEL_ORDER.map((level) => (
        <button
          key={level}
          type="button"
          role="radio"
          aria-checked={level === value}
          data-level={level}
          className={level === value ? 'bot-levels__btn is-active' : 'bot-levels__btn'}
          onClick={() => onChange(level)}
        >
          {BOT_LEVEL_LABELS[level]}
        </button>
      ))}
    </div>
  )
}
