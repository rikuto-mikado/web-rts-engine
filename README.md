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

### The Long Night

The Sovereign's own capital stands in a corner of the vale, its back to the
mountains and the river before it: a Citadel at the heart, an inner wall with
three gatehouses round the royal quarter, a great outer wall with five round
the lower city, both following the lie of the land, and thousands of houses,
parish churches and tower houses between them. Five wards are strongholds
that pay and raise men while they hold: the Market, the Smiths', the Granary,
Cathedral Close (a great cathedral) and the Royal Barracks. Outside lie
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
- **Raid** (Corvin Ashe, 440): his band hides on its own (see the spymaster),
  with Light Horse (220) and Sappers (210), each in a hidden camp in the
  forest. The sappers can pull the bridge down (the wagons then wade a ford,
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
  where the ford road rejoins). The bands without a commander start on one
  (Outriders hunt, Bowmen escort, Pioneers picket the bridge; Light Horse
  harass, Sappers see to the bridge).
- The computer plays the other side with the same standing orders: its ambushes
  move up the road ahead of the wagons, and its escort halts the train (never
  for more than 25 seconds) when a wagon is caught alone. Difficulty scales its
  forces (raiders 0.8x to 1.35x, escort 0.65x to 1.2x; Last Stand is Alliance War's alone); in headless matches of
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
| Gilded Coast     | The Red Escarpment: sheer cliffs across the land, climbed by three narrow canyons; a fast shore road below    |
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
- **Terrain**: three climates per map with their own rules, crossings by
  bridge or ford, and features: standing stones, terraced slopes, windfall
  thickets and crag overlooks.
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
- **The spymaster**: Corvin Ashe, Master of Whispers, hides the light troops
  he leads on his own (500 men; 1000 at ★★★, 1500 at ★★★★★; no knights,
  heavy foot or siege engines). In woods, thickets, river valleys, on a
  mountain's flank, in a hidden camp, or in rain, storm and snow the band is
  **concealed**; on open ground in fair weather it is **disguised** as
  pilgrims and pedlars, which the enemy pays no heed, though scouts (280m),
  castle walls (240m) and watch posts look closer than they do at a concealed
  band (150m from walls). Hidden bands march at 0.85x and go hungry half as
  fast; engineers among them can raise a secret Outrider Pavilion the enemy
  knows nothing about. Their first blow strikes 2.2x as hard (1.9x from
  disguise) for 20 seconds. Found out, they cannot hide again for 90 seconds.
  Our own hidden bands walk in a drifting mist, with an eye on their label
  (closed: concealed, half-open: disguised, open: seen); in disguise they are
  drawn as pilgrims, pack mules and covered carts, without banner or mounted
  commander. With the band selected, every enemy watch shows on the ground (a
  red ring: even a concealed band is found inside it; a faint orange ring:
  where a disguise is seen through; enemy scouts in sight carry one too), the
  planned road is coloured green (under cover), gold (in disguise) or red
  (watched), and the panel sums up the road ahead.
- **The Grey Abbess**: the Usurper's spymaster, Mother Sereth, sends bands of
  grey pilgrims (by the same rules) behind our lines to seize wagon trains and
  empty outposts, pressing on when found unless a stronger force closes in.
  Our walls, wardens' keeps, outposts and scouts find them out, and the
  chronicle reports it.
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
