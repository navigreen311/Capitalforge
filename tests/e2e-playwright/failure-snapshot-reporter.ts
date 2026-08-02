// ============================================================
// Records the state of the machine's TCP port range when a test fails.
//
// One run failed with `page.goto: net::ERR_NO_BUFFER_SPACE`. That is Windows
// WSAENOBUFS, and on this machine it was measured to mean one specific thing:
// a ramp of concurrent sockets against a local listener failed at 16,200 open,
// against a dynamic range of 16,384 ports. So the error means the ephemeral
// port range is exhausted — not memory, not handles, both of which were far
// from their ceilings when it fired.
//
// The suite is not the consumer. Sampling a full run peaks at 1,419 ports in
// use, under 9% of the range. (The ~3,900 sockets in TIME_WAIT during a run
// are a red herring: `Connection: close` in the config makes the *server*
// close first, so those sit on ports 3100 and 4000 and hold no ephemeral port
// at all.) Whatever took the range from 1.4k to 16.4k came from somewhere
// else on the machine and was gone by the next sample.
//
// Which is the problem this file exists for. The event has not recurred in
// about fifty runs, a five-second sampler cannot see a spike that brief, and
// the evidence only exists while it is happening. So capture it at the one
// moment it is guaranteed to be there — the instant a test fails — and record
// which processes are holding the ports, because that is the thing that
// identifies the culprit and nothing else does.
//
// Windows-only, by construction: it reads Windows counters through PowerShell.
// Everywhere else it does nothing at all. It only ever runs on failure, so it
// costs a passing suite nothing.
// ============================================================

import type { FullConfig, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Reads the range from the OS rather than assuming 49152-65535: a machine with
 * a tuned range would otherwise be measured against the wrong denominator, and
 * a port count is meaningless without the limit beside it.
 */
const SNAPSHOT_SCRIPT = String.raw`
$dyn   = (netsh int ipv4 show dynamicport tcp) -join ' '
$start = if ($dyn -match 'Start Port\s*:\s*(\d+)')      { [int]$Matches[1] } else { 49152 }
$count = if ($dyn -match 'Number of Ports\s*:\s*(\d+)') { [int]$Matches[1] } else { 16384 }

$tcp = Get-NetTCPConnection -EA SilentlyContinue
$eph = $tcp | Where-Object {
  $_.LocalPort -ge $start -and $_.LocalPort -lt ($start + $count) -and $_.State -ne 'Listen'
}

[PSCustomObject]@{
  ephemeralInUse = ($eph | Measure-Object).Count
  ephemeralLimit = $count
  byState        = ($tcp | Group-Object State | ForEach-Object { "$($_.Name)=$($_.Count)" }) -join ' '
  holders        = (($eph | Group-Object OwningProcess | Sort-Object Count -Descending |
                     Select-Object -First 5 | ForEach-Object {
                       $name = (Get-Process -Id $_.Name -EA SilentlyContinue).ProcessName
                       "$name($($_.Name))=$($_.Count)"
                     }) -join ' ')
  nonpagedPoolMB = [int]((Get-Counter '\Memory\Pool Nonpaged Bytes' -EA SilentlyContinue).CounterSamples[0].CookedValue / 1MB)
  handles        = (Get-Process -EA SilentlyContinue | Measure-Object -Property HandleCount -Sum).Sum
} | ConvertTo-Json -Compress
`;

/** A hung snapshot must never hold up the run it is reporting on. */
const SNAPSHOT_TIMEOUT_MS = 30_000;

export default class FailureSnapshotReporter implements Reporter {
  private outputDir = 'test-results';

  onBegin(config: FullConfig): void {
    const configured = config.projects[0]?.outputDir;
    if (configured) this.outputDir = configured;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== 'failed' && result.status !== 'timedOut') return;
    if (process.platform !== 'win32') return;

    const message = result.error?.message ?? '';

    // Everything below is best-effort. A reporter that throws fails the run,
    // which would turn a diagnostic aid into a cause of the thing it diagnoses.
    let snapshot: string;
    try {
      snapshot = execFileSync('powershell', ['-NoProfile', '-Command', SNAPSHOT_SCRIPT], {
        encoding: 'utf8',
        timeout: SNAPSHOT_TIMEOUT_MS,
      }).trim();
    } catch (err) {
      snapshot = `(snapshot unavailable: ${err instanceof Error ? err.message : String(err)})`;
    }

    const entry = {
      at: new Date().toISOString(),
      test: test.titlePath().filter(Boolean).join(' > '),
      status: result.status,
      error: message.split('\n')[0],
      // The failure this was built for. Anything else is context for whatever
      // did fail, and the port counts are expected to look unremarkable.
      isNoBufferSpace: message.includes('ERR_NO_BUFFER_SPACE'),
      snapshot,
    };

    // Printed as well as written: test-results is wiped at the start of every
    // run, exactly like the traces beside it, so the run log is what survives
    // somebody re-running the suite before reading this.
    process.stdout.write(`\n[failure-snapshot] ${entry.error}\n[failure-snapshot] ${snapshot}\n`);

    try {
      fs.mkdirSync(this.outputDir, { recursive: true });
      fs.appendFileSync(
        path.join(this.outputDir, 'failure-snapshots.jsonl'),
        `${JSON.stringify(entry)}\n`,
      );
    } catch {
      // The stdout line above is the copy that matters.
    }
  }
}
