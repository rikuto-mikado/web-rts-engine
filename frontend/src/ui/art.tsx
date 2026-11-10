import type { WorkJob } from '../game/types'
import type { OutpostKind } from '../game/outposts'
import type { UnitType } from '../game/types'
import { UnitGlyph } from './common'

/**
 * Small flat illustrations used in menus and the field manual. Drawn as SVG
 * so they stay crisp at any size and match the low-poly look of the map.
 */

const SKY = '#2a3340'
const GRASS = '#4f7a2e'
const GRASS_D = '#3c5f22'
const WOOD = '#7a5532'
const WOOD_D = '#5a3d22'
const STONE = '#a9a294'
const STONE_D = '#7f796d'
const CANVAS = '#e4d8bc'
const WATER = '#3b7ea1'
const PINE = '#2f5d34'
const PINE_L = '#3c7641'

function Frame({ children, size = 96 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 96 64" width={size} height={(size * 64) / 96} className="block shrink-0 rounded-sm" aria-hidden>
      <defs>
        <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3b4a5e" />
          <stop offset="1" stopColor={SKY} />
        </linearGradient>
      </defs>
      <rect width="96" height="64" fill="url(#sky)" />
      {children}
    </svg>
  )
}

const pine = (x: number, y: number, s = 1) => (
  <g key={`p${x}-${y}`} transform={`translate(${x} ${y}) scale(${s})`}>
    <rect x="-1" y="0" width="2" height="4" fill={WOOD_D} />
    <polygon points="-6,1 0,-9 6,1" fill={PINE} />
    <polygon points="-4.5,-4 0,-13 4.5,-4" fill={PINE_L} />
  </g>
)

export function OutpostArt({ kind, size = 96 }: { kind: OutpostKind; size?: number }) {
  switch (kind) {
    case 'camp':
      return (
        <Frame size={size}>
          <rect y="44" width="96" height="20" fill={GRASS} />
          <polygon points="38,46 48,30 58,46" fill={CANVAS} />
          <polygon points="48,30 58,46 53,46" fill="#c9bb98" />
          {Array.from({ length: 13 }, (_, i) => {
            const x = 12 + i * 6
            return <polygon key={i} points={`${x - 2},52 ${x - 2},40 ${x},36 ${x + 2},40 ${x + 2},52`} fill={i % 2 ? WOOD : WOOD_D} />
          })}
          <rect x="47.5" y="18" width="1" height="13" fill={WOOD_D} />
          <polygon points="48.5,18 58,21 48.5,24" fill="#c7372a" />
        </Frame>
      )
    case 'watchtower':
      return (
        <Frame size={size}>
          <polygon points="0,64 0,46 30,36 62,40 96,50 96,64" fill={GRASS_D} />
          <polygon points="0,64 0,52 40,44 96,56 96,64" fill={GRASS} />
          <rect x="42" y="16" width="2" height="26" fill={WOOD_D} />
          <rect x="54" y="16" width="2" height="26" fill={WOOD_D} />
          <line x1="43" y1="38" x2="55" y2="24" stroke={WOOD} strokeWidth="1.2" />
          <line x1="55" y1="38" x2="43" y2="24" stroke={WOOD} strokeWidth="1.2" />
          <rect x="39" y="12" width="20" height="5" fill={WOOD} />
          <polygon points="37,12 49,3 61,12" fill={WOOD_D} />
          <path d="M60 14 Q72 6 84 18" stroke="#e9c869" strokeWidth="0.8" fill="none" strokeDasharray="2 2" />
          <polygon points="84,18 80,16 81,19" fill="#e9c869" />
        </Frame>
      )
    case 'lodge':
      return (
        <Frame size={size}>
          <rect y="44" width="96" height="20" fill={GRASS_D} />
          {[8, 20, 76, 88, 66].map((x, i) => pine(x, 48 - (i % 2) * 3, 1.3))}
          <rect x="30" y="38" width="20" height="10" fill={WOOD} />
          <polygon points="28,38 40,29 52,38" fill="#3d5a2a" />
          <rect x="48" y="41" width="15" height="8" fill={WOOD_D} />
          <polygon points="46,41 55.5,34 65,41" fill="#4a6a32" />
          <rect x="37" y="42" width="5" height="6" fill="#2a1d14" />
          {[38, 58, 46].map((x, i) => pine(x, 56 + (i % 2) * 2, 1.1))}
        </Frame>
      )
    case 'bridgefort':
      return (
        <Frame size={size}>
          <rect y="44" width="96" height="20" fill={GRASS} />
          <path d="M0 52 Q30 47 50 53 T96 52 L96 60 Q60 62 40 58 T0 60Z" fill={WATER} />
          <rect x="54" y="47" width="40" height="3" fill={WOOD} />
          <rect x="60" y="50" width="2" height="7" fill={STONE_D} />
          <rect x="76" y="50" width="2" height="7" fill={STONE_D} />
          <rect x="18" y="30" width="34" height="18" fill={STONE} />
          {[18, 24, 30, 36, 42, 48].map((x) => (
            <rect key={x} x={x} y="27" width="3.5" height="4" fill={STONE} />
          ))}
          <rect x="14" y="22" width="9" height="26" fill={STONE_D} />
          <rect x="47" y="22" width="9" height="26" fill={STONE_D} />
          <polygon points="13,22 18.5,15 24,22" fill="#6b4a35" />
          <polygon points="46,22 51.5,15 57,22" fill="#6b4a35" />
          <rect x="31" y="38" width="8" height="10" rx="4" fill="#2a1d14" />
        </Frame>
      )
    case 'depot':
      return (
        <Frame size={size}>
          <rect y="44" width="96" height="20" fill={GRASS} />
          <polygon points="10,48 20,32 30,48" fill={CANVAS} />
          <rect x="40" y="38" width="22" height="7" fill={WOOD} />
          <path d="M40 38 Q51 26 62 38" fill="#efe6cf" />
          <circle cx="44" cy="47" r="3.5" fill={WOOD_D} />
          <circle cx="58" cy="47" r="3.5" fill={WOOD_D} />
          {[
            [68, 42],
            [75, 42],
            [82, 42],
            [71.5, 35],
            [78.5, 35],
          ].map(([x, y], i) => (
            <rect key={i} x={x} y={y} width="6.5" height="6.5" fill={i % 2 ? '#8a6a40' : '#75572f'} stroke="#4a3520" strokeWidth="0.6" />
          ))}
          <rect x="30" y="49" width="7" height="5" fill="#a8833f" />
        </Frame>
      )
  }
}

/** Engineers' works: abatis, stakes, burning and rebuilding a bridge. */
export function WorkArt({ job, size = 96 }: { job: WorkJob; size?: number }) {
  switch (job) {
    case 'stakes':
      return (
        <Frame size={size}>
          <rect y="44" width="96" height="20" fill={GRASS} />
          {Array.from({ length: 11 }, (_, i) => (
            <polygon key={i} points={`${8 + i * 8},50 ${11 + i * 8},50 ${16 + i * 8},32`} fill={i % 2 ? WOOD : WOOD_D} />
          ))}
          {Array.from({ length: 10 }, (_, i) => (
            <polygon key={`b${i}`} points={`${12 + i * 8},56 ${15 + i * 8},56 ${20 + i * 8},40`} fill={i % 2 ? WOOD_D : WOOD} />
          ))}
        </Frame>
      )
    case 'pit':
      return (
        <Frame size={size}>
          <rect y="40" width="96" height="24" fill={GRASS} />
          <ellipse cx="48" cy="50" rx="36" ry="9" fill="#3b2e20" />
          <ellipse cx="36" cy="49" rx="9" ry="2.5" fill="#4c5a5e" />
          <ellipse cx="60" cy="52" rx="11" ry="2.6" fill="#4c5a5e" />
          {[22, 30, 44, 52, 68, 74].map((x, i) => (
            <polygon key={x} points={`${x},${51 - (i % 2) * 3} ${x + 2},${47 - (i % 2) * 3} ${x + 4},${51 - (i % 2) * 3}`} fill={STONE} />
          ))}
          {[14, 18, 80, 84].map((x) => (
            <line key={x} x1={x} y1="48" x2={x + 1} y2="36" stroke="#6f7a3a" strokeWidth="1.4" />
          ))}
          <text x="48" y="28" textAnchor="middle" fontSize="13" fill={CANVAS} opacity="0.8">?</text>
        </Frame>
      )
    case 'barricade':
      return (
        <Frame size={size}>
          <rect y="44" width="96" height="20" fill={GRASS} />
          <rect y="48" width="96" height="9" fill="#9a8460" />
          <rect x="14" y="40" width="52" height="5" rx="2.5" fill={WOOD_D} />
          <rect x="16" y="35" width="48" height="5" rx="2.5" fill={WOOD} />
          <rect x="18" y="30" width="44" height="5" rx="2.5" fill={WOOD_D} />
          <g transform="rotate(-18 76 38)">
            <rect x="64" y="30" width="22" height="10" fill={WOOD} />
            <circle cx="68" cy="42" r="4.5" fill="none" stroke={WOOD_D} strokeWidth="2" />
            <circle cx="82" cy="42" r="4.5" fill="none" stroke={WOOD_D} strokeWidth="2" />
          </g>
          {[18, 26, 34, 42, 50, 58].map((x) => (
            <line key={x} x1={x} y1="46" x2={x - 5} y2="38" stroke={WOOD} strokeWidth="1.6" />
          ))}
        </Frame>
      )
    case 'pitch':
      return (
        <Frame size={size}>
          <rect y="44" width="96" height="20" fill={GRASS} />
          {[26, 44, 62].map((x, i) => (
            <g key={x}>
              <rect x={x - 7} y={36 + (i % 2) * 3} width="14" height="14" rx="3" fill="#2e2318" />
              <rect x={x - 7} y={39 + (i % 2) * 3} width="14" height="1.6" fill={STONE_D} />
              <rect x={x - 7} y={45 + (i % 2) * 3} width="14" height="1.6" fill={STONE_D} />
            </g>
          ))}
          <path d="M70 36 Q74 22 80 30 Q82 16 88 28 Q90 34 86 38Z" fill="#f08a3a" />
          <path d="M76 36 Q79 28 82 32 Q84 26 86 36Z" fill="#ffd27a" />
          <circle cx="80" cy="12" r="6" fill="#3a342e" opacity="0.6" />
        </Frame>
      )
    case 'bridge':
      return (
        <Frame size={size}>
          <rect y="44" width="96" height="20" fill={GRASS} />
          <path d="M0 50 Q30 46 50 51 T96 50 L96 58 Q60 61 40 57 T0 58Z" fill={WATER} />
          <rect x="14" y="43" width="50" height="3" fill={WOOD} />
          {[22, 38, 54].map((x) => (
            <rect key={x} x={x} y="46" width="2" height="11" fill={WOOD_D} />
          ))}
          <line x1="14" y1="38" x2="64" y2="38" stroke={WOOD_D} strokeWidth="1" />
          <rect x="66" y="40" width="16" height="3" fill={WOOD} transform="rotate(-14 74 41)" />
          <circle cx="84" cy="30" r="3" fill={CANVAS} />
          <rect x="82.5" y="33" width="3" height="9" fill="#2f4f8a" />
        </Frame>
      )
    case 'demolish':
      return (
        <Frame size={size}>
          <rect y="44" width="96" height="20" fill={GRASS} />
          <path d="M0 50 Q30 46 50 51 T96 50 L96 58 Q60 61 40 57 T0 58Z" fill={WATER} />
          <rect x="10" y="43" width="26" height="3" fill={WOOD} />
          <rect x="58" y="43" width="28" height="3" fill={WOOD} />
          <rect x="38" y="48" width="16" height="3" fill={WOOD_D} transform="rotate(24 46 49)" />
          <rect x="22" y="46" width="2" height="11" fill={WOOD_D} />
          <rect x="70" y="46" width="2" height="11" fill={WOOD_D} />
          <circle cx="47" cy="30" r="5" fill="#4a4540" opacity="0.5" />
          <line x1="40" y1="24" x2="54" y2="38" stroke={STONE} strokeWidth="2" />
        </Frame>
      )
  }
}

/** Rock-paper-scissors diagram for the four unit types. */
export function CounterWheel({ units, size = 260 }: { units: UnitType[]; size?: number }) {
  const by = (k: string) => units.find((u) => u.key === k)
  const inf = by('infantry')
  const cav = by('cavalry')
  const arc = by('archers')
  const eng = by('engineers')
  const node = (u: UnitType | undefined, x: number, y: number) =>
    u && (
      <g transform={`translate(${x} ${y})`}>
        <circle r="26" fill="#1b1610" stroke={u.color} strokeWidth="2.5" />
        <foreignObject x="-12" y="-17" width="24" height="24">
          <div style={{ color: u.color }}>
            <UnitGlyph unit={u.key} size={24} />
          </div>
        </foreignObject>
        <text y="18" textAnchor="middle" fontSize="9" fill="#ddd0b2" fontFamily="Alegreya Sans, sans-serif" fontWeight="700">
          {u.name}
        </text>
      </g>
    )
  const arrow = (x1: number, y1: number, x2: number, y2: number, label: string, color = '#86efac') => {
    const dx = x2 - x1
    const dy = y2 - y1
    const d = Math.hypot(dx, dy)
    const ux = dx / d
    const uy = dy / d
    const sx = x1 + ux * 32
    const sy = y1 + uy * 32
    const ex = x2 - ux * 32
    const ey = y2 - uy * 32
    return (
      <g>
        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={color} strokeWidth="2" />
        <polygon points={`${ex},${ey} ${ex - ux * 8 - uy * 5},${ey - uy * 8 + ux * 5} ${ex - ux * 8 + uy * 5},${ey - uy * 8 - ux * 5}`} fill={color} />
        <text x={(sx + ex) / 2 - uy * 11} y={(sy + ey) / 2 + ux * 11} textAnchor="middle" fontSize="8.5" fill={color} fontFamily="Alegreya Sans, sans-serif">
          {label}
        </text>
      </g>
    )
  }
  return (
    <svg viewBox="0 0 260 248" width={size} height={(size * 248) / 260} aria-hidden>
      {arrow(130, 40, 210, 160, 'beats', '#86efac')}
      {arrow(210, 160, 50, 160, 'beats', '#86efac')}
      {arrow(50, 160, 130, 40, 'beats', '#86efac')}
      {eng && arrow(210, 160, 130, 205, 'rides down', '#fca5a5')}
      {node(inf, 130, 40)}
      {node(cav, 210, 160)}
      {node(arc, 50, 160)}
      {eng && (
        <g transform="translate(130 205)">
          <circle r="18" fill="#1b1610" stroke={eng.color} strokeWidth="2" />
          <foreignObject x="-9" y="-12" width="18" height="18">
            <div style={{ color: eng.color }}>
              <UnitGlyph unit={eng.key} size={18} />
            </div>
          </foreignObject>
          <text y="28" textAnchor="middle" fontSize="8.5" fill="#ddd0b2" fontFamily="Alegreya Sans, sans-serif" fontWeight="700">
            {eng.name}
          </text>
        </g>
      )}
    </svg>
  )
}

/** A wide composition bar with unit glyphs and percentages. */
export function MixBar({ mix, units, height = 10 }: { mix: Record<string, number>; units: UnitType[]; height?: number }) {
  const sum = Object.values(mix).reduce((a, b) => a + b, 0) || 1
  return (
    <div className="flex w-full overflow-hidden rounded-sm" style={{ height }}>
      {units.map((u) => {
        const v = mix[u.key] ?? 0
        if (v <= 0) return null
        return <div key={u.key} style={{ width: `${(v / sum) * 100}%`, background: u.color }} title={`${u.name} ${Math.round((v / sum) * 100)}%`} />
      })}
    </div>
  )
}
