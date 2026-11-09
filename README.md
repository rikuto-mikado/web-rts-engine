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

| Mode | Map | Goal |
|---|---|---|
| **Conquest** | Random, in three sizes | You against a coalition: take its capitals, keep yours |
| **Alliance War** | Random, 16 / 24 / 32 realms in two alliances | Your alliance takes the enemy High Seat |

Every random map comes in three sizes (small / medium / large), each balanced
separately with headless simulations. Both modes share the same six map types: Green Vales, Highland Passes,
Frozen North, Sunscorched Steppe, Autumn Weald and Ashen Marches. The menu shows a live preview of the map.

Random maps derive entirely from the seed, so the same seed always gives the same world.
Wars are played in one sitting and end in victory or defeat; there are no saves. The
backend records each match's result and battle reports.

## How to play

| Input | Action |
|---|---|
| Left-click | Select an army or castle |
| Right-click (army selected) | Move · on enemy army: intercept · on castle: besiege / station |
| Left-drag, WASD / arrows | Pan |
| Wheel | Zoom (closer = lower, more cinematic angle) |
| Q / E, middle-drag | Rotate |
| F · Tab · L · Esc | Form army · cycle armies · chronicle · deselect |

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
  *Summon allies* gathers allied contingents at one of your armies or castles,
  then everyone marches on the target together (or press *March now*).
  On one of your own castles, *Call for aid* asks allied lords who are close,
  safe and have men to spare to send them to stand in it until the danger
  passes. AI lords call for aid too: answer from the War tab (*Send*). Armies
  stationed at a castle (yours or an ally's) fight from its walls when it is
  besieged.
- **Units**: Infantry (beat cavalry), Cavalry (beat archers and engineers),
  Archers (beat infantry), Engineers (build outposts, breach walls).
- **Outposts** (need 15+ Engineers in the army): Field Camp, Watchtower (high
  ground), Forest Lodge (forest; keeps armies hidden), Bridge Fort (by a
  bridge) and Supply Depot. Leave one empty and raiders will burn it.
- **Supply**: armies far from friendly castles, outposts or camps lose men and
  morale.
- **Seasons and weather**: winter slows marches and raises upkeep; rain and
  storms blunt archers; spring brings recruits, autumn the harvest.
- **Ambush**: an army holding still in a forest becomes hidden and strikes
  first when an enemy blunders into it.
- **Diplomacy**: buy free towns, buy truces, and in Alliance War bribe enemy
  lords to change sides.
- **Realm rank**: every realm's rank rises with its total strength (top rank
  5 / 6 / 7 by map size) and is shown under its castles and outposts; all of a
  realm's castles grow grander with each rank.
- **Supply depots**: armies quarter inside (up to 900, out of sight) and new
  armies can be raised there, led only by commanders quartered in that depot.
  Wagon trains from the nearest friendly castle keep its stores full; enemies
  can seize the wagons, and a depot's supply reach shrinks as stores run out.
- **Engineers' works**: abatis (slows enemies), spike stakes (stops charges),
  burning a bridge (closed for 5 minutes) and rebuilding it.
- **Rear attacks**: joining a fight from behind the enemy's engaged line gives
  a short damage bonus and a charge that no spear wall stops.
- **Villages**: win free villages over with envoys and gold. A vassal village
  runs itself: it raises its own militia, sends tribute wagons to its lord's
  nearest castle, walls itself in stone in time and sends militia to help a
  besieged castle nearby. Armies cannot be put into villages. In Alliance War
  it serves whoever won it over. Or
  plunder them for gold and captives, leaving ruins and a bad name.
- **Mines and lumber camps**: armies with 10+ engineers earn gold there (the
  rate grows with engineers, not army size); the gold travels home by wagon.
- **Scouting**: enemy strength far from your forces is only a rumour. Small
  parties (80 or fewer) scout and report if they make it home; whoever spots
  them sends riders after them, and captured scouts can betray their castle.
- **Maps** are 1.4× wider than before, leaving room for the countryside.
- **Camera**: overhead or tilted view (V, or the button in the top bar);
  touch screens start overhead.
- **Commander growth**: at each rank a commander picks one of three traits.
- **War honours**: in Alliance War every lord's kills and
  captures are ranked.
- **Navigation**: the holdings bar (bottom) lists your castles and outposts;
  press **C** or the Home button to fly to your seat of power.
- **Commanders**: each has a pixel portrait and clear strengths and drawbacks
  (stored in the database, editable in the admin). Lord Cassian is the all-rounder.
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

| Endpoint | Purpose |
|---|---|
| `GET /api/content/` | Unit types, commanders, scenarios |
| `POST /api/campaigns/` | Record a new match (mode, seed, difficulty) |
| `PATCH /api/campaigns/{id}/` | Record the final result and summary |
| `GET/POST /api/campaigns/{id}/battle-reports/` | Battle history |
| `GET /api/campaigns/{id}/stats/` | Aggregated battle statistics |

## Phones and tablets

Tap to select, drag to pan, pinch / twist to zoom and rotate. To order an army,
long-press the target or tap **Give an order** and then the target. Panels
become a drawer (☰) and a bottom sheet on small screens.

## Development

- `cd backend && .venv/bin/python manage.py test game` runs the API tests.
- `cd frontend && npx tsx scripts/simulate.ts content.json <campaign|survival|alliance> [difficulty] [seconds] [seed]`
  runs the simulation headlessly with the AI playing your realm, for balance
  checks (fetch `content.json` from `/api/content/`).
