import { X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { COLUMN, FORMATIONS, FORMATION_ORDER } from '../game/formations'
import { OUTPOST_KINDS, OUTPOST_ORDER } from '../game/outposts'
import type { UnitType } from '../game/types'
import { CounterWheel, OutpostArt } from './art'
import { FormationIcon, SectionTitle, Tab, UnitGlyph } from './common'
import { isTouchDevice } from './viewport'

type Page = 'basics' | 'units' | 'formations' | 'field' | 'realm'

const TOUCH: [string, string][] = [
  ['Tap', 'Select an army or castle'],
  ['Drag', 'Pan the map'],
  ['Pinch / twist', 'Zoom and rotate'],
  ['Long-press', 'Order the selected army to that spot or target'],
  ['🎯 Give an order', 'Then tap the target: ground, castle, enemy, or your army to merge'],
  ['☰', 'Realm, armies and the war overview'],
]

const KEYS: [string, string][] = [
  ['Left-click', 'Select an army or castle'],
  ['Right-click', 'Order the selected army: move, attack a castle, intercept an enemy, merge into your army'],
  ['Drag / WASD', 'Pan the map'],
  ['Wheel', 'Zoom (closer tilts the view)'],
  ['Q / E · middle-drag', 'Rotate'],
  ['C', 'Fly to your seat of power'],
  ['F', 'Muster a new army'],
  ['Tab', 'Cycle through your armies'],
  ['L · H · Esc', 'Chronicle · this manual · deselect'],
]

/** The field manual: illustrated, one topic per tab. */
export function HelpOverlay({ units, onClose }: { units: UnitType[]; onClose: () => void }) {
  const [page, setPage] = useState<Page>('basics')
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-0 sm:p-4" onMouseDown={onClose}>
      <div className="panel animate-fade-up safe-top flex h-full max-h-full w-[980px] max-w-full flex-col overflow-hidden rounded-none sm:h-[min(760px,92vh)] sm:rounded-md" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-4 pt-4 sm:px-6">
          <h2 className="panel-title">Field Manual</h2>
          <button className="btn px-2" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <nav className="scroll-thin flex gap-1 overflow-x-auto border-b border-black/60 px-3 pt-2 sm:px-5">
          {(
            [
              ['basics', 'Controls'],
              ['units', 'Units'],
              ['formations', 'Formations'],
              ['field', 'Outposts'],
              ['realm', 'Realm'],
            ] as const
          ).map(([k, label]) => (
            <Tab key={k} active={page === k} onClick={() => setPage(k)}>
              <span className="whitespace-nowrap">{label}</span>
            </Tab>
          ))}
        </nav>
        <div className="scroll-thin flex-1 overflow-y-auto p-4 sm:p-6">
          {page === 'basics' && <Basics />}
          {page === 'units' && <Units units={units} />}
          {page === 'formations' && <Formations />}
          {page === 'field' && <Field />}
          {page === 'realm' && <Realm />}
        </div>
      </div>
    </div>
  )
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`well rounded-sm p-3 ${className}`}>{children}</div>
}

function Basics() {
  const touch = isTouchDevice()
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section>
        <SectionTitle>{touch ? 'Touch controls' : 'Controls'}</SectionTitle>
        <dl className="space-y-1.5">
          {(touch ? TOUCH : KEYS).map(([k, v]) => (
            <div key={k} className="flex gap-3 text-[14px]">
              <dt className="w-32 shrink-0">
                <kbd className="inline-block rounded-sm bg-black/40 px-1.5 py-0.5 font-sans text-[13px] leading-snug font-bold text-gold-200 shadow-[inset_0_-1px_0_rgba(0,0,0,0.6)]">{k}</kbd>
              </dt>
              <dd className="text-ink-300">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <SectionTitle>How a war is won</SectionTitle>
        <ol className="space-y-2 text-[14px] leading-relaxed text-ink-300">
          {[
            ['💰', 'Gold is the main limit. Take castles, buy free towns and expand them to grow it.'],
            ['⚔', 'Muster armies from castles: a commander, a mix of troops and a formation.'],
            ['🏰', 'Walls must be battered down before a garrison can be stormed. Engineers do it fastest.'],
            ['🔴', 'A pulsing red ring is an enemy Great Host gathering. Strike before it unites.'],
            ['🤝', 'In Alliance War, summon your allies to muster with you and strike together.'],
          ].map(([icon, text]) => (
            <li key={text} className="flex gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-black/30 text-[16px]">{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

function Units({ units }: { units: UnitType[] }) {
  return (
    <div className="grid items-start gap-6 md:grid-cols-[300px_1fr]">
      <Card className="flex flex-col items-center">
        <SectionTitle>Who beats whom</SectionTitle>
        <CounterWheel units={units} size={270} />
        <p className="mt-1 text-center text-[13px] text-ink-400">Infantry stop cavalry, cavalry ride down archers and engineers, archers thin out infantry.</p>
      </Card>
      <div className="space-y-2">
        {units.map((u) => (
          <Card key={u.key}>
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full" style={{ background: `${u.color}22`, boxShadow: `inset 0 0 0 1.5px ${u.color}88` }}>
                <UnitGlyph unit={u.key} size={22} color={u.color} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-[16px] font-bold text-gold-100">{u.name}</span>
                  <span className="text-[13px] text-gold-300">{u.cost_gold}g</span>
                </div>
                <p className="text-[13.5px] leading-snug text-ink-300">{u.description}</p>
                <div className="mt-1.5 grid grid-cols-3 gap-2 text-[12px]">
                  <StatBar label="Attack" value={u.attack} max={2.2} color="#de5f45" />
                  <StatBar label="Defence" value={u.defense} max={2.2} color="#6c95dd" />
                  <StatBar label="Speed" value={u.speed} max={1.8} color="#86efac" />
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-ink-400">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
        <div className="h-full" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
      </div>
    </div>
  )
}

function Formations() {
  return (
    <div className="space-y-4">
      <p className="text-[14px] text-ink-300">Battles open with arrow volleys, then the cavalry charge, then the grinding melee. Formations change how each phase goes for you.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {FORMATION_ORDER.map((k) => {
          const f = FORMATIONS[k]
          return (
            <Card key={k}>
              <div className="flex gap-3">
                <span className="grid size-16 shrink-0 place-items-center rounded-sm bg-black/30 text-gold-300">
                  <FormationIcon formation={k} size={48} />
                </span>
                <div>
                  <div className="font-display text-[16px] font-bold text-gold-100">{f.name}</div>
                  <p className="text-[13.5px] leading-snug text-ink-300">{f.description}</p>
                </div>
              </div>
            </Card>
          )
        })}
        <Card>
          <div className="flex gap-3">
            <span className="grid size-16 shrink-0 place-items-center rounded-sm bg-black/30 text-gold-300">
              <FormationIcon formation="column" size={48} />
            </span>
            <div>
              <div className="font-display text-[16px] font-bold text-gold-100">March Column</div>
              <p className="text-[13.5px] leading-snug text-ink-300">
                +{Math.round((COLUMN.speed - 1) * 100)}% march speed, but an army caught in column fights badly for {COLUMN.reformSeconds}s while it re-forms.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Field() {
  return (
    <div className="space-y-5">
      <section>
        <SectionTitle>Outposts · need 15+ Engineers</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          {OUTPOST_ORDER.map((k) => {
            const o = OUTPOST_KINDS[k]
            return (
              <Card key={k}>
                <div className="flex gap-3">
                  <OutpostArt kind={k} size={112} />
                  <div className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-display text-[15px] font-bold text-gold-100">{o.name}</span>
                      <span className="text-[13px] text-gold-300">{o.cost}g</span>
                    </div>
                    <div className="text-[12px] font-bold text-gold-300/70">{o.terrain}</div>
                    <p className="mt-0.5 text-[13px] leading-snug text-ink-300">{o.description}</p>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
        <p className="mt-2 text-[13px] text-ember-300/90">An empty outpost is burned by any enemy who stands on it for a few seconds. Keep one garrisoned.</p>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <Card>
          <div className="mb-1 font-display text-[15px] font-bold text-gold-100">🌲 Ambush</div>
          <p className="text-[13.5px] leading-snug text-ink-300">
            An army that holds still in a forest for a few seconds vanishes from enemy sight. When an enemy blunders into it, the ambushers strike first and hard, and the victims lose morale. Forest Lodges keep armies hidden at once.
          </p>
        </Card>
        <Card>
          <div className="mb-1 font-display text-[15px] font-bold text-gold-100">📦 Supply</div>
          <p className="text-[13.5px] leading-snug text-ink-300">
            Armies must stay within reach of a friendly castle, outpost or camp. Out of supply, they lose men and morale every second. Supply Depots extend your reach.
          </p>
        </Card>
      </section>
    </div>
  )
}

function Realm() {
  return (
    <div className="space-y-5">
      <section>
        <SectionTitle>Seasons & weather</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['🌱', 'Spring', 'Recruits come 25% faster.'],
            ['☀', 'Summer', 'Long days for campaigning.'],
            ['🍂', 'Autumn', 'Harvest: +15% income.'],
            ['🌨', 'Winter', 'Slow marches, upkeep ×1.5, short supply lines.'],
            ['🌧', 'Rain', 'Archers −35%, mud slows marches and sieges.'],
            ['⛈', 'Storm', 'Archers nearly useless, everything slower.'],
            ['❄', 'Snow', 'Archers −20%, slower marches.'],
            ['🌤', 'Clear', 'No penalties.'],
          ].map(([icon, name, text]) => (
            <Card key={name}>
              <div className="text-[26px] leading-none">{icon}</div>
              <div className="mt-1 font-bold text-gold-100">{name}</div>
              <div className="text-[12.5px] leading-snug text-ink-400">{text}</div>
            </Card>
          ))}
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <Card>
          <div className="mb-1 font-display text-[15px] font-bold text-gold-100">🤝 Diplomacy</div>
          <p className="text-[13.5px] leading-snug text-ink-300">Buy free towns from their castle panel. In the War tab, buy a truce with an enemy lord, or in Alliance War bribe one to change sides. Lords under pressure are easier to turn.</p>
        </Card>
        <Card>
          <div className="mb-1 font-display text-[15px] font-bold text-gold-100">★ Commanders</div>
          <p className="text-[13.5px] leading-snug text-ink-300">Commanders gain renown from kills. At each new rank you choose one of three traits, making each commander your own.</p>
        </Card>
      </section>
    </div>
  )
}
