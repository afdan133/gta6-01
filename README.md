# Sunset City

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/afdan133/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/afdan133/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original top-down open-world crime game set at a permanent golden hour. Every sprite, sound
and street is generated in code — no borrowed assets, no libraries, no network calls. Built as
an entry for the [gta6-01 bounty on make.fun](https://make.fun/bounty/gta6-01).

## What's in the box

- A 96×96-tile city generated from a seed: road grid, downtown towers, a beach, a harbor,
  seven named districts
- On-foot movement and drivable traffic — steal any car, drift with the handbrake
- Ambient pedestrians who flee gunfire and police who respond to a five-star wanted meter
- Eight story missions with an original cast, from errands to a convoy finale
- Combat: fists, pistol and uzi, mouse aim, exploding cars, pickups
- HUD with health/armor/cash, wanted stars, and a circular north-up minimap
- Fully synthesized WebAudio: engine loop, siren, gunfire, explosions, mission stingers
- Save/load through localStorage with a 10-second auto-save

## Playing it

Serve the static files in `game/` and open the page in a desktop browser:

```bash
node serve.ts
# then open http://localhost:8080
```

Controls:

| Key | Action |
| --- | --- |
| WASD / arrows | walk and drive |
| Shift | sprint |
| Space | handbrake |
| E | enter / exit vehicle |
| Mouse + left click | aim and shoot |
| 1 / 2 / 3 | fists / pistol / uzi |
| M | mute |
| F5 / Q | save / load |

## Packaging

`main.ts` (Node 22, standard library only) stages `game/` and `screenshots/` into
`MAKEFUN_OUTPUT_DIR` (default `/output`) and writes `dossier.json` with the unmodified vendored
kit in `vendor/makefun-game.ts`:

```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`scripts/smoke.mjs` boots the whole game headlessly (stubbed canvas/DOM), runs about a thousand
fixed-step frames, steals a car, fires both guns, earns five stars, blows a car up and walks a
mission marker — a cheap regression net after any change:

```bash
node scripts/smoke.mjs
```

MIT licensed — see `LICENSE`.
