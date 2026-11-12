import { useId, type ReactNode } from 'react'
import type { WorkJob } from '../game/types'
import type { OutpostKind } from '../game/outposts'
import type { UnitType } from '../game/types'
import { UnitGlyph } from './common'

/*
 * Small painted illustrations for menus and the field manual: a dusk sky with
 * a low sun on the right, layered hills, lit ground, and each subject built of
 * shaded logs, stone courses and canvas with rim light from the sun side and
 * soft contact shadows. Drawn as SVG so they stay crisp at any size.
 */

const P = {
  wood: '#7a5532',
  woodL: '#a77a4a',
  woodD: '#4a321c',
  stone: '#aaa395',
  stoneL: '#cfc8b8',
  stoneD: '#77706a',
  canvas: '#ece0c2',
  canvasD: '#b9a985',
  iron: '#3a3936',
  rim: '#ffe2a8',
  water: '#3b7ea1',
  red: '#a8332a',
  blue: '#2f4f8a',
}

type U = (name: string) => string

/** The shared scene: sky, sun, two ranges of hills, ground, then the subject, then vignette and grain. */
function Scene({ children, size = 96, ground = 46, dusk = false }: { children: (u: U) => ReactNode; size?: number; ground?: number; dusk?: boolean }) {
  const id = useId().replace(/:/g, '')
  const u: U = (n) => `url(#${n}-${id})`
  const d = (n: string) => `${n}-${id}`
  return (
    <svg viewBox="0 0 96 64" width={size} height={(size * 64) / 96} className="block shrink-0 rounded-sm" aria-hidden>
      <defs>
        <linearGradient id={d('sky')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={dusk ? '#1d2433' : '#2c3a4c'} />
          <stop offset="0.55" stopColor={dusk ? '#5a4a52' : '#6a7f99'} />
          <stop offset="1" stopColor={dusk ? '#d0875a' : '#f0c98a'} />
        </linearGradient>
        <radialGradient id={d('sun')} cx="0.82" cy="0.32" r="0.45">
          <stop offset="0" stopColor="#fff1c8" stopOpacity="0.95" />
          <stop offset="0.2" stopColor="#ffd890" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffd890" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={d('ground')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#7d9a44" />
          <stop offset="1" stopColor="#38551f" />
        </linearGradient>
        {/* A log seen from the side: dark edges, a lit face towards the sun. */}
        <linearGradient id={d('log')} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={P.woodD} />
          <stop offset="0.55" stopColor={P.wood} />
          <stop offset="0.85" stopColor={P.woodL} />
          <stop offset="1" stopColor={P.wood} />
        </linearGradient>
        <linearGradient id={d('plank')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={P.woodL} />
          <stop offset="1" stopColor={P.woodD} />
        </linearGradient>
        <pattern id={d('grain')} width="6" height="2.4" patternUnits="userSpaceOnUse">
          <path d="M0 1.2 Q1.5 0.6 3 1.2 T6 1.2" stroke="#2a1a0e" strokeOpacity="0.35" strokeWidth="0.25" fill="none" />
        </pattern>
        <linearGradient id={d('stone')} x1="0" x2="1" y1="0" y2="0.4">
          <stop offset="0" stopColor={P.stoneD} />
          <stop offset="0.7" stopColor={P.stone} />
          <stop offset="1" stopColor={P.stoneL} />
        </linearGradient>
        <pattern id={d('courses')} width="6" height="3" patternUnits="userSpaceOnUse">
          <path d="M0 3 H6 M3 0 V1.5 M0 1.5 H6 M0 1.5 V3" stroke="#3a3530" strokeOpacity="0.45" strokeWidth="0.25" fill="none" />
        </pattern>
        <linearGradient id={d('canvas')} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={P.canvasD} />
          <stop offset="0.6" stopColor={P.canvas} />
          <stop offset="1" stopColor="#fff6dc" />
        </linearGradient>
        <linearGradient id={d('earth')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#9a8058" />
          <stop offset="1" stopColor="#5e4a30" />
        </linearGradient>
        <linearGradient id={d('water')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#6fb0cf" />
          <stop offset="1" stopColor="#24597a" />
        </linearGradient>
        <radialGradient id={d('fire')} cx="0.5" cy="0.8" r="0.6">
          <stop offset="0" stopColor="#fff2b0" />
          <stop offset="0.4" stopColor="#ffb04a" />
          <stop offset="1" stopColor="#d2451e" />
        </radialGradient>
        <radialGradient id={d('vig')} cx="0.5" cy="0.5" r="0.75">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.55" />
        </radialGradient>
        <filter id={d('soft')} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
        <filter id={d('noise')}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
          <feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.45  0 0 0 0 0.35  0 0 0 0.18 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <rect width="96" height="64" fill={u('sky')} />
      <rect width="96" height="64" fill={u('sun')} />
      <path d={`M0 ${ground - 8} Q14 ${ground - 15} 28 ${ground - 10} T58 ${ground - 12} T96 ${ground - 9} V${ground} H0Z`} fill="#6f8396" opacity="0.7" />
      <path d={`M0 ${ground - 3} Q20 ${ground - 9} 40 ${ground - 4} T80 ${ground - 5} T96 ${ground - 3} V${ground} H0Z`} fill="#56713e" opacity="0.9" />
      <rect y={ground} width="96" height={64 - ground} fill={u('ground')} />
      <path d={`M0 ${ground} H96`} stroke="#c9d98a" strokeOpacity="0.35" strokeWidth="0.5" />
      {children(u)}
      <rect width="96" height="64" fill={u('vig')} />
      <rect width="96" height="64" fill="#fff" filter={u('noise')} opacity="0.28" />
    </svg>
  )
}

/** A soft contact shadow on the ground. */
const Shadow = ({ u, cx, cy, rx, ry = 1.8 }: { u: U; cx: number; cy: number; rx: number; ry?: number }) => <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#10180a" opacity="0.45" filter={u('soft')} />

/** A sharpened palisade log with grain and a rim of sunlight on its right edge. */
const Log = ({ u, x, y, h, w = 3.6 }: { u: U; x: number; y: number; h: number; w?: number }) => (
  <g>
    <path d={`M${x - w / 2} ${y} V${y - h} L${x} ${y - h - w * 1.1} L${x + w / 2} ${y - h} V${y}Z`} fill={u('log')} />
    <rect x={x - w / 2} y={y - h} width={w} height={h} fill={u('grain')} />
    <path d={`M${x + w / 2 - 0.3} ${y} V${y - h} L${x} ${y - h - w * 1.1}`} stroke={P.rim} strokeOpacity="0.55" strokeWidth="0.35" fill="none" />
  </g>
)

/** A spoked wheel. */
const Wheel = ({ cx, cy, r }: { cx: number; cy: number; r: number }) => (
  <g>
    <circle cx={cx} cy={cy} r={r} fill="none" stroke={P.woodD} strokeWidth={r * 0.32} />
    <circle cx={cx} cy={cy} r={r} fill="none" stroke={P.woodL} strokeWidth="0.3" strokeOpacity="0.6" />
    {[0, 60, 120].map((a) => (
      <line key={a} x1={cx + Math.cos((a * Math.PI) / 180) * r} y1={cy + Math.sin((a * Math.PI) / 180) * r} x2={cx - Math.cos((a * Math.PI) / 180) * r} y2={cy - Math.sin((a * Math.PI) / 180) * r} stroke={P.woodD} strokeWidth="0.6" />
    ))}
    <circle cx={cx} cy={cy} r={r * 0.28} fill={P.iron} />
  </g>
)

/** A bell tent with a pole, a shaded flank and an open door. */
const Tent = ({ u, x, y, w, h, flag }: { u: U; x: number; y: number; w: number; h: number; flag?: string }) => (
  <g>
    <Shadow u={u} cx={x + 1.5} cy={y + 0.5} rx={w * 0.6} />
    <path d={`M${x - w / 2} ${y} Q${x - w * 0.2} ${y - h * 0.55} ${x} ${y - h} Q${x + w * 0.2} ${y - h * 0.55} ${x + w / 2} ${y}Z`} fill={u('canvas')} />
    <path d={`M${x} ${y - h} L${x - w * 0.12} ${y} L${x + w * 0.12} ${y}Z`} fill="#3a2e22" opacity="0.8" />
    <path d={`M${x - w / 2} ${y} H${x + w / 2}`} stroke={P.canvasD} strokeWidth="0.6" />
    <line x1={x} y1={y - h} x2={x} y2={y - h - 4} stroke={P.woodD} strokeWidth="0.5" />
    {flag && <path d={`M${x} ${y - h - 4} l4 1 l-4 1.2Z`} fill={flag} />}
  </g>
)

/** A pennant on a pole. */
const Pennant = ({ x, y, h, color }: { x: number; y: number; h: number; color: string }) => (
  <g>
    <line x1={x} y1={y} x2={x} y2={y - h} stroke={P.woodD} strokeWidth="0.7" />
    <path d={`M${x} ${y - h} Q${x + 5} ${y - h + 0.5} ${x + 9} ${y - h + 2} Q${x + 5} ${y - h + 2.5} ${x} ${y - h + 4.5}Z`} fill={color} />
    <path d={`M${x} ${y - h} Q${x + 5} ${y - h + 0.5} ${x + 9} ${y - h + 2}`} stroke="#fff" strokeOpacity="0.35" strokeWidth="0.3" fill="none" />
  </g>
)

/** A crate with planks and a lit top. */
const Crate = ({ x, y, s }: { x: number; y: number; s: number }) => (
  <g>
    <rect x={x} y={y - s} width={s} height={s} fill={P.wood} stroke={P.woodD} strokeWidth="0.4" />
    <path d={`M${x} ${y - s} l${s * 0.3} ${-s * 0.25} h${s} l${-s * 0.3} ${s * 0.25}Z`} fill={P.woodL} />
    <path d={`M${x + s} ${y - s} l${s * 0.3} ${-s * 0.25} v${s} l${-s * 0.3} ${s * 0.25}Z`} fill={P.woodD} />
    <path d={`M${x} ${y - s / 2} h${s} M${x + 0.4} ${y - 0.4} L${x + s - 0.4} ${y - s + 0.4}`} stroke={P.woodD} strokeWidth="0.35" />
  </g>
)

/** A flame with an inner core and a smoke wisp. */
const Flame = ({ u, x, y, s = 1 }: { u: U; x: number; y: number; s?: number }) => (
  <g>
    <circle cx={x} cy={y - 3 * s} r={6 * s} fill="#ffb04a" opacity="0.18" filter={u('soft')} />
    <path d={`M${x - 3 * s} ${y} Q${x - 4 * s} ${y - 5 * s} ${x - 0.5 * s} ${y - 9 * s} Q${x} ${y - 5 * s} ${x + 1.5 * s} ${y - 7 * s} Q${x + 4 * s} ${y - 4 * s} ${x + 3 * s} ${y}Z`} fill={u('fire')} />
    <path d={`M${x - 1.2 * s} ${y} Q${x - 1.5 * s} ${y - 3 * s} ${x} ${y - 5 * s} Q${x + 1.6 * s} ${y - 3 * s} ${x + 1.2 * s} ${y}Z`} fill="#fff2b0" />
    <path d={`M${x} ${y - 10 * s} q-3 -4 1 -8 q3 -3 0 -7`} stroke="#5a524a" strokeOpacity="0.45" strokeWidth={1.6 * s} fill="none" strokeLinecap="round" />
  </g>
)

/** A stone wall section with courses and crenels. */
const Wall = ({ u, x, y, w, h, crenels = true }: { u: U; x: number; y: number; w: number; h: number; crenels?: boolean }) => (
  <g>
    <rect x={x} y={y - h} width={w} height={h} fill={u('stone')} />
    <rect x={x} y={y - h} width={w} height={h} fill={u('courses')} />
    {crenels && Array.from({ length: Math.floor(w / 4) }, (_, i) => <rect key={i} x={x + i * 4 + 0.5} y={y - h - 3} width="2.4" height="3" fill={u('stone')} />)}
    <path d={`M${x + w - 0.3} ${y} V${y - h}`} stroke={P.rim} strokeOpacity="0.5" strokeWidth="0.4" />
  </g>
)

export function OutpostArt({ kind, size = 96 }: { kind: OutpostKind; size?: number }) {
  switch (kind) {
    case 'castrum':
      return (
        <Scene size={size}>
          {(u) => (
            <>
              <path d="M2 54 Q48 48 94 54 V58 H2Z" fill={u('earth')} />
              {[16, 30, 64, 78].map((x) => <Tent key={x} u={u} x={x} y={48} w={8} h={8} />)}
              <Tent u={u} x={47} y={48} w={13} h={12} flag={P.red} />
              <Shadow u={u} cx={50} cy={56} rx={44} ry={2.4} />
              {Array.from({ length: 21 }, (_, i) => {
                const x = 7 + i * 4.1
                if (x > 40 && x < 56) return null
                return <Log key={i} u={u} x={x} y={56} h={10 + (i % 3) * 0.7} />
              })}
              {/* Open gate under a fighting platform. */}
              <rect x="40" y="40" width="16" height="2" fill={u('plank')} />
              <path d="M41 56 L44 46 L44 56Z" fill={P.woodD} />
              <path d="M55 56 L52 46 L52 56Z" fill={P.woodD} />
              {[7, 89].map((x) => (
                <g key={x}>
                  {[-3, 3].map((o) => <rect key={o} x={x + o - 0.7} y="26" width="1.4" height="30" fill={u('log')} />)}
                  <path d={`M${x - 3} 52 L${x + 3} 34 M${x + 3} 52 L${x - 3} 34`} stroke={P.woodD} strokeWidth="0.6" />
                  <rect x={x - 5.5} y="23" width="11" height="4" fill={u('plank')} />
                  <rect x={x - 5.5} y="23" width="11" height="4" fill={u('grain')} />
                  <path d={`M${x - 7} 23 L${x} 15 L${x + 7} 23Z`} fill={P.woodD} />
                  <path d={`M${x} 15 L${x + 7} 23`} stroke={P.rim} strokeOpacity="0.5" strokeWidth="0.4" />
                </g>
              ))}
              <Pennant x={89} y={15} h={7} color={P.blue} />
            </>
          )}
        </Scene>
      )
    case 'laager':
      return (
        <Scene size={size}>
          {(u) => (
            <>
              <Flame u={u} x={48} y={46} s={0.6} />
              {[16, 48, 80].map((x, i) => (
                <g key={x}>
                  <Shadow u={u} cx={x + 2} cy={55} rx={14} />
                  {/* Canvas tilt on hoops. */}
                  <path d={`M${x - 12} 44 Q${x} ${30 - (i % 2)} ${x + 12} 44Z`} fill={u('canvas')} />
                  {[-6, 0, 6].map((o) => <path key={o} d={`M${x + o - 2} 44 Q${x + o} ${33} ${x + o + 2} 44`} stroke={P.canvasD} strokeWidth="0.4" fill="none" />)}
                  <rect x={x - 13} y="44" width="26" height="6" fill={u('plank')} />
                  <rect x={x - 13} y="44" width="26" height="6" fill={u('grain')} />
                  {/* Pavises along the side. */}
                  {[-9, -3, 3, 9].map((o, j) => (
                    <g key={o}>
                      <path d={`M${x + o - 2.6} 43 h5.2 v6.5 q-2.6 2 -5.2 0Z`} fill={j % 2 ? P.red : '#d8c9a0'} stroke={P.woodD} strokeWidth="0.3" />
                      <rect x={x + o - 0.5} y="43" width="1" height="7.6" fill={P.iron} opacity="0.7" />
                    </g>
                  ))}
                  <Wheel cx={x - 8} cy={52} r={3.6} />
                  <Wheel cx={x + 8} cy={52} r={3.6} />
                </g>
              ))}
              {[32, 64].map((x) => <path key={x} d={`M${x - 3} 49 q1.5 1.5 3 0 q1.5 -1.5 3 0`} stroke={P.iron} strokeWidth="0.9" fill="none" />)}
              <path d="M30 30 L20 22 M66 30 L76 20" stroke="#ffe08a" strokeWidth="0.6" strokeDasharray="1.5 1.5" />
            </>
          )}
        </Scene>
      )
    case 'redoubt':
      return (
        <Scene size={size}>
          {(u) => (
            <>
              <path d="M2 56 Q48 40 94 56 V60 H2Z" fill={u('earth')} />
              <path d="M2 56 Q48 40 94 56" stroke="#c9b48a" strokeOpacity="0.4" strokeWidth="0.6" fill="none" />
              {/* Gabions along the crest. */}
              {[8, 16, 74, 82, 90].map((x) => (
                <g key={x}>
                  <rect x={x - 2.6} y={50 - (x > 50 ? (94 - x) : x) * 0.12} width="5.2" height="5" rx="1" fill="#8a7048" />
                  <path d={`M${x - 2.6} ${51 - (x > 50 ? (94 - x) : x) * 0.12} h5.2 m-5.2 1.6 h5.2 m-5.2 1.6 h5.2`} stroke="#5e4a2e" strokeWidth="0.35" />
                </g>
              ))}
              {/* Mangonel: frame, uprights, arm, sling, counterweight. */}
              <rect x="22" y="44" width="24" height="3" fill={u('plank')} />
              <path d="M26 44 L31 26 L36 44 M32 44 L37 26 L42 44" stroke={P.woodD} strokeWidth="1.4" fill="none" />
              <circle cx="34" cy="27" r="1.4" fill={P.iron} />
              <path d="M18 36 L58 12" stroke={u('log')} strokeWidth="2.4" />
              <path d="M18 36 L58 12" stroke={P.wood} strokeWidth="2.2" />
              <path d="M18.5 35 L57.5 11.3" stroke={P.rim} strokeOpacity="0.5" strokeWidth="0.4" />
              <rect x="13" y="33" width="9" height="8" fill={u('plank')} />
              {[15, 18.5].map((x) => <circle key={x} cx={x} cy={32.2} r="1.6" fill={P.stone} />)}
              <path d="M58 12 L62 18" stroke="#b8ab8a" strokeWidth="0.4" />
              <circle cx="62" cy="19" r="1.6" fill={P.stoneD} />
              {/* Ballista on its post. */}
              <rect x="70" y="38" width="1.6" height="8" fill={P.woodD} />
              <rect x="62" y="36" width="18" height="2" fill={P.wood} />
              <path d="M62 37 Q71 31 80 37" stroke={P.woodD} strokeWidth="1.2" fill="none" />
              <path d="M62 37 L71 39 L80 37" stroke="#d8ccae" strokeWidth="0.35" fill="none" />
              {/* A stone in flight. */}
              <path d="M62 19 Q76 2 90 10" stroke="#ffe08a" strokeWidth="0.6" fill="none" strokeDasharray="1.6 1.6" />
              <circle cx="90" cy="10" r="2" fill={P.stone} />
              <circle cx="89.4" cy="9.4" r="0.7" fill={P.stoneL} />
              {[26, 30, 34].map((x, i) => <circle key={x} cx={x + (i === 1 ? 2 : 0)} cy={i === 1 ? 48 : 50} r="1.6" fill={P.stone} />)}
            </>
          )}
        </Scene>
      )
    case 'pavilion':
      return (
        <Scene size={size} dusk>
          {(u) => (
            <>
              <Shadow u={u} cx={50} cy={53} rx={32} ry={2.2} />
              {[[30, 0], [56, 1]].map(([x, i]) => (
                <g key={x}>
                  <path d={`M${x - 13} 52 L${x} 38 L${x + 13} 52Z`} fill={i ? '#5a5a36' : '#56683a'} />
                  <path d={`M${x} 38 L${x + 13} 52 L${x + 6} 52Z`} fill="#000" opacity="0.18" />
                  <path d={`M${x - 3} 52 L${x} 45 L${x + 3} 52Z`} fill="#1a1c12" />
                  {/* Cut branches over the canvas. */}
                  {[-7, -2, 3, 8].map((o) => <path key={o} d={`M${x + o - 2} ${44 + Math.abs(o) * 0.5} q2 -2 4 0`} stroke={o % 2 ? '#6a8a3a' : '#3f5a26'} strokeWidth="1.4" fill="none" />)}
                </g>
              ))}
              {/* Netting on poles. */}
              <path d="M20 34 Q48 30 76 34" stroke="#55693a" strokeWidth="1.6" fill="none" />
              <path d="M20 34 Q48 30 76 34" stroke="#8aa060" strokeWidth="0.3" strokeDasharray="0.8 1" fill="none" />
              {[20, 76].map((x) => <line key={x} x1={x} y1="34" x2={x} y2="52" stroke={P.woodD} strokeWidth="0.7" />)}
              {/* Brush screens in front. */}
              {[6, 14, 82, 90, 70].map((x, i) => <ellipse key={x} cx={x} cy={52 - (i % 2) * 2} rx="7" ry="5" fill={i % 2 ? '#3f5a26' : '#4c6a32'} />)}
              {[6, 82].map((x) => <path key={x} d={`M${x - 4} 49 q4 -4 8 0`} stroke="#8aa060" strokeOpacity="0.6" strokeWidth="0.5" fill="none" />)}
              {/* Riding out at speed. */}
              <path d="M58 58 L92 58" stroke="#ffe08a" strokeWidth="0.8" strokeDasharray="3 2" />
              <polygon points="93,58 88,55.6 88,60.4" fill="#ffe08a" />
            </>
          )}
        </Scene>
      )
    case 'depot':
      return (
        <Scene size={size}>
          {(u) => (
            <>
              {/* Storehouse: stone footing, timber frame, a hoist at the gable. */}
              <Shadow u={u} cx={32} cy={52} rx={22} ry={2.2} />
              <rect x="12" y="46" width="38" height="5" fill={u('stone')} />
              <rect x="12" y="46" width="38" height="5" fill={u('courses')} />
              <rect x="13" y="32" width="36" height="14" fill="#dccdaa" />
              {[13, 22, 31, 40, 48].map((x) => <rect key={x} x={x} y="32" width="1.2" height="14" fill={P.woodD} />)}
              <path d="M13 39 H49" stroke={P.woodD} strokeWidth="0.8" />
              <path d="M14 32 L22 39 M40 32 L48 39" stroke={P.woodD} strokeWidth="0.6" />
              <path d="M9 32 L31 18 L53 32Z" fill={u('plank')} />
              <path d="M31 18 L53 32" stroke={P.rim} strokeOpacity="0.5" strokeWidth="0.5" />
              <rect x="27" y="40" width="6" height="6" fill="#2a1d14" />
              <rect x="29" y="23" width="4" height="5" fill="#2a1d14" />
              <path d="M31 21 H40 M39 21 V30" stroke={P.woodD} strokeWidth="0.7" fill="none" />
              <rect x="37.6" y="30" width="3" height="2.4" fill={P.wood} />
              {/* Wagon and stacked stores. */}
              <Shadow u={u} cx={66} cy={55} rx={12} />
              <path d="M56 46 Q66 36 76 46Z" fill={u('canvas')} />
              <rect x="55" y="46" width="22" height="4" fill={u('plank')} />
              <Wheel cx={60} cy={52} r={3.4} />
              <Wheel cx={72} cy={52} r={3.4} />
              <Crate x={80} y={54} s={5} />
              <Crate x={84} y={49} s={4.4} />
              <Crate x={86} y={54} s={5} />
              <ellipse cx="50" cy="54" rx="3.5" ry="2.2" fill="#cdbf98" />
              <ellipse cx="54" cy="55" rx="3" ry="2" fill="#bfae86" />
            </>
          )}
        </Scene>
      )
  }
}

/** Engineers' works: field defences and traps, bridges, siege engines. */
export function WorkArt({ job, size = 96 }: { job: WorkJob; size?: number }) {
  switch (job) {
    case 'stakes':
      return (
        <Scene size={size}>
          {(u) => (
            <>
              <Shadow u={u} cx={50} cy={56} rx={42} ry={2.4} />
              {Array.from({ length: 11 }, (_, i) => (
                <g key={i}>
                  <path d={`M${7 + i * 8} 52 L${11 + i * 8} 52 L${19 + i * 8} 32Z`} fill={u('log')} />
                  <path d={`M${11 + i * 8} 52 L${19 + i * 8} 32`} stroke={P.rim} strokeOpacity="0.5" strokeWidth="0.35" />
                  <path d={`M${17.6 + i * 8} 35.5 L${19 + i * 8} 32 L${16.4 + i * 8} 34.8Z`} fill="#e3c99a" />
                </g>
              ))}
              {Array.from({ length: 10 }, (_, i) => <path key={`b${i}`} d={`M${11 + i * 8} 58 L${15 + i * 8} 58 L${22 + i * 8} 41Z`} fill={i % 2 ? P.woodD : P.wood} />)}
            </>
          )}
        </Scene>
      )
    case 'pit':
      return (
        <Scene size={size} ground={42}>
          {(u) => (
            <>
              <ellipse cx="48" cy="52" rx="37" ry="9.6" fill={u('earth')} />
              <ellipse cx="48" cy="52" rx="35" ry="8.4" fill="#2a2014" />
              <ellipse cx="48" cy="50.5" rx="34" ry="7.2" fill="#3b2e20" />
              <ellipse cx="36" cy="52" rx="9" ry="2.2" fill="#4c5a5e" />
              <ellipse cx="60" cy="54" rx="11" ry="2.4" fill="#4c5a5e" />
              <ellipse cx="58" cy="53.4" rx="5" ry="0.7" fill="#9ab8c4" opacity="0.5" />
              {/* Caltrops. */}
              {[22, 30, 44, 52, 68, 74].map((x, i) => (
                <g key={x}>
                  <path d={`M${x} ${53 - (i % 2) * 3} l2 -3.5 l2 3.5 M${x + 2} ${49.5 - (i % 2) * 3} v-2`} stroke={P.stoneL} strokeWidth="0.7" fill="none" />
                </g>
              ))}
              {/* Brushwood hiding the edge. */}
              {[12, 16, 20, 78, 82, 86].map((x, i) => <line key={x} x1={x} y1={50} x2={x + (i % 2 ? 2 : -2)} y2={38} stroke="#6f7a3a" strokeWidth="1.2" />)}
              <path d="M14 48 Q48 40 82 48" stroke="#7d9a44" strokeWidth="1.4" fill="none" strokeDasharray="2 2" opacity="0.8" />
              <text x="48" y="30" textAnchor="middle" fontSize="12" fontWeight="700" fill={P.canvas} opacity="0.85">?</text>
            </>
          )}
        </Scene>
      )
    case 'barricade':
      return (
        <Scene size={size}>
          {(u) => (
            <>
              <path d="M0 50 H96 V59 H0Z" fill="#9a8460" />
              <path d="M0 50 H96" stroke="#c9b48a" strokeOpacity="0.5" strokeWidth="0.5" />
              <Shadow u={u} cx={40} cy={52} rx={30} ry={2.2} />
              {[[14, 44, 52, 5], [16, 39, 48, 5], [19, 34, 42, 5]].map(([x, y, w, h], i) => (
                <g key={i}>
                  <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={u('log')} />
                  <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={u('grain')} />
                  <circle cx={x + w - h / 2} cy={y + h / 2} r={h / 2 - 0.4} fill="#c8a874" />
                  <circle cx={x + w - h / 2} cy={y + h / 2} r={h / 4} fill="none" stroke="#8a6a40" strokeWidth="0.3" />
                </g>
              ))}
              {[18, 26, 34, 42, 50, 58].map((x) => <line key={x} x1={x} y1="48" x2={x - 6} y2="38" stroke={P.wood} strokeWidth="1.4" />)}
              <g transform="rotate(-16 78 42)">
                <rect x="66" y="34" width="22" height="9" fill={u('plank')} />
                <rect x="66" y="34" width="22" height="9" fill={u('grain')} />
                <Wheel cx={70} cy={45} r={4.2} />
                <Wheel cx={84} cy={45} r={4.2} />
              </g>
            </>
          )}
        </Scene>
      )
    case 'pitch':
      return (
        <Scene size={size} dusk>
          {(u) => (
            <>
              {[24, 42, 60].map((x, i) => (
                <g key={x}>
                  <Shadow u={u} cx={x + 1} cy={53 + (i % 2) * 2} rx={8} />
                  <rect x={x - 7} y={37 + (i % 2) * 2} width="14" height="15" rx="3.5" fill="#2e2318" />
                  <rect x={x - 7} y={37 + (i % 2) * 2} width="14" height="15" rx="3.5" fill={u('grain')} />
                  {[40, 47].map((y) => <rect key={y} x={x - 7.2} y={y + (i % 2) * 2} width="14.4" height="1.6" fill={P.stoneD} />)}
                  <ellipse cx={x} cy={37.6 + (i % 2) * 2} rx="6.2" ry="1.6" fill="#120c06" />
                  <path d={`M${x + 6.6} ${38 + (i % 2) * 2} V${51 + (i % 2) * 2}`} stroke={P.rim} strokeOpacity="0.4" strokeWidth="0.4" />
                </g>
              ))}
              <Flame u={u} x={80} y={50} s={1.5} />
            </>
          )}
        </Scene>
      )
    case 'bridge':
      return (
        <Scene size={size}>
          {(u) => (
            <>
              <path d="M0 50 Q30 46 50 51 T96 50 L96 60 Q60 63 40 59 T0 60Z" fill={u('water')} />
              <path d="M10 53 h10 M48 56 h12 M70 52 h8" stroke="#cfe6f0" strokeOpacity="0.6" strokeWidth="0.5" />
              {[22, 38, 54].map((x) => (
                <g key={x}>
                  <rect x={x} y="45" width="2.4" height="13" fill={u('log')} />
                  <path d={`M${x - 3} 58 L${x + 1.2} 46 L${x + 5.4} 58`} stroke={P.woodD} strokeWidth="0.6" fill="none" />
                </g>
              ))}
              <rect x="12" y="42" width="54" height="3.4" fill={u('plank')} />
              <rect x="12" y="42" width="54" height="3.4" fill={u('grain')} />
              {Array.from({ length: 9 }, (_, i) => <line key={i} x1={14 + i * 6} y1="42" x2={14 + i * 6} y2="45.4" stroke={P.woodD} strokeWidth="0.3" />)}
              <path d="M12 37 Q39 39 66 37" stroke="#b8ab8a" strokeWidth="0.6" fill="none" />
              {[12, 30, 48, 66].map((x) => <line key={x} x1={x} y1="37" x2={x} y2="42" stroke={P.woodD} strokeWidth="0.7" />)}
              <rect x="68" y="39" width="18" height="3" fill={u('plank')} transform="rotate(-14 77 40)" />
              {/* An engineer carrying a plank. */}
              <circle cx="86" cy="29" r="2.4" fill="#d8b08a" />
              <rect x="84.4" y="31.4" width="3.2" height="8" rx="1" fill={P.blue} />
              <path d="M84.6 39.4 l-0.8 4 M87.4 39.4 l0.8 4" stroke="#3a2a1c" strokeWidth="1" />
            </>
          )}
        </Scene>
      )
    case 'tower':
      return (
        <Scene size={size} ground={52}>
          {(u) => (
            <>
              <Wall u={u} x={60} y={54} w={34} h={34} />
              <rect x="70" y="36" width="1.6" height="5" fill="#2a2420" />
              <Shadow u={u} cx={34} cy={56} rx={16} />
              <rect x="20" y="14" width="26" height="38" fill={u('plank')} />
              {[14, 26, 38].map((y) => <rect key={y} x="20" y={y} width="26" height="12" fill={y % 24 === 14 ? '#8a6a48' : '#7a5a3c'} opacity="0.9" />)}
              <rect x="20" y="14" width="26" height="38" fill={u('grain')} />
              {[26, 38].map((y) => <rect key={y} x="19" y={y - 0.8} width="28" height="1.6" fill={P.woodD} />)}
              <path d="M45.6 14 V52" stroke={P.rim} strokeOpacity="0.5" strokeWidth="0.5" />
              {/* Hides hung against fire, and the drawbridge falling onto the wall. */}
              {[23, 31, 39].map((x) => <path key={x} d={`M${x} 27 q2 4 0 10`} stroke="#5a4030" strokeWidth="0.6" fill="none" />)}
              <rect x="46" y="15" width="18" height="2.6" fill={P.woodD} transform="rotate(-10 46 16)" />
              <Wheel cx={25} cy={53} r={4} />
              <Wheel cx={41} cy={53} r={4} />
            </>
          )}
        </Scene>
      )
    case 'ram':
      return (
        <Scene size={size} ground={52}>
          {(u) => (
            <>
              <Wall u={u} x={70} y={54} w={26} h={40} />
              <path d="M73 54 V40 Q78 34 83 40 V54Z" fill="#2a1d14" />
              <path d="M74 44 l3 2 l-1 3 l3 1" stroke="#1a120c" strokeWidth="0.6" fill="none" />
              <Shadow u={u} cx={40} cy={56} rx={22} />
              {/* The roofed shed, hides over its ribs. */}
              <path d="M16 46 L38 28 L60 46Z" fill="#8a6a48" />
              <path d="M38 28 L60 46" stroke={P.rim} strokeOpacity="0.45" strokeWidth="0.5" />
              {[22, 30, 38, 46, 54].map((x) => <path key={x} d={`M${x} 46 L${x + (38 - x) * 0.4} ${46 - (46 - 28) * (1 - Math.abs(38 - x) / 22) * 0.9}`} stroke="#5a4030" strokeWidth="0.5" />)}
              <rect x="16" y="46" width="44" height="3.6" fill={u('plank')} />
              {/* The beam with its iron head swinging into the gate. */}
              <rect x="26" y="40" width="48" height="4" rx="2" fill={u('log')} />
              <rect x="26" y="40" width="48" height="4" rx="2" fill={u('grain')} />
              <path d="M72 39 L79 42 L72 45Z" fill={P.iron} />
              <path d="M72 39 L79 42" stroke={P.stoneL} strokeWidth="0.4" />
              <path d="M80 36 l3 -3 M81 42 l4 0 M80 48 l3 3" stroke="#ffe08a" strokeWidth="0.7" />
              <Wheel cx={22} cy={52} r={3.6} />
              <Wheel cx={54} cy={52} r={3.6} />
            </>
          )}
        </Scene>
      )
    case 'mantlet':
      return (
        <Scene size={size}>
          {(u) => (
            <>
              {[18, 42, 66].map((x) => (
                <g key={x}>
                  <Shadow u={u} cx={x + 9} cy={55} rx={10} />
                  <g transform={`rotate(-7 ${x + 8} 38)`}>
                    <rect x={x} y="22" width="17" height="28" fill={u('plank')} />
                    {[0, 4.25, 8.5, 12.75].map((o) => <rect key={o} x={x + o} y="22" width="0.5" height="28" fill={P.woodD} />)}
                    <rect x={x} y="22" width="17" height="28" fill={u('grain')} />
                    <rect x={x} y="30" width="17" height="1.4" fill={P.woodD} />
                    <rect x={x} y="42" width="17" height="1.4" fill={P.woodD} />
                    <path d={`M${x + 16.7} 22 V50`} stroke={P.rim} strokeOpacity="0.5" strokeWidth="0.5" />
                  </g>
                  <Wheel cx={x + 3} cy={53} r={2.8} />
                  <Wheel cx={x + 14} cy={53} r={2.8} />
                </g>
              ))}
              {/* Arrows glancing off. */}
              {[[6, 10], [12, 18], [88, 14], [84, 22]].map(([x, y], i) => (
                <g key={i}>
                  <line x1={x} y1={y} x2={x + 9} y2={y + 5} stroke={P.woodL} strokeWidth="0.6" />
                  <path d={`M${x + 9} ${y + 5} l-1.6 -0.2 l0.6 -1.2Z`} fill={P.stoneL} />
                </g>
              ))}
            </>
          )}
        </Scene>
      )
    case 'trebuchet':
      return (
        <Scene size={size} ground={52}>
          {(u) => (
            <>
              <Shadow u={u} cx={34} cy={55} rx={22} />
              <rect x="14" y="50" width="38" height="4" fill={u('plank')} />
              <path d="M18 50 L32 20 L46 50" stroke={u('log')} strokeWidth="3" fill="none" />
              <path d="M18 50 L32 20 L46 50" stroke={P.wood} strokeWidth="2.2" fill="none" />
              <path d="M32 20 L46 50" stroke={P.rim} strokeOpacity="0.5" strokeWidth="0.5" />
              <path d="M22 42 H42" stroke={P.woodD} strokeWidth="1.2" />
              <circle cx="32" cy="21" r="1.8" fill={P.iron} />
              <path d="M14 30 L66 10" stroke={P.wood} strokeWidth="3" />
              <path d="M14.5 29 L65.5 9.3" stroke={P.rim} strokeOpacity="0.5" strokeWidth="0.5" />
              {/* Counterweight box full of stones. */}
              <rect x="6" y="28" width="12" height="11" fill={u('plank')} />
              <rect x="6" y="28" width="12" height="11" fill={u('grain')} />
              {[8.5, 12, 15.5].map((x) => <circle key={x} cx={x} cy={27.4} r="1.7" fill={P.stone} />)}
              <path d="M66 10 L70 18" stroke="#b8ab8a" strokeWidth="0.5" />
              <path d="M70 10 Q82 -2 92 14" stroke="#ffe08a" strokeWidth="0.6" fill="none" strokeDasharray="1.6 1.6" />
              <circle cx="92" cy="14" r="3" fill={P.stone} />
              <circle cx="91" cy="13" r="1" fill={P.stoneL} />
            </>
          )}
        </Scene>
      )
    case 'demolish':
      return (
        <Scene size={size}>
          {(u) => (
            <>
              <path d="M0 50 Q30 46 50 51 T96 50 L96 60 Q60 63 40 59 T0 60Z" fill={u('water')} />
              <rect x="8" y="42" width="28" height="3.4" fill={u('plank')} />
              <rect x="58" y="42" width="30" height="3.4" fill={u('plank')} />
              {[22, 72].map((x) => <rect key={x} x={x} y="45" width="2.4" height="13" fill={u('log')} />)}
              <rect x="36" y="47" width="18" height="3" fill={P.woodD} transform="rotate(26 45 48)" />
              <rect x="44" y="53" width="10" height="2.4" fill={P.wood} transform="rotate(-12 49 54)" />
              <path d="M38 56 q4 2 8 0 q4 -2 8 0" stroke="#cfe6f0" strokeWidth="0.6" fill="none" />
              <circle cx="47" cy="28" r="7" fill="#4a4540" opacity="0.5" filter={u('soft')} />
              {/* An axe in mid-swing. */}
              <line x1="40" y1="22" x2="54" y2="36" stroke={P.woodL} strokeWidth="1.4" />
              <path d="M38 20 l5 -1 l-1 6Z" fill={P.stoneL} />
            </>
          )}
        </Scene>
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
