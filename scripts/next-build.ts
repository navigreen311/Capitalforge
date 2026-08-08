// ============================================================
// Build the frontend into a directory no dev server is using
//
//   npm run build:frontend
//
// `next build` cleans its distDir before writing. `next dev` serves from
// the same distDir and keeps an in-memory record of what it has already
// emitted. Point both at `.next` and the build deletes the dev server's
// chunks, while the dev server — still believing they exist — never
// rewrites them. The page keeps rendering, because the HTML and React
// are fine; only the assets 404. It reads as a CSS bug.
//
// Observed on 2026-08-07: `next dev` started 15:09, a `npm run build`
// at 17:49 replaced `.next`, and from then on every page served
//
//   <link rel="stylesheet" href="/_next/static/css/app/layout.css">   → 404
//
// with `.next/static/css/app/` present on disk and empty. The dev
// server had recreated the directory and not the file.
//
// scripts/next-prod.ts already gave the production *server* its own
// directory for the same reason. This does the same for the *build*,
// from the other side.
//
// Two consumers genuinely need the output at `src/frontend/.next`:
// Dockerfile.frontend copies `.next/standalone` and `.next/static`, and
// the CI build job uploads `src/frontend/.next/`. Both now set
// NEXT_DIST_DIR=.next explicitly. That is deliberate: deciding by
// sniffing for CI or NODE_ENV would put the production image one
// environment-variable change away from silently building to a path
// nothing copies from. If either forgets, the COPY fails loudly at
// image-build time, which is the failure mode to want.
// ============================================================

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createConnection } from 'node:net';

const repoRoot = resolve(process.cwd());
const frontend = resolve(repoRoot, 'src', 'frontend');
const nextBin = resolve(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

/**
 * Local builds go somewhere nothing else reads. Docker and CI set this
 * to `.next` because they copy from that path by name.
 */
const distDir = process.env['NEXT_DIST_DIR'] ?? '.next-build';

const devPort = Number(process.env['FRONTEND_PORT'] ?? '3000');

/** Resolves true if something accepts a TCP connection on the port. */
function portInUse(port: number): Promise<boolean> {
  return new Promise((resolveP) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const done = (inUse: boolean): void => {
      socket.destroy();
      resolveP(inUse);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => {
      done(true);
    });
    socket.once('timeout', () => {
      done(false);
    });
    socket.once('error', () => {
      done(false);
    });
  });
}

async function main(): Promise<void> {
  const target = resolve(frontend, distDir);

  // `static/development` is written only by `next dev`. Its presence
  // means this directory belongs to a dev server — but not necessarily a
  // running one, and refusing to build because a dev server ran here
  // last week would be noise. Both conditions have to hold.
  const looksLikeDevDir = existsSync(resolve(target, 'static', 'development'));
  const serverUp = await portInUse(devPort);

  if (looksLikeDevDir && serverUp) {
    console.error(
      `\n[next-build] Refusing to build into ${distDir}.\n\n` +
        `  A server is listening on port ${String(devPort)} and ${distDir}/static/development\n` +
        `  exists, so a dev server is serving from the directory this build\n` +
        `  would clean. That deletes the chunks it is holding. It does not\n` +
        `  crash — pages keep rendering and every asset 404s, which looks\n` +
        `  like a stylesheet bug rather than a build collision.\n\n` +
        `  Either stop the dev server, or build elsewhere:\n\n` +
        `    NEXT_DIST_DIR=.next-build npm run build:frontend\n`,
    );
    process.exit(1);
  }

  console.log(`[next-build] building with distDir=${distDir}`);

  // `next build` rewrites these two tracked files to name the distDir it
  // was given: next-env.d.ts gets a `<reference path="./<distDir>/types/
  // routes.d.ts">` and tsconfig.json gains a matching entry in "include".
  //
  // Left alone, a local build would dirty the working tree on every run
  // and CI would flip both back, so the pair would ping-pong through
  // review and eventually get committed pointing at a directory the
  // other environment does not produce. Next owns the content of these
  // files — next-env.d.ts says so in a comment — so the honest thing is
  // to let it write them and put back what was committed.
  const managed = [resolve(frontend, 'next-env.d.ts'), resolve(frontend, 'tsconfig.json')].filter(
    (f) => existsSync(f),
  );
  const before = new Map(managed.map((f) => [f, readFileSync(f, 'utf-8')]));

  const restore = (): void => {
    for (const [file, original] of before) {
      if (readFileSync(file, 'utf-8') !== original) {
        writeFileSync(file, original);
        console.log(`[next-build] restored ${file.replace(repoRoot, '.')} (build rewrote it)`);
      }
    }
  };

  const child = spawn(process.execPath, [nextBin, 'build', ...process.argv.slice(2)], {
    cwd: frontend,
    env: { ...process.env, NEXT_DIST_DIR: distDir },
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    restore();
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

void main();
