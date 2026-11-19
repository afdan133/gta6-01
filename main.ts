// Entry packer for the gta6-01 bounty.
//
// What this script does, top to bottom:
//   1. work out where it lives ("here") and where the grader wants output
//   2. make the output directory (env MAKEFUN_OUTPUT_DIR, defaulting to /output)
//   3. copy the static game files and the screenshots next to this file into it
//   4. hand the whole directory to the vendored make.fun kit, which returns the
//      dossier bytes; those get written as dossier.json
//
// Node 22, node:fs / node:path / node:url only. Run as `node main.ts`.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function stageAssets(): void {
  mkdirSync(outputDir, { recursive: true });
  cpSync(join(here, 'game'), join(outputDir, 'game'), { recursive: true });
  const shots = join(here, 'screenshots');
  if (existsSync(shots)) cpSync(shots, join(outputDir, 'screenshots'), { recursive: true });
}

function writeDossier(): void {
  const caps = {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  };
  writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, caps));
}

stageAssets();
writeDossier();
