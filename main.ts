// Token Radar, radar-4: a program/v1 entry for token-radar-01, Node 22, standard library only.
//
// It reads the sealed snapshot (from /input/snapshot.json, or --input
// <file|directory>), scores every launch candidate with the radar-4 model in
// lib/model.ts, and writes the ranked board to /output/board.json, the
// dashboard's data beside the page as data.js, copies dashboard/ and
// screenshots/ into /output, and writes /output/dossier.json last with the
// vendored make.fun library. The scorer rebuilds that dossier from /output
// and compares bytes, so the dossier is always written last.
//
// The board covers the whole watchlist plus every other launch candidate the
// snapshot holds — wrapped, staked, bridged and exchange products are set
// aside rather than ranked as first tokens, and protocols whose token already
// trades are listed separately with their market caps. Two runs write
// identical bytes: the sort is total (value, then TVL, then slug) and nothing
// in the run reads the clock, the network, or the environment beyond the
// input and output paths.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardProblem, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the bytes, the rest refuse. */
const TEXT_CAP = 65_536;
const SHOT_CAP = { max: 4, max_bytes: 524_288 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** The value of `--name <value>` or `--name=<value>`, or `fallback`. */
function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

/** Copy a directory's regular files into `dest`, skipping dot-names, and report what landed. */
function copyDir(from: string, dest: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(dest, { recursive: true });
  const landed: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const src = join(from, name);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(dest, name));
    landed.push(name);
  }
  return landed;
}

const inputArg = flag('input', '/input');
const snapPath = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(snapPath)) {
  process.stderr.write(`token radar: no snapshot at ${snapPath}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const outDir = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snap = parseSnapshot(readFileSync(snapPath, 'utf8'));
const { board, data } = buildRadar(snap);
const problem = boardProblem(board, snap);
if (problem !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${problem}\n`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(data));

const dashFiles = copyDir(join(here, 'dashboard'), join(outDir, 'dashboard'));
const shotFiles = copyDir(join(here, 'screenshots'), join(outDir, 'screenshots'));
if (shotFiles.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shotFiles.length} image${shotFiles.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shotFiles) {
  if (!SHOT_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, { text_max_bytes: TEXT_CAP, screenshots: SHOT_CAP, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

process.stdout.write(
  `token radar: ${snap.protocols.length} protocols, ${snap.watchlist.length} on the watchlist, ${board.length} rows scored (${data.early_size} beyond the watchlist, ${data.live_size} live set aside, ${data.set_aside} pre-token set aside)\n` +
    `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ${join(outDir, 'dashboard')} (${dashFiles.length} files), ${join(outDir, 'screenshots')} (${shotFiles.length} images) and ${join(outDir, 'dossier.json')}\n`,
);
