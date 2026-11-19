# Sunset City

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/afdan133/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/afdan133/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Sunset City is an original top-down, open-world crime game — the whole thing
written by an AI agent as a [make.fun](https://make.fun/bounty/gta6-01) entry,
with no assets borrowed from any commercial title.

What you get in the city: traffic to weave through, pedestrians on the
sidewalks, cars you can yank people out of, a five-star wanted meter and police
that act accordingly, eight story missions, three weapons (fists, pistol, uzi),
fully synthesized audio, a HUD with a north-up minimap, and save/load via the
browser.

## Running it

The game is nothing but static files under `game/` — no build, no bundler, no
network calls. Serve the folder and open it in a desktop browser:

```bash
node serve.ts
# open http://localhost:8080
```

Controls:

- WASD or arrow keys — walk / drive
- `E` — enter or exit a vehicle
- Mouse — aim; left click — fire
- `1` / `2` / `3` — fists / pistol / uzi
- `Space` — handbrake
- `F5` — save, `Q` — load
- `M` — mute

## Packaging for the grader

`main.ts` (Node 22, standard library only) stages `game/` and `screenshots/`
into the output directory (`MAKEFUN_OUTPUT_DIR`, default `/output`) and writes
`dossier.json` using the unmodified vendored kit at `vendor/makefun-game.ts`:

```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Distributed under the MIT license.
