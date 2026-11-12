import { Glyph } from './Glyph'
import { Crown, Flame, Shield, Skull, Swords, Wind } from 'lucide-react'
import { useSyncExternalStore, type ReactNode } from 'react'
import type { GameEngine } from '../game/engine'
import type { CommanderDef, FormationKey } from '../game/types'

/** Re-render whenever the engine notifies (a few times per second). */
export function useEngine(engine: GameEngine) {
  return useSyncExternalStore(engine.subscribe, engine.getVersion)
}

/** Small hand-drawn glyphs for unit types (24x24 viewBox). */
const GLYPHS: Record<string, ReactNode> = {
  infantry: (
    <>
      <path d="M15 2 L17 6.5 L15.8 6.5 L15.8 22 L14.2 22 L14.2 6.5 L13 6.5 Z" />
      <path d="M3 7 h9 v7 c0 3.5 -2.5 6 -4.5 7.5 c-2 -1.5 -4.5 -4 -4.5 -7.5z" />
    </>
  ),
  cavalry: (
    <path d="M8 21 L9.5 13 C7 12 6 9 7.5 6.5 L10 4 L11 2 L12.5 4.2 C16 4.5 18.5 7 19 10.5 L19.5 14 L17.5 14.5 L16 11.5 L14.5 13 L15 21 Z" />
  ),
  engineers: (
    <>
      <path d="M13.5 3.5 L20.5 10.5 L18 13 L11 6Z" />
      <path d="M12.5 9.5 L14.5 11.5 L5.5 20.5 C4.9 21.1 4 21.1 3.5 20.5 C2.9 20 2.9 19.1 3.5 18.5Z" />
    </>
  ),
  spearmen: (
    <>
      <path d="M12 2 L14 7 L12.8 7 L12.8 22 L11.2 22 L11.2 7 L10 7 Z" />
      <path d="M8 9 h8 v1.4 h-8z" opacity=".6" />
    </>
  ),
  men_at_arms: (
    <>
      <path d="M5 4 h9 v8 c0 4 -2.5 6.5 -4.5 8 c-2 -1.5 -4.5 -4 -4.5 -8z" />
      <path d="M17.5 3 L19 3 L19 15 L20.5 15 L20.5 16.4 L19 16.4 L19 19 L17.5 19 L17.5 16.4 L16 16.4 L16 15 L17.5 15z" />
    </>
  ),
  archers: (
    <>
      <path d="M6 3 C16 6 16 18 6 21" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6 3 L6 21" stroke="currentColor" strokeWidth=".8" />
      <path d="M4 12 H20 M17 9.5 L20.5 12 L17 14.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </>
  ),
  light_cavalry: (
    <path d="M8 21 L9.5 13 C7 12 6 9 7.5 6.5 L10 4 L11 2 L12.5 4.2 C16 4.5 18.5 7 19 10.5 L19.5 14 L17.5 14.5 L16 11.5 L14.5 13 L15 21 Z" />
  ),
  knights: (
    <>
      <path d="M6 10 C6 5 9 2.5 12 2.5 C15 2.5 18 5 18 10 L18 18 C18 20 16 21.5 12 21.5 C8 21.5 6 20 6 18 Z" />
      <path d="M7.5 10.5 H16.5 V12 H7.5Z M11.3 12 H12.7 V17 H11.3Z" fill="#0b0c0e" />
    </>
  ),
  siege: (
    <>
      <path d="M3 13 L12 6 L21 13 Z" />
      <rect x="4" y="13" width="16" height="3.5" />
      <circle cx="7.5" cy="19" r="2.4" />
      <circle cx="16.5" cy="19" r="2.4" />
    </>
  ),
}

export function UnitGlyph({ unit, size = 16, color }: { unit: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ color }} aria-hidden>
      {GLYPHS[unit] ?? <circle cx="12" cy="12" r="7" />}
    </svg>
  )
}

export function CommanderSigil({ cmd, size = 18 }: { cmd: Pick<CommanderDef, 'sigil'>; size?: number }) {
  if (cmd.sigil === 'raven') return <Glyph name="mask" size={size} strokeWidth={2} />
  const Icon = { shield: Shield, wind: Wind, crown: Crown, flame: Flame, skull: Skull, trident: Swords }[cmd.sigil] ?? Crown
  return <Icon size={size} strokeWidth={2} />
}

export function Bar({ value, max, color, height = 4 }: { value: number; max: number; color: string; height?: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className="w-full overflow-hidden rounded-full bg-white/8" style={{ height }}>
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export function Slider({
  value,
  min = 0,
  max,
  step = 1,
  onChange,
  color,
  disabled,
}: {
  value: number
  min?: number
  max: number
  step?: number
  onChange: (v: number) => void
  color?: string
  disabled?: boolean
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0
  return (
    <input
      type="range"
      className="slider"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ['--pct' as string]: `${pct}%`, ['--fill' as string]: color }}
    />
  )
}

export function moraleColor(m: number) {
  return m > 60 ? '#6fd08c' : m > 30 ? '#eccf72' : '#f0614a'
}

export const STATUS_TEXT: Record<string, string> = {
  idle: 'Holding',
  marching: 'Marching',
  battle: 'In battle',
  sieging: 'Besieging',
  retreating: 'Retreating',
}

/** Tiny diagrams of each formation (dots seen from above, front at the top). */
export function FormationIcon({ formation, size = 22 }: { formation: FormationKey | 'column'; size?: number }) {
  const dots: [number, number][] = []
  if (formation === 'line') for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) dots.push([3 + c * 3.6, 9 + r * 4])
  if (formation === 'loose') for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) dots.push([2.5 + c * 6.2 + (r % 2) * 2.5, 7 + r * 7])
  if (formation === 'wedge') for (let r = 0; r < 4; r++) for (let c = 0; c <= r; c++) dots.push([12 - r * 2.6 + c * 5.2, 4 + r * 4.6])
  if (formation === 'square') {
    for (let i = 0; i < 4; i++) {
      dots.push([5 + i * 4.6, 5], [5 + i * 4.6, 19])
      if (i > 0 && i < 3) dots.push([5, 5 + i * 4.6], [18.8, 5 + i * 4.6])
    }
    dots.push([12, 12])
  }
  if (formation === 'column') for (let r = 0; r < 5; r++) for (let c = 0; c < 2; c++) dots.push([9.5 + c * 5, 3 + r * 4.4])
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.5} />
      ))}
    </svg>
  )
}

export const RELATION_COLOR = {
  self: '#5f93ec',
  ally: '#4fd1c5',
  enemy: '#f0614a',
  neutral: '#d9b44a',
} as const

export function Tab({ active, onClick, children, badge }: { active: boolean; onClick: () => void; children: ReactNode; badge?: number }) {
  return (
    <button onClick={onClick} data-active={active} className="ribbon-tab">
      {children}
      {!!badge && <span className="absolute top-0.5 right-1 grid size-4 place-items-center rounded-full bg-ember-500 font-sans text-[11px] text-white">{badge}</span>}
    </button>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <h3 className="ornament flex-1">
        <span>{children}</span>
      </h3>
      {right}
    </div>
  )
}

export function StackBar({ troops, units, height = 5 }: { troops: Record<string, number>; units: { key: string; color: string }[]; height?: number }) {
  const n = Object.values(troops).reduce((a, b) => a + Math.max(0, b), 0)
  return (
    <div className="flex w-full overflow-hidden rounded-full bg-white/6" style={{ height }}>
      {n > 0 &&
        units.map((u) => {
          const v = troops[u.key] ?? 0
          if (v < 1) return null
          return <div key={u.key} style={{ width: `${(v / n) * 100}%`, background: u.color }} />
        })}
    </div>
  )
}
