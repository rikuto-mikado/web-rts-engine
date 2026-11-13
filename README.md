# WARBOX

A real-time medieval strategy game. Raise armies from your castles, choose a
commander and the mix of spearmen, men-at-arms, longbowmen, light horse,
knights and siege engineers, then march on the Ashen Dominion across a tilted
3D map with fog of war.

- **frontend/**: Vite + React + TypeScript + Tailwind v4 + Three.js
- **backend/**: Django 5.2 + Django REST Framework, PostgreSQL (Neon)

## Running locally

### Backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env         # then paste your Neon connection string into DATABASE_URL
.venv/bin/python manage.py migrate      # creates tables and seeds units, commanders and the map
.venv/bin/python manage.py runserver    # http://127.0.0.1:8000
```

Without `DATABASE_URL` the backend falls back to a local SQLite file, which is
handy for a quick try. Optional: `manage.py createsuperuser` and open
`/admin/` to tune unit stats, commanders and scenarios live. Re-apply the
defaults with `manage.py seed_game`.

### Frontend

```bash
cd frontend
npm install
npm run dev                  # http://localhost:5173 (proxies /api to :8000)
```

## Game modes

| Mode             | Map                                          | Goal                                                   |
| ---------------- | -------------------------------------------- | ------------------------------------------------------ |
| **Conquest**     | Random, in three sizes                       | You against a coalition: take its capitals, keep yours |
| **Alliance War** | Random, 16 / 24 / 32 realms in two alliances | Your alliance takes the enemy High Seat                |
| **Convoy Raid**  | The Greenwood Road (one forest road)         | Escort: bring 3 of 5 gold wagons in. Raid: seize 3     |
| **The Long Night** | The Royal Vale (the King's walled city)    | Hold the Citadel and keep the King alive until dawn    |
| **War of the Three Crowns** | The Three Realms (a continent, three royal cities) | Shatter both rival crowns: slay their monarchs or take their Citadels |

### War of the Three Crowns

A long, three-way war with no time limit on a continent of its own (`grand`,
`game/grandmap.ts`): three walled royal cities in a great triangle, each laid
out like the Long Night's (`layRoyalCity`: an inner and an outer wall with
gatehouses, wards, streets and thousands of houses, the Citadel at the heart),
and each ringed by three vassal lords and a march fortress. **Team A** is the
player's (King Aldric, the Royal Guard, the Whisper Blades, the Night Sappers and the Wardens),
**team B** the Usurper Queen's (Thorn Guard, Grey Sisters, Rootcutters, Thorn Hunt), and
**team C** the Sun Emperor's (Vaelor the Sun-Crowned and his Solar Guard in
bronze and gold; Vesk, Sabine and Ulric serve him). Between them: three rivers
running out from the heart along the borders with mountain ranges broken by
passes, free towns, and the ruined Imperial Crossroads inside the old empire's
walls at the very centre. The rival crowns fight each other as well as the
player, and every realm leans on whichever rival grows strongest (and leaves
the King be for the first quarter hour). A crown is **shattered** when its
monarch falls or its Citadel is taken (its lords fight on); shatter both to
win. The war is lost only if the King has fallen *and* his Citadel is taken,
or nothing of the realm is left. The **Three Crowns** panel shows each
crown's rank, castles, Citadel walls and whether its monarch rides.

### The Long Night

The Sovereign's own capital stands in a corner of the vale, its back to the
mountains and the river before it: a Citadel at the heart, an inner wall with
three gatehouses round the royal quarter, a great outer wall with five round
the lower city, both following the lie of the land, and thousands of houses,
parish churches and tower houses between them. Five wards are strongholds
that pay and raise men while they hold: the Market, the Smiths', the Granary,
Cathedral Close (a great cathedral) and the Royal Barracks. Each ward's
ground (its landmark, plaza and ring of houses) is laid out clear of the
walls, the gates, the streets, the Citadel's mount and ramps and the other
wards: the map searches round from its preferred bearing until it fits.
Outside lie
villages, mines and the river's two bridges and ford.

The Endless Night (undying: no upkeep, no supply, never wiped out, and fearless:
its bands fight until they are cut down) pours out of one Great Rift on the open
land before the city, across the river. The dead crawl out without pause and
swell the battalion gathering at the Rift's mouth; every couple of minutes the
Rift erupts and whole hosts come out at once, with fiends, wraith riders and,
from Midnight on, giants (with siege towers and rams) and trebuchets with their
crews. A war council directs them: battalions mass out of bowshot before the
weakest gate while others make for a second gate to pin its defenders, and when
enough have come up they all go in at once (the HUD warns where they mass).
Once a gate is theirs, every band pours through it for the wards and the inner
gates, then the Citadel; riders break off to burn the villages. The night has
four watches, each fiercer than the last: Dusk, Midnight, the Witching Hour and
Before Dawn. The dead feel little of arrows: bows and the archers on the walls (who shoot at
the dead within bowshot from every post) do them a fifth of the harm. The night is
fought fast: the dead march a third faster, battles resolve sooner, the first of
them reach the walls within half a minute. The city earns and recruits at half
the usual rate.

The dead are drawn as what they are: hunched risen corpses with burning eyes,
skeleton archers, wraiths on skeletal horses with manes of fire, horned fiends
with bat wings, and giants three times a man's height; a swarming mass, not ranks.

Dawn comes after 5 / 6 / 7 minutes (Squire / Knight / Warlord). In headless
nights with the computer defending, about 6, 3.5 and 2.5 in 10 are won.

### Convoy Raid

A short (8 to 10 minute) fight over one road. Five gold wagons leave the
Saffron Caravanserai in the south, one every 75 seconds, and roll by themselves
up a winding road through deep forest, over a river (one timber bridge, fords
up- and downstream) and along a mountain's flank to Highwold castle in the
north. There is no income, upkeep or mustering: the forces you set out with are
all there are.

- **Seizing a wagon** takes 5 seconds standing at it (the wagon stops while the
  team is cut loose). A guard within 64m stops it, but only a guard that is not
  fighting: a guard locked in a battle protects nothing, and a raider in a
  battle cannot unhitch anything. Driven off, the drivers take up the reins.
- **Escort** (pick the commander of the guard: Godfrey, Elowen, Varian, Isolde
  or Bran): the commander's host (480), Outriders (180 cavalry), Bowmen of the
  Road (200) and Pioneers (engineers, 900 gold for works and outposts).
  Right-click one of your wagons (or use its panel) to have an army walk beside
  it. Halt the whole train from the bar at the bottom of the screen, scout the
  woods, raise watch posts that find hidden raiders, and rebuild the bridge if
  it comes down. Win by bringing 3 wagons in.
- **Raid** (Corvin Ashe): his Whisper Blades (130, hidden on their own; see
  the spymaster) and his Hooded Bowmen (440, under a captain), with Light Horse
  (220) and Sappers (210), each in a hidden camp in the forest. The Blades go
  for the leader of a wagon's guards: struck down, the guards break and flee,
  and the Blades take a wagon left bare themselves (the harder the difficulty,
  the closer the guards watch their leaders). The sappers can pull the bridge down (the wagons then wade a ford,
  slowly) or bar the road with a barricade. Win by seizing 3 wagons. Routed
  raiders fall back to their camps.
- **Standing orders**: so one player can run a whole side, every band can be
  put on a standing order from its panel and carries it out by itself (shown on
  its map label); any order given by hand cancels it. Escort: *Escort* (walk
  beside the next unguarded wagon, switching to one caught alone), *Hunt* (ride
  down raiders seen near the wagons, otherwise screen ahead of the leading
  wagon), *Picket* (hold the road here; engineers by the river rebuild the
  bridge). Raiders: *Ambush* (lie in the trees here and take a weakly guarded
  wagon), *Harass* (pin the guards of a wagon passing near here in a fight),
  *Bridge* (engineers: pull the bridge down as the wagons near it, then wait
  where the ford road rejoins), *Strike* (the Whisper Blades: lie hidden here
  and, when ready, strike down the leader of a nearby wagon's guards, then take
  a wagon left bare). The bands without a commander start on one
  (Outriders hunt, Bowmen escort, Pioneers picket the bridge; Light Horse and
  Hooded Bowmen harass, Sappers see to the bridge).
- The computer plays the other side with the same standing orders: its ambushes
  move up the road ahead of the wagons, and its escort halts the train (never
  for more than 25 seconds) when a wagon is caught alone. Difficulty scales its
  forces (raiders 0.62x to 1.2x besides the Grey Sisters, escort 0.65x to 1.2x; Last Stand is Alliance War's alone); in headless matches of
  the computer against itself, Normal comes out about even.
- A side with no one left in the field loses.

Every random map comes in three sizes (small / medium / large), each balanced
separately with headless simulations. Both modes share the same six map types, each
built round one landmark that decides where the war is fought; the two sides always
start on either side of it (in Conquest and in Alliance War). The menu shows a live
preview of the map, and the minimap draws the walls, cliffs and roads.

| Map              | Landmark                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Shattered Crown  | A snowbound range east to west, crossed by three passes                                                       |
| Twin Sun Delta   | The Great River, west bank against east: a ford and the Great Bridge, then three fordable channels at the mouth (mud: slow, no charge) |
| Frostfire Reach  | The Long Wall, corner to corner between ice and ash: impassable but at two gates and one breach               |
| Gilded Coast     | The Red Escarpment: sheer cliffs across the land, climbed by three narrow canyons; the open coast below       |
| Whispering Basin | A ring of lakes round Heartmere, the island fortress, reached over narrow necks of land                        |
| The Great Divide | Two rivers, west against east, three crossings each; Gravewatch citadel on the old battlefield between them   |

Random maps derive entirely from the seed, so the same seed always gives the same world.
Wars are played in one sitting and end in victory or defeat; there are no saves. The
backend records each match's result and battle reports.

## How to play

| Input                       | Action                                                         |
| --------------------------- | -------------------------------------------------------------- |
| Left-click                  | Select an army or castle                                       |
| Right-click (army selected) | Move · on enemy army: intercept · on castle: besiege / station |
| Left-drag, WASD / arrows    | Pan                                                            |
| Wheel                       | Zoom (closer = lower, more cinematic angle)                    |
| Q / E, middle-drag          | Rotate                                                         |
| F · Tab · L · Esc           | Form army · cycle armies · chronicle · deselect                |

- **Formations**: Line (balanced), Wedge (huge charge, takes more losses),
  Schiltron (stops charges, -45% from cavalry, slow, weak to arrows), Skirmish
  order (-45% from arrows, better archers, weak to cavalry). Armies can also
  march in column (+30% speed) but fight badly if caught before re-forming.
- **Merge and split**: right-click one of your armies to merge into it, or use
  Join / Call / Split in the army panel.
- **Economy**: gold is the main limit. Capture castles and expand them (more
  income, manpower and garrison room). Auto-recruit keeps garrisons growing.
- **Alliances**: AI lords recruit, raid, relieve allied castles (including yours)
  and follow their alliance leader's offensive (gold ring). On an enemy castle,
  _Summon allies_ gathers allied contingents at one of your armies or castles,
  then everyone marches on the target together (or press _March now_).
  On one of your own castles, _Call for aid_ asks allied lords who are close,
  safe and have men to spare to send them to stand in it until the danger
  passes. AI lords call for aid too: answer from the card at the top of the
  sidebar (_Send_). Armies
  stationed at a castle (yours or an ally's) fight from its walls when it is
  besieged.
- **Units**: Infantry (beat cavalry), Cavalry (beat archers and engineers),
  Archers (beat infantry), Engineers (build outposts, breach walls).
- **Outposts** (need 15+ Engineers in the army): Field Camp, Watchtower (high
  ground), Forest Lodge (forest; keeps armies hidden), Bridge Fort (by a
  ford or bridge) and Supply Depot. Leave one empty and raiders will burn it.
- **Supply**: armies far from friendly castles, outposts or camps lose men and
  morale.
- **Seasons and weather**: winter slows marches and raises upkeep; rain and
  storms blunt archers; spring brings recruits, autumn the harvest.
- **Deep Freeze**: in the depth of each winter (from 2½ minutes in until 1½
  minutes before spring) stretches of the rivers and some lakes freeze solid
  and can be crossed anywhere, at 60% pace; a fight on the ice is treacherous
  (no charges, no squares, heavier losses). Which stretches freeze is fixed per
  map: cold ground more often, warm volcanic ground and the sea never, and at
  most half of a map's lakes. Warnings come before the freeze and the thaw; an
  army still on the ice when it breaks up loses a tenth of its men. No outposts
  on the ice.
- **Ambush**: an army holding still in a forest becomes hidden and strikes
  first when an enemy blunders into it.
- **Intrigue** (its own sidebar tab): buy truces, in Alliance War bribe enemy
  lords to change sides, buy free towns, send envoys to villages within reach,
  and track your infamy and the abbeys praying it away.
- **Realm rank**: every realm's rank rises with its total strength (top rank
  5 / 6 / 7 by map size) and is shown under its castles and outposts; all of a
  realm's castles grow grander with each rank.
- **Supply depots**: armies quarter inside (up to 900, out of sight) and new
  armies can be raised there, led only by commanders quartered in that depot.
  Wagon trains from the nearest friendly castle keep its stores full; enemies
  can seize the wagons, and a depot's supply reach shrinks as stores run out.
- **Rivers**: crossed at shallow fords (slow; no charging or squares in the
  water, 20% more losses) or on bridges engineers build.
- **Engineers** (three tabs on the army panel):
  - *Outposts*, anywhere on dry ground: Palisade Castrum (the strongest fort,
    slows enemies nearby), Wagon Laager (built in half the time, archers 1.45x,
    packs up for 70% back), Mangonel Redoubt (bombards armies and walls within
    380m while manned), Outrider Pavilion (troops inside hidden anywhere; a
    burst of speed and a 1.6x first blow when they ride out) and Supply Depot.
    An outpost left empty is taken by enemies who stand on it.
  - *Siege engines*, built where the army stands: siege tower (fight on the
    walls from the first moment), tortoise ram (walls 3x faster, fewer arrows,
    the breach shakes the garrison), mantlet wagons (half the arrow losses) and
    field trebuchet (stones from 450m while guarded).
  - *Field works*: spike stakes, hidden mud pits, road barricades, pitch
    barrels, timber bridges (and pulling down enemy ones). 15+ engineers in a
    siege undermine the walls: they stop mending for 3 minutes.
- **Sighting**: castles and holdings are known to all, but enemy armies show
  only within sight of your troops, castles, holdings or outposts (allies share
  what they see). The AI plays by the same rule.
- **Rear attacks**: joining a fight from behind the enemy's engaged line gives
  a short damage bonus and a charge that no spear wall stops.
- **Holdings**: besides villages, the countryside holds caravanserais (big
  trade wagons, faster wagons nearby), abbeys (volunteers for your castles,
  faster-healing commanders, infamy forgiven), wardens' keeps (riders that
  chase off scouts, wagons and small raids) and siege guildhalls (cheaper
  engineers, outposts and upgrades; walls mend faster).
- **Castles** (`render/fortress.ts`, `castletown.ts`, `farmland.ts`; outlines in
  `World.planCastle`): each lord's castle is built to its site, and the
  armies' walls follow the same outline. On a river or lake the wall squares
  off along the water (a road runs down from the gate facing it to a stone
  quay with a jetty, boats, fishermen's huts and net racks); on a hill it is
  drawn out along the ridge and hugs the brow over a battered revetment; on
  the plain it is an irregular polygon with towers at its corners. Four gates
  a quarter turn apart, the main gate towards the heart of the map (or the
  landward side); armies pass the walls only at the gates. Tier 1 is a motte
  and bailey; tier 2 a stone castle with a great keep; tier 3 adds an inner
  ward and a barbican; tier 4 and up a lower outer wall on its own levelled
  terrace, with drum towers where the roads pass. The realm that holds it
  sets its style: the King's side pale limestone with conical roofs, the
  Usurper's black basalt with iron thorns, the Sun Emperor's sandstone with
  ribbed domes and gilt, free lords grey stone with timber hoardings; roofs
  carry courses and eaves trim in the lord's hue (a castle taken across the
  lines is rebuilt in its new lord's style). Inside: the four streets lined
  shoulder to shoulder with tall jettied houses and shops, a ring lane and
  back lanes, a guildhall with its arcade on the square, a fountain, a smithy
  whose forge smokes, an armoury and weapon racks, barracks with archery
  butts and a quintain, stables, a chapel, walled gardens. Outside, on a broad
  gentle apron cleared of woods: faubourgs along curving roads out of the
  gates (townhouses near the gate, an inn and a market cross on a plaza,
  cottages with walled yards, farmsteads with barns; side alleys with a
  tannery, a potter's kiln, a carpenter's yard), every building on a stepped
  footing on a slope; and the farmland: fields of wheat, stubble with stooks,
  cabbages, vines, ploughed loam and hay behind hurdles or hedgerows with
  stiles, scarecrows and haystacks; a tower windmill with a gallery, a cap and
  tailpole and turning lattice sails, and the miller's cottage; an orchard in
  a stone-walled close with beehives; pastures of sheep, cattle or horses
  with a trough and a hayrick. Chimneys, forges and kilns smoke. A ruin stands
  broken among burnt houses and scorched fields.
- **Royal cities** (`render/city.ts`, `citadel.ts`, `precinct.ts`,
  `citycountry.ts`): the Citadel stands on the dead-level summit of its
  mount, whose steep face is hidden by a battered stone revetment with a
  string course, buttresses and a parapet; four grand ramps with balustrades,
  steps, lamps and piers climb to its gates. The Great Keep rises in three
  stages (the main block with an arcaded, gabled pavilion and a balcony on
  each face; a corbelled, crenellated upper stage; a lantern of stained glass
  under the great spire), with eight spires round it and flying buttresses,
  pointed windows, pilasters, giant banners and gilded bands; a grand entrance
  with twin towers, a great arch, a rose window and the royal arms heads the
  stair. Covered arcaded galleries join it to the palace and its dome, the
  great hall and the chapel. The gilding (finials, bands, the dome, the arms)
  is a metal material. The Citadel's precinct has processional avenues paved in
  a chequer with braziers, a ring road, a cloister round a fountain garden,
  the Guard's barracks and drill yard, the royal stables, the great lords'
  mansions, the treasury, the library tower and an observatory; each ward's
  landmark stands on a plaza ringed by town houses and shops, with stalls,
  carts, wells and smoke from the chimneys, and each gate has a square with a
  guard house and a toll booth. The city is built from some twenty kinds of
  house (jettied town houses, shops with awnings, terraces, an inn, a
  merchant's hall over an arcade, a smithy, a warehouse, tower houses, parish
  churches) on stone footings, wall to wall along the streets, its squares
  dressed with markets, crosses, benches and trees. Outside the great outer
  wall: gate towns, travellers' camps and a broad farmland of fields,
  windmills, orchards, pastures and farmsteads.
- **Rendering cost**: paving, fields, fences, hedges, animals, props and the
  fine work of buildings (framing, frames, shutters) go into meshes that cast
  no shadow; only walls, towers, keeps, building bodies and roofs, trees and
  windmills draw into the shadow map. Trees (the wild wood, the deep woods and
  the cities' courtyard trees) are split into chunks, and only the chunks near
  the camera cast shadows. A castle is rebuilt only when its tier,
  ruin, owner or style changes; castles off screen or far away skip their
  flags, sails and smoke.
- **Terrain**: three climates per map with their own rules, crossings by
  bridge or ford, and features: standing stones, windfall thickets and crag
  overlooks (none on a mountainside, a cliff or the water's edge), and the
  great woods (`FEATURES.oldwood`,
  `FEATURES.deepwood`; drawn in `render/woods.ts`):
  - **Old-growth forest**: a stand of giant firs and ancient broadleaves over
    an open floor of ferns, fallen giants and dappled light. Arrows do 30%
    less, charges lose 40% of their force, 10% fewer losses; horses 0.65x;
    troops waiting there hide in 4 seconds.
  - **The Deepwood**: a sea of trees rising to a dome at its heart, with a
    low mist drifting through it. Any host inside is seen only within 170m
    (the Wardens and the Thorn Hunt read its tracks out to 450m) and sees
    only half as far out itself. No charges; arrows do 50% less, horsemen
    30% less; foot 0.75x, horses 0.35x, so marching hosts go round it unless
    the way through is much shorter. Hidden bands are concealed there.
    Outposts can be built in both kinds of wood: the trees are cleared where
    they stand.
- **Villages**: win free villages over with envoys and gold. A vassal village
  runs itself: it raises its own militia, sends tribute wagons to its lord's
  nearest castle, walls itself in stone in time and sends militia to help a
  besieged castle nearby. Armies cannot be put into villages. In Alliance War
  it serves whoever won it over. Or
  plunder them for gold and captives, leaving ruins and a bad name.
- **Mines and lumber camps**: armies with 10+ engineers earn gold there (the
  rate grows with engineers, not army size); the gold travels home by wagon.
- **Scouting**: enemy strength far from your forces is only a rumour. Tap an
  enemy castle and press _Send_: 40 scouts ride out of the castle or supply
  depot you pick (any army of 80 or fewer can scout too) and report if they
  make it home; whoever spots
  them sends riders after them, and captured scouts can betray their castle.
- **Maps** are 1.4× wider than before, leaving room for the countryside.
- **Camera**: overhead or tilted view (V, or the button in the top bar);
  touch screens start overhead.
- **Commander growth**: at each rank a commander picks one of three traits.
- **War honours**: in Alliance War every lord's kills and
  captures are ranked.
- **The Usurper Queen**: Queen Morwenna leads the enemy alliance (and the
  Conquest coalition) with her crimson Thorn Guard, 520 knights. She holds
  court in the enemy High Seat and rides out at the rear of some Great Hosts,
  steeling them with her presence. Destroy her guard and the war is won. Her
  last known whereabouts show as a red crown on the map and in the War tab;
  scouts who come near her bring word.
- **The spymaster**: Corvin Ashe, Master of Whispers, leads his Whisper Blades
  (130 knife-men, fixed like the Royal Guard) and nothing else; they hide on
  their own, strike at enemy commanders (the Usurper Queen too), cover the
  Night Sappers' work, never run out of supply and march 1.28x. A
  failed strike costs about 30% of the band but still shakes the host
  (morale -20); the panel's *Strike odds* list shows the chance against every
  enemy army in sight, and a tap sends them after it. Wiped
  out, they gather again 5 minutes later, 60 strong; an abbey of yours fills
  them up (the Royal Guard too). In woods, thickets, river valleys, on a
  mountain's flank, in a hidden camp, or in rain, storm and snow the band is
  **concealed**; on open ground in fair weather it is **disguised** as
  pilgrims and pedlars, which the enemy pays no heed, though scouts (280m),
  castle walls (240m) and watch posts look closer than they do at a concealed
  band (150m from walls). Their first blow strikes 2.2x as hard (1.9x from
  disguise) for 20 seconds. Found out, they cannot hide again for 90 seconds.
  Our own hidden bands walk cloaked in swirling shadow, ringed by turning
  violet arcs (concealed) or amber dashes (disguised), with an eye on their label
  (closed: concealed, half-open: disguised, open: seen); in disguise their
  standard is furled, and the enemy takes them for pilgrims, pack mules and
  covered carts (our own we see as they are). With the band selected, every enemy watch shows on the ground (a
  red ring: even a concealed band is found inside it; a faint orange ring:
  where a disguise is seen through; enemy scouts in sight carry one too), the
  planned road is coloured green (under cover), gold (in disguise) or red
  (watched), and the panel sums up the road ahead.
- **The Night Sappers**: Tamsin Holt, Mistress of the Night Sappers, leads 90
  Saboteurs (fixed like the Blades) and nothing else. They hide by the
  Blades' rules (concealed under cover, disguised in the open; the enemy takes
  them for pilgrims), never run out of supply, march 1.28x and are useless in
  a fight. Unseen near an enemy castle or fieldwork they do the sabotage
  (`SABOTAGE`): Foul the Wells, Fire the Granary, Undermine the Postern, Spoil
  a depot's Stores, Fire the Works. With the Whisper Blades within 320m to
  cover them (`SAPPERS.cover`; set them to Follow the Blades) the work takes 8
  seconds instead of 12 and raises the alarm 15% of the time instead of 35%.
  Wiped out, they gather again 5 minutes later (40 strong); an abbey fills
  them up. The enemy has the same in Brother Gall's Rootcutters, who lie up
  outside the castle a Great Host is marching on and open its postern, the
  Grey Sisters covering them.
- **The Wardens of the March**: Rowan Fenwick leads 150 Outriders (mounted
  bowmen) and nothing else. They see 1.8x as far as an army, find hidden
  bands within 450m (concealed or disguised alike), and keep every enemy army
  they sight on our map for 60 seconds; poor in a stand-up fight, they storm
  no walls, never run out of supply and march 1.25x. Selected, they show two
  green rings: where they find hidden bands, and how far they see. The enemy
  has the same in Corrick Vane's Thorn Hunt, which rides with the Great Hosts,
  hunts our Whisper Blades and circles its frontier castle. Wiped out, they
  gather again 5 minutes later (70 strong); an abbey fills them up.
- **Army size and battle groups**: outside the Long Night and Convoy Raid an
  army holds at most 1500 soldiers under a named commander and 800 under a
  captain (`ARMY_CAP`); mustering more leaves the rest in the garrison, and
  merging into a full army leaves the rest beside it as an escort. Larger
  forces march as a **battle group**: a lead army and up to four escorts (the
  Escort standing order). The lead's panel sets how they stand about it: *Box*
  (left, right, ahead, behind), *Line* (abreast, two on either side) or
  *Wedge* (a V behind the lead); the group keeps to its slowest army. When
  the lead assaults a castle the escorts fan out round it (about 63 degrees
  apart) and join the siege from their own sides: each extra side costs the
  defenders 10% of their walls' worth, at most 30% (`ENCIRCLE`). The AI's
  Great Hosts march as battle groups, and an AI muster larger than one army
  goes out as a lead with escorts.
- **Commanders out of action**: regrouping 90 s after a rout (from reaching a
  castle), wounded 4 min when their army is destroyed, 5 min when struck down
  by assassins (`DOWNTIME`, `BLADES.wound`); each star above the first takes
  10% off (at most half), and abbeys nurse them faster. Both sides alike.
- **Coming home**: an ordinary army of ours that retreats (by the Retreat
  order, or routed from a fight) and reaches a castle of ours goes into its
  garrison, its commander free to lead again; the fixed bands and battle
  groups come home as they are (`keepsTogether`).
- **Standing orders in the field**: from an army's panel, *Escort* another army
  of ours (each escort takes a place of its own beside it: left, right, then
  back-left, back-right, front-left, front-right; it joins the escorted army's
  fights, and the escorted army keeps to the pace of its slowest escort),
  *Follow* one a little way behind (several in a file), or *Guard* a post
  (fall on visible enemies within 250/400/600m and come back; against a host
  more than 1.6x as strong, stand fast at the post). The army to escort or
  follow is picked by tapping it on the map (or from a list of the nearest).
  Escorts never merge into the army they guard; any order by hand cancels a
  standing order. Player armies only (`game/fieldorders.ts`).
- **Fixed bands' own troops**: the Royal Guard and the Thorn Guard are
  Household Knights, the Blades and the Sisters Assassins, the Sappers and the
  Rootcutters Saboteurs, the Wardens and the Hunt Outriders: unit types of their own (`recruitable: false`), raised in no
  castle, each drawn in its own harness.
- **The Grey Abbess**: the Usurper's spymaster, Mother Sereth, leads her Grey
  Sisters (130, by the same rules as the Blades): they strike at our
  commanders (the King too, rarely; the easier the war, the closer our leaders
  are guarded), cover Brother Gall's Rootcutters at their work on our
  castles and rob our wagons, and mend in her castles. Our walls, wardens' keeps, outposts and scouts find them out, and
  the chronicle reports it.
- **Commanders' hosts**: an army takes its commander's kind of host (Godfrey a
  siege train, Elowen raiding horse, Varian a pike wall, Isolde an archer host,
  Bran a knightly charge; a captain combined arms) and formation; the one
  choice left is whether to bring engineers (at least 20). Troops the garrison
  lacks are filled from what it has, or hired on the spot.
- **Auto-recruit**: per castle, off or raising troops for a kind of host (the
  recommended mix suits any commander, engineers included); it buys whatever
  the garrison is shortest of, spends at most 25 / 50 / 75% of net income
  (Thrifty / Steady / Eager) and always leaves 400 gold for building.
- **Alliance War difficulty** is how much of the land your alliance still
  holds: Squire 5:5, Knight 6:4, Warlord 7:3, Last Stand 8:2, against an enemy
  that always plays hard. From Warlord up, palisade forts and mangonel redoubts
  already stand at the fords and before the frontier castles. In a Last Stand,
  holding out until the relief fleet lands (Spring 1248) also wins the war.
- **War report**: when the war ends, a thirty-second timelapse replays it on
  the map (holdings changing hands, battles flaring, the seasons turning),
  with the campaign's honours: the deadliest commander, the breaker of walls
  and the plunder of the roads.
- **Night mode**: the moon / sun button in the header dims the map and the
  parchment for playing late (remembered per browser).
- **Navigation**: the holdings list (top right, scrolls when long) shows your castles, vassal villages and outposts;
  press **C** or the Home button to fly to your seat of power.
- **Commanders**: each has a pixel portrait and clear strengths and drawbacks
  (stored in the database, editable in the admin). King Aldric, the Sovereign, rides
  with the Royal Guard: 520 knights that can never be replaced; armies near him
  fight harder, and if he falls the war is lost.
- **Counters**: spears beat cavalry, men-at-arms beat spears, cavalry rides down
  archers and siege crews, archers soften infantry. The formation screen tells
  you what your mix is strong and weak against.
- **Sieges**: walls must be battered down (siege engineers do this best) while
  defenders shoot from the ramparts; then the garrison is stormed.
- **Morale and retreat**: armies break when morale collapses or when they
  pass their auto-retreat loss threshold. Cavalry punishes routing enemies.
- **The Great Host**: the enemy periodically sends detachments from several
  castles to a muster point (pulsing red ring). Catch them before they merge.
- **Win** by taking Dreadmoor; **lose** if Aethelgard falls.

## API

| Endpoint                                       | Purpose                                     |
| ---------------------------------------------- | ------------------------------------------- |
| `GET /api/content/`                            | Unit types, commanders, scenarios           |
| `POST /api/campaigns/`                         | Record a new match (mode, seed, difficulty) |
| `PATCH /api/campaigns/{id}/`                   | Record the final result and summary         |
| `GET/POST /api/campaigns/{id}/battle-reports/` | Battle history                              |
| `GET /api/campaigns/{id}/stats/`               | Aggregated battle statistics                |

## Phones and tablets

Played in landscape (holding the device upright shows a prompt to turn it).
Tap to select, drag to pan, pinch / twist to zoom and rotate. With one of
your armies selected, a thumb stick appears at the bottom left: it drives the
army by hand (push harder to go faster; a large host takes a moment to get
going and to wheel about; let go and it rolls to a halt). A quick tap on the
stick turns the commander's view on or off: the camera drops low behind the
army and looks out to the horizon (far place names are hidden), and stays there
until you tap again, when the map turns back the way it faced before. Drag the
map to look around freely, and touch the stick again to snap back. Double-tap (or long-press) a
spot or a target to march there. Details open in a panel down the right side
(fold it away with ›› to keep both hands on the map); your holdings are
listed at the top right.

## Development

- `cd backend && .venv/bin/python manage.py test game` runs the API tests.
- `cd frontend && npx tsx scripts/simulate.ts content.json <campaign|survival|alliance> [difficulty] [seconds] [seed]`
  runs the simulation headlessly with the AI playing your realm, for balance
  checks (fetch `content.json` from `/api/content/`).
