// Entry packer for the gta6-01 bounty.
//
// Steps, in order:
//   1. resolve this file's own directory and the output directory (MAKEFUN_OUTPUT_DIR, /output)
//   2. create the output directory and copy game/ plus screenshots/ into it
//   3. hand that directory to the vendored make.fun kit and write the dossier it returns
//
// Node 22, node: standard library only. Run as `node main.ts`.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The caps the bounty's gate hands buildDossier; passing the same ones keeps our dossier
// byte-identical to what the scorer recomputes.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function stage(): void {
  mkdirSync(outDir, { recursive: true });
  cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });

  const shots = join(here, 'screenshots');
  if (existsSync(shots)) {
    cpSync(shots, join(outDir, 'screenshots'), { recursive: true });
  }
}

function writeDossier(): void {
  const bytes = buildDossier(outDir, CAPS);
  writeFileSync(join(outDir, 'dossier.json'), bytes);
  console.log(`dossier.json written (${bytes.byteLength} bytes) in ${outDir}`);
}

stage();
writeDossier();
