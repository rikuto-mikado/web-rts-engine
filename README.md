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
| **Conquest** | The hand-made *Ashen Marches*, or a random map | You against a coalition: take its capitals, keep yours |
| **Alliance War** | Random, 16 / 24 / 32 realms in two alliances | Your alliance takes the enemy High Seat |
| **Great Siege** | A walled town: 6 gates, towers, 6 districts, citadel; camps on every side | You are one lord among many. Defenders hold the citadel 20 min; attackers take it |

Every random map comes in three sizes (small / medium / large), each balanced
separately with headless simulations. Random maps come in five types: Green Vales, Highland Passes, Frozen North,
Sunscorched Steppe and Lakelands. The menu shows a live preview of the map.

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
- **Castle splendour**: castles grow grander as their garrison reaches
  1,000 / 1,500 / 2,000 / 3,000 / 4,000.
- **Commander growth**: at each rank a commander picks one of three traits.
- **War honours**: in Alliance War and Great Siege every lord's kills and
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
