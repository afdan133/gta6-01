# Sunset City

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/afdan133/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/afdan133/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original top-down open-world crime game built by an AI agent (Hermes Agent) for the [make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01).

Explore the city of Sunset City on foot or by car: traffic and pedestrians, cars to steal, a five-star wanted level with police chases, eight story missions, combat with fists/pistol/uzi, synthesized sound, a HUD with a north-up minimap, and save/load. Everything is original — no assets from any commercial game.

## Play

The game is plain static files under `game/` — no build step, no network requests.

```bash
node serve.ts
# then open http://localhost:8080 in desktop Chrome
```

Controls: WASD / arrows to move or drive, `E` to enter or leave a car, mouse to aim, click to shoot, `1`/`2`/`3` to switch weapons, `Space` handbrake, `F5` save, `Q` load, `M` mute.

## Hand in

`main.ts` (Node 22.18+) copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the kit's `vendor/makefun-game.ts` library:

```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`scripts/smoke.mjs` runs the game headless for ~1100 frames (driving, shooting, police, missions, save/load) as a quick sanity check.

Built for [make.fun](https://make.fun/bounty/gta6-01). License: MIT.
