import { X } from 'lucide-react'
import { Glyph } from './Glyph'
import type { GlyphName } from '../render/glyphs'
import { useState, type ReactNode } from 'react'
import { COLUMN, FORMATIONS, FORMATION_ORDER } from '../game/formations'
import { OUTPOST_KINDS, OUTPOST_ORDER } from '../game/outposts'
import { FEATURE_INFO, HOLDINGS, WORKS } from '../game/engine'
import type { UnitType } from '../game/types'
import { CounterWheel, OutpostArt, WorkArt } from './art'
import { FormationIcon, SectionTitle, Tab, UnitGlyph } from './common'
import { isTouchDevice } from './viewport'

type Page = 'basics' | 'units' | 'formations' | 'field' | 'realm'

const TOUCH: [string, string][] = [
  ['Tap', 'Select an army or castle'],
  ['Drag', 'Pan the map'],
  ['Pinch / twist', 'Zoom and rotate'],
  ['Thumb stick', 'Drive the selected army by hand: push harder to go faster; let go and it rolls to a halt. A quick tap turns the commander\'s view (low behind the army) on or off'],
  ['Drag the map', 'Look around freely; touch the stick again to return to the army'],
  ['Double-tap', 'March the selected army there: ground, castle, enemy, or your army to merge'],
  ['Long-press', 'The same order as a double-tap'],
  ['Menu button', 'Realm, armies and the war overview'],
  ['⋯ → Overhead view', 'Switch between overhead and tilted view'],
]

const KEYS: [string, string][] = [
  ['Left-click', 'Select an army or castle'],
  ['Right-click', 'Order the selected army: move, attack a castle, intercept an enemy, merge into your army'],
  ['Drag / WASD', 'Pan the map'],
  ['Wheel', 'Zoom (closer tilts the view)'],
  ['Q / E · middle-drag', 'Rotate'],
  ['C', 'Fly to your seat of power'],
  ['V', 'Switch between overhead and tilted view'],
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
            ['purse', 'Gold is the main limit. Take castles, buy free towns and expand them to grow it.'],
            ['swords', 'Muster armies from castles: a commander, a mix of troops and a formation.'],
            ['castle', 'Walls must be battered down before a garrison can be stormed. Engineers do it fastest.'],
            ['muster', 'A pulsing red ring is an enemy Great Host gathering. Strike before it unites.'],
            ['handshake', 'In Alliance War, summon your allies to muster with you, or call for aid when a castle is threatened.'],
            ['shield', 'Station an army at a castle (yours or an ally\'s): it mans the walls when the castle is besieged.'],
            ['heart', 'A beaten commander is out of action for a while: after a rout, 90 seconds of regrouping once they reach a castle; when their army is destroyed, 4 minutes wounded; struck down by assassins, 5 minutes. Each star above the first takes 10% off (at most half), and abbeys of yours nurse them faster. The enemy\'s commanders are bound by the same.'],
            ['muster', 'Army size and battle groups: an army holds at most 1500 soldiers under a named commander, 800 under a captain (not on the Long Night or the forest road). Larger forces march as a battle group: a lead army and up to four escorts (the Escort standing order). Choose how they stand about the lead from its panel: Box (left, right, ahead, behind), Line (abreast) or Wedge (a V behind it). When the lead assaults a castle, the escorts fan out round it and join the assault from their own sides; each extra side costs the defenders 10% of their walls\' worth, at most 30%. Merging into a full army leaves the rest beside it as an escort. The enemy\'s Great Hosts march as battle groups too.'],
            ['muster', 'Standing orders (an army\'s panel): Escort another army of ours (it rides in a place of its own beside it - left, right, then behind and ahead - joins its fights, and the escorted army keeps to its pace), Follow one a little way behind, or Guard a post (it falls on enemies within 250, 400 or 600m and returns; against a much stronger host it stands fast). Pick the army to escort or follow by tapping it on the map. Escorts never merge into it; any order by hand cancels the standing order.'],
            ['crown', 'King Aldric rides with the Royal Guard: 520 steel-and-gold knights that can never be replaced. Armies within 350m of him fight harder and hold their nerve. If the Guard is destroyed, the war is lost.'],
            ['mask', 'Corvin Ashe, the spymaster, leads his Whisper Blades and nothing else; they hide on their own. In woods, thickets, river valleys, on a mountain\'s flank, in a hidden camp, or in rain, storm and snow they are concealed; on open ground in fair weather they pass as pilgrims and pedlars, which the enemy ignores but scouts, walls and watch posts see through from further off. They live off the land (never out of supply) and march 28% faster than other armies. Their first blow strikes 2.2x as hard (1.9x from disguise). Found out, they cannot hide again for 90 seconds. With his band selected, the enemy\'s watches show as red rings (orange: where a disguise is seen through), and the road is coloured green under cover, gold in disguise and red where they would be found. In disguise the enemy takes them for pilgrims with mules and carts; we see our own as they are, under an amber ring, their standard furled.'],
            ['dagger', 'The Whisper Blades: Ashe\'s own 130 knife-men, fixed like the Royal Guard (never reinforced; an abbey of yours can take them in to fill their ranks, for gold). Send them after an enemy army and they strike at its leader, not its ranks (the harder the foe, the closer its leaders are guarded): if the knife finds its mark, a commander is carried from the field and the host breaks; the Usurper Queen herself can fall (rarely, and every attempt makes her guard warier). Hidden, they are likelier to succeed; large hosts and seasoned commanders are harder. A failed strike costs about 30% of the band, but the knives in the camp still shake the host (morale -20). The odds of each strike show in Ashe\'s panel (Strike odds) and when sending them to intercept. After each strike they regroup for 150 seconds. They do not storm walls.'],
            ['pick', 'Tamsin Holt leads the Night Sappers (90 Saboteurs) and nothing else. They hide by the same rules as the Blades, never run out of supply, and are useless in a fight; wiped out, they gather again 5 minutes later. They do the sabotage, not the Blades: with the Blades within 320m to cover them (set the Sappers to Follow the Blades) the work takes 8 seconds instead of 12 and the alarm goes up far less often (15% against 35%).'],
            ['mask', 'Sabotage: the Night Sappers, unseen near an enemy castle or fieldwork, can Foul the Wells (garrison -12%, levies -40%), Fire the Granary (the garrison fights shaken for 3 minutes), Undermine the Postern (walls -30%, no mending for 3 minutes), Spoil a depot\'s Stores or Fire the Works. 12 seconds of work unseen; the alarm may go up afterwards.'],
            ['chapel', 'Sanctuary: one of your abbeys takes in the Royal Guard or one of our fixed bands (the Blades, the Sappers, the Wardens) standing there short of men: the wounded are nursed and lay brothers sworn to the Crown fill the ranks, for gold each man.'],
            ['castle', 'The Long Night: hold the King\'s royal city until dawn. The Endless Night pours without pause from the Great Rift before the city; every so often it erupts with whole hosts, fiends, wraith riders and, later, giants. Its battalions mass before the weakest gate (the bar at the bottom warns where) and go in together while others pin a second gate. The outer wall has five gatehouses and the inner three: a gate taken lets the dead into the ring behind it. Station armies at the gates, lay traps before them, keep the wards (they pay and raise men) and sally out to break the trebuchets. Lose the Citadel or the King and the city is lost.'],
            ['wagon', 'Convoy Raid: five gold wagons run one forest road from the caravanserai to the castle, one every 75 seconds. Seizing one takes 5 seconds standing at it, and cannot be done while a guard who is not fighting stands beside it. Escorting, right-click a wagon to have an army walk beside it and halt the train from the bar at the bottom of the screen. Raiding, pin the guards in a fight and take the wagon with another band; your sappers can pull down the bridge to send the wagons the long way through a ford, and Corvin Ashe\'s Whisper Blades can strike down the leader of a wagon\'s guards so they break and leave it bare. Give the bands you cannot watch a standing order (Escort, Hunt, Picket; Ambush, Harass, Bridge, Strike) from their panel. Three wagons decide it.'],
            ['mask', 'The Usurper has a spymaster too: Mother Sereth, the Grey Abbess, with her Grey Sisters (130, by the same rules as our Blades). They strike at our commanders (the King too: rarely, and every attempt makes his guard warier; the easier the war, the closer our leaders are guarded), rob our wagons, and cover Brother Gall\'s Rootcutters (the mirror of our Night Sappers), who lie up outside the castle a Great Host is marching on and open its postern. Walls, wardens\' keeps, outposts and scouts find them out; keep leaders inside big hosts and wagons guarded.'],
            ['eye', 'Rowan Fenwick, Warden of the March, leads the Wardens of the March (150 Outriders: mounted bowmen) and nothing else. They see nearly twice as far as any host, find hidden bands within 450m whether concealed or disguised (the Grey Sisters among them), and keep every enemy army they sight on our map for a minute. Poor in a stand-up fight; they storm no walls and never run out of supply. Across the lines Corrick Vane\'s Thorn Hunt does the same for the enemy: it rides with the Great Hosts and hunts our Whisper Blades, so ride it down with a host before sending the knives in.'],
            ['shield', 'The fixed bands fight in troops of their own, raised in no castle: the Royal Guard and the Thorn Guard are Household Knights, the Blades and the Sisters Assassins, the Sappers and the Rootcutters Saboteurs, the Wardens and the Hunt Outriders. They are never reinforced, but an abbey of ours fills their ranks for gold; wiped out, the Blades, the Sappers and the Wardens gather again 5 minutes later.'],
            ['crown', 'War of the Three Crowns: a continent with three walled royal cities - the King\'s in the west, Queen Morwenna\'s in the north, and that of Vaelor the Sun Emperor (with his bronze-and-gold Solar Guard) in the east - each ringed by its vassal lords, the ruined Imperial Crossroads in its broken walls at the heart. The two rival crowns fight each other as well as you, and both lean on whoever grows strongest. A crown is shattered when its monarch falls or its Citadel is taken; shatter both to win. You lose only if the King falls and your Citadel is taken (or nothing of yours is left). No time limit. The Three Crowns panel at the bottom shows each crown\'s standing, castles and Citadel walls.'],
            ['crown', 'Across the lines rules Queen Morwenna, the Usurper, with her crimson Thorn Guard. She holds court in the enemy High Seat and rides out with some of the Great Hosts. Destroy her guard and the war is won. Where she was last seen shows on the map (a red crown) and in the War tab; scouts near her report her whereabouts.'],
          ].map(([icon, text]) => (
            <li key={text} className="flex gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-black/30 text-gold-300">
                <Glyph name={icon as GlyphName} size={17} />
              </span>
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
      <section>
        <SectionTitle>Supply depots and supply lines</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <div className="mb-1 font-display text-[15px] font-bold text-gold-100"><Glyph name="crate" size={15} className="mr-1 -mt-0.5 text-gold-300" />Quarters</div>
            <p className="text-[13.5px] leading-snug text-ink-300">
              Send armies into your depot (select an army, then tap the depot). Up to 900 soldiers wait inside, out of sight, with their commanders. Raise new armies from the depot as from a castle; only commanders quartered there, or a captain, can lead them. If enemies reach the gate, the garrison marches out to fight; if the depot falls, they retreat to your nearest castle.
            </p>
          </Card>
          <Card>
            <div className="mb-1 font-display text-[15px] font-bold text-gold-100"><Glyph name="wheel" size={15} className="mr-1 -mt-0.5 text-gold-300" />Wagon trains</div>
            <p className="text-[13.5px] leading-snug text-ink-300">
              Every depot draws on its stores; wagons from the nearest friendly castle refill them along a road shown as a dashed line. Wagons are unarmed: any enemy army that reaches them seizes them. As stores run down, the depot's supply reach shrinks, and empty, it supplies nobody. Cut enemy lines, guard your own.
            </p>
          </Card>
        </div>
      </section>
      <section>
        <SectionTitle>Holdings between the castles</SectionTitle>
        <p className="mb-2 text-[13px] text-ink-400">All are won with envoys and gold (or plundered), then run themselves as your vassals: they raise their own militia, help a besieged castle nearby, and after five minutes wall themselves in stone (stronger, and their gifts grow).</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.values(HOLDINGS).map((h) => (
            <Card key={h.name}>
              <div className="font-display text-[15px] font-bold text-gold-100">
                <Glyph name={h.icon} size={15} className="mr-1 -mt-0.5 text-gold-300" />
                {h.name}
              </div>
              <p className="mt-1 text-[13px] leading-snug text-ink-300">{h.blurb}</p>
            </Card>
          ))}
        </div>
      </section>
      <section>
        <SectionTitle>Lie of the land</SectionTitle>
        <p className="mb-2 text-[13px] text-ink-400">Every map mixes three climates (deserts stretch supply to 0.8x, mud flats slow armies and stop charges, volcanic ground ignores winter, ice makes it worse) and is dotted with features worth fighting over. Select an army to see what the ground under it does.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.values(FEATURE_INFO).map((f) => (
            <Card key={f.name}>
              <div className="font-display text-[15px] font-bold text-gold-100">{f.name}</div>
              <p className="mt-1 text-[13px] leading-snug text-ink-300">{f.effect}</p>
            </Card>
          ))}
        </div>
      </section>
      <section>
        <SectionTitle>Engineers' works · need 10+ Engineers</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          {(['stakes', 'pit', 'barricade', 'pitch', 'bridge', 'demolish'] as const).map((k) => {
            const w = WORKS[k]
            return (
              <Card key={k}>
                <div className="flex gap-3">
                  <WorkArt job={k} size={112} />
                  <div className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-display text-[15px] font-bold text-gold-100">{w.name}</span>
                      <span className="text-[13px] text-gold-300">{w.cost ? `${w.cost}g` : 'free'}</span>
                    </div>
                    <div className="text-[12px] font-bold text-gold-300/70">
                      {w.engineers}+ Engineers · ~{w.seconds}s
                    </div>
                    <p className="mt-0.5 text-[13px] leading-snug text-ink-300">{w.description}</p>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </section>
      <section>
        <SectionTitle>Villages, mines and scouts</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <div className="mb-1 font-display text-[15px] font-bold text-gold-100"><Glyph name="house" size={15} className="mr-1 -mt-0.5 text-gold-300" />Villages</div>
            <p className="text-[13.5px] leading-snug text-ink-300">
              Free villages lie between the castles. Send envoys (an army nearby or a castle within reach) and pay their price: if they agree, it becomes your vassal. A vassal village runs itself: it raises its own militia, pays tribute by wagon to your nearest castle (raiders can seize the wagons), raises stone walls in time, and sends its militia to help a castle of yours under siege nearby. You cannot muster from it or send armies into it. Or plunder it: beat the militia for gold and captives, but the village burns for good and every other village grows warier of you.
            </p>
          </Card>
          <Card>
            <div className="mb-1 font-display text-[15px] font-bold text-gold-100"><Glyph name="pick" size={15} className="mr-1 -mt-0.5 text-gold-300" />Mines & lumber camps</div>
            <p className="text-[13.5px] leading-snug text-ink-300">
              An army with 10+ engineers can work a mine or a forest camp for gold. Only the number of engineers matters (10 make about 1.2 gold/s, 40 about 3; mines pay 30% more). The gold goes home by wagon, which enemies can seize. Sites run dry and recover slowly when left alone.
            </p>
          </Card>
          <Card>
            <div className="mb-1 font-display text-[15px] font-bold text-gold-100"><Glyph name="spyglass" size={15} className="mr-1 -mt-0.5 text-gold-300" />Scouts</div>
            <p className="text-[13.5px] leading-snug text-ink-300">
              There is no fog: you and the AI lords see the whole map and every army on the march. What hides is local: troops waiting in woods or a Forest Lodge vanish from the other side's view (yours and the AI's alike) until someone comes within 200m (400m from a watchtower). Far from your forces (over 450m), enemy numbers are only rumours (~…?) and their leader and mix of troops are unknown; the AI judges your armies with the same error. To scout, tap an enemy castle and press Send: 40 scouts (riders first) ride out from the castle or supply depot you pick, see what is near, and report only if they get home. Any army of 80 or fewer can also be sent to scout from its own panel. Castles, outposts and armies that spot scouts send riders after them; captured scouts may give away where they came from. Rain, storms and forest cover help scouts; horsemen and watchtowers help spot them. Ambushers are only found up close.
            </p>
          </Card>
        </div>
      </section>
      <section>
        <Card>
          <div className="mb-1 font-display text-[15px] font-bold text-gold-100"><Glyph name="swords" size={15} className="mr-1 -mt-0.5 text-gold-300" />Striking from behind</div>
          <p className="text-[13.5px] leading-snug text-ink-300">
            Join a fight that is already under way from the far side of the enemy, behind the line your own troops are holding. For 8 seconds your army deals 25% more damage and its cavalry charges into their backs, where spear walls, schiltrons and palisades give no protection. The enemy's morale is shaken at once. Ordering an army to attack an enemy that is already fighting makes it swing around to the rear by itself. Enemies do the same to you.
          </p>
        </Card>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <Card>
          <div className="mb-1 font-display text-[15px] font-bold text-gold-100"><Glyph name="tree" size={15} className="mr-1 -mt-0.5 text-gold-300" />Ambush</div>
          <p className="text-[13.5px] leading-snug text-ink-300">
            An army that holds still in a forest for a few seconds vanishes from enemy sight. When an enemy blunders into it, the ambushers strike first and hard, and the victims lose morale. Forest Lodges keep armies hidden at once.
          </p>
        </Card>
        <Card>
          <div className="mb-1 font-display text-[15px] font-bold text-gold-100"><Glyph name="crate" size={15} className="mr-1 -mt-0.5 text-gold-300" />Supply</div>
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
            ['sprout', 'Spring', 'Recruits come 25% faster.'],
            ['sun', 'Summer', 'Long days for campaigning.'],
            ['leaf', 'Autumn', 'Harvest: +15% income.'],
            ['snowflake', 'Winter', 'Slow marches, upkeep ×1.5, short supply lines. Deep Freeze: midwinter freezes stretches of the rivers and some lakes; cross them anywhere (60% pace, no charges or squares on the ice). Off the ice before the thaw, or lose a tenth of the men.'],
            ['rain', 'Rain', 'Archers −35%, mud slows marches and sieges.'],
            ['storm', 'Storm', 'Archers nearly useless, everything slower.'],
            ['snow', 'Snow', 'Archers −20%, slower marches.'],
            ['clear', 'Clear', 'No penalties.'],
          ].map(([icon, name, text]) => (
            <Card key={name}>
              <Glyph name={icon as GlyphName} size={26} className="text-gold-300" />
              <div className="mt-1 font-bold text-gold-100">{name}</div>
              <div className="text-[12.5px] leading-snug text-ink-400">{text}</div>
            </Card>
          ))}
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <Card>
          <div className="mb-1 font-display text-[15px] font-bold text-gold-100"><Glyph name="handshake" size={15} className="mr-1 -mt-0.5 text-gold-300" />Diplomacy</div>
          <p className="text-[13.5px] leading-snug text-ink-300">The Intrigue tab gathers it all: buy a truce with an enemy lord, or in Alliance War bribe one to change sides (lords under pressure are easier to turn); buy free towns; send envoys to villages within reach; and watch your infamy, which abbeys slowly pray away.</p>
        </Card>
        <Card>
          <div className="mb-1 font-display text-[15px] font-bold text-gold-100"><Glyph name="crown" size={15} className="mr-1 -mt-0.5 text-gold-300" />Realm rank</div>
          <p className="text-[13.5px] leading-snug text-ink-300">Every realm has a rank, shown under its castles and outposts. It rises with total military strength (garrisons and armies) and falls after heavy losses. Each rank makes all of a realm's castles grander. The top rank depends on the map size.</p>
        </Card>
        <Card>
          <div className="mb-1 font-display text-[15px] font-bold text-gold-100">★ Commanders</div>
          <p className="text-[13.5px] leading-snug text-ink-300">Commanders gain renown from kills. At each new rank you choose one of three traits, making each commander your own.</p>
        </Card>
      </section>
    </div>
  )
}
