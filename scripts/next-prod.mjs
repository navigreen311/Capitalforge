// ============================================================
// Run a Next command against a separate build directory
//
//   node scripts/next-prod.mjs build
//   node scripts/next-prod.mjs start -p 3000
//
// `next dev` and `next start` both read and write `distDir`. Pointed at the
// same one they fight: a production build replaces the chunks a running dev
// server is holding, and the dev server dies with
//
//   Error: Cannot find module './383.js'
//   Require stack: .../.next/server/webpack-runtime.js
//
// while the production server keeps serving a route manifest that no longer
// matches the disk, which reads as a 404 on a page that exists. Both were
// seen on this repo, from one `npm run build:frontend` run while two servers
// were up.
//
// So the production server gets its own directory. A node wrapper rather than
// an inline `NEXT_DIST_DIR=... next build` in the npm script, because npm runs
// scripts through cmd.exe on Windows, where that syntax is not an assignment —
// it is a command name, and it fails. `cross-env` would also solve it; this
// avoids adding a dependency for two scripts.
//
// The default stays `.next` everywhere else: the Dockerfile copies
// `src/frontend/.next/standalone` and CI archives `src/frontend/.next/` under
// that name, and neither should change because a local convenience needed it.
// ============================================================

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const frontend = resolve(repoRoot, 'src', 'frontend');
const nextBin = resolve(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/next-prod.mjs <build|start> [...next args]');
  process.exit(1);
}

// Honoured if the caller set it, so a second production server can have a
// third directory without editing this file.
const distDir = process.env.NEXT_DIST_DIR ?? '.next-prod';

console.log(`[next-prod] ${args[0]} with distDir=${distDir}`);

const child = spawn(process.execPath, [nextBin, ...args], {
  cwd: frontend,
  env: { ...process.env, NEXT_DIST_DIR: distDir },
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
