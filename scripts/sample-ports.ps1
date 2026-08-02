# ============================================================
# Samples the machine's TCP port range, one appended line at a time.
#
# Companion to tests/e2e-playwright/failure-snapshot-reporter.ts. That reporter
# captures a single instant — the moment a test fails. This captures the run
# up to it, which is what says whether a limit was approached gradually or
# jumped to in one step.
#
# It exists because a run once failed with net::ERR_NO_BUFFER_SPACE, which on
# Windows means the ephemeral port range is exhausted: measured on this
# machine, socket allocation fails at 16,200 concurrent against a range of
# 16,384. The suite is not the consumer — a full run peaks at 1,419, under 9%
# — so the spike came from elsewhere and lasted less than the five seconds
# between samples that first looked for it.
#
# Two things were learned building it, both of which the design now reflects:
#
#   Append per sample, never buffer. The first version collected rows and
#   printed them at exit. Every caller kills it when the thing it is watching
#   ends, so it wrote zero bytes across all 25 runs of a batch and the data it
#   was added to collect never existed. A hard kill must cost at most the
#   sample in flight.
#
#   Sample the cheap field often. Measured per call: the two pool counters
#   cost 1,132ms and 1,019ms, the TCP table 312ms, the process list 23ms.
#   Reading everything every time took 2.5s, so a requested 2s interval
#   produced 4.3s spacing — worse than the sampling that had already missed
#   the spike. The pool counters are the expensive part and the least urgent.
#
# Windows only: it reads Windows performance counters and the TCP table.
#
# Cost at the default full rate, measured: 15% of one core (0.5% of a 32-core
# machine) and 1.0 MB/hour. Cheap enough to leave running during normal work,
# which is the point — the event is rare and unpredictable.
#
#   scripts\sample-ports.ps1 -Path test-results\ports.csv
#   scripts\sample-ports.ps1 -Path test-results\ports.csv -Seconds 400
#   scripts\sample-ports.ps1 -Path test-results\ports.csv -IntervalSeconds 2
#   scripts\sample-ports.ps1 -Summarize test-results\ports.csv
#
# test-results\ is already gitignored, so sample files left there stay out of
# the working tree.
# ============================================================
[CmdletBinding()]
param(
    [string]$Path,
    [int]$Seconds = 0,            # 0 = run until killed
    [int]$IntervalSeconds = 0,    # 0 = sample as fast as the counters allow
    [int]$PoolEvery = 10,         # read the costly pool counters every Nth sample
    [string]$Summarize
)

$ErrorActionPreference = 'Stop'

$FIELDS = 'ephemeralInUse', 'ephemeralLimit', 'timeWait', 'established',
          'nonpagedPoolMB', 'pagedPoolMB', 'handles'

# --- summarize mode: peaks out of a file written earlier -----------------
if ($Summarize) {
    if (-not (Test-Path $Summarize)) { throw "No such sample file: $Summarize" }
    # @() so a file holding a single sample still behaves like a collection.
    $rows = @(Import-Csv $Summarize)
    if ($rows.Count -eq 0) { Write-Output 'No samples in that file (header only).'; return }

    $span = ([datetime]$rows[-1].t - [datetime]$rows[0].t).TotalSeconds
    Write-Output ('samples: {0:N0} over {1:N0}s ({2:N2}s apart)' -f
                  $rows.Count, $span, $(if ($rows.Count -gt 1) { $span / ($rows.Count - 1) } else { 0 }))
    Write-Output ''
    foreach ($f in $FIELDS) {
        # Blank means the field was not read on that sample, which is not zero.
        $have = @($rows | Where-Object { $_.$f -ne '' -and $null -ne $_.$f })
        if ($have.Count -eq 0) { Write-Output ('{0,-15} not sampled' -f $f); continue }
        $max  = ($have | Measure-Object -Property $f -Maximum).Maximum
        $note = if ($have.Count -lt $rows.Count) { " (from $($have.Count) samples)" } else { '' }
        Write-Output ('{0,-15} peak {1,10:N0}{2}' -f $f, $max, $note)
    }

    # The reason this file exists: how close the port range came to its limit.
    $peak  = ($rows | Measure-Object -Property ephemeralInUse -Maximum).Maximum
    $limit = [int]$rows[-1].ephemeralLimit
    if ($limit -gt 0) {
        Write-Output ''
        Write-Output ('port range peaked at {0:N0} of {1:N0} ({2:P1})' -f $peak, $limit, ($peak / $limit))
    }
    return
}

if (-not $Path) { throw 'Give -Path (where to append samples) or -Summarize (a file to read).' }

# The dynamic range is read from the OS, not assumed to be 49152-65535: a count
# of ports in use means nothing without the limit beside it.
$dyn        = (netsh int ipv4 show dynamicport tcp) -join ' '
$rangeStart = if ($dyn -match 'Start Port\s*:\s*(\d+)')      { [int]$Matches[1] } else { 49152 }
$rangeCount = if ($dyn -match 'Number of Ports\s*:\s*(\d+)') { [int]$Matches[1] } else { 16384 }
$rangeEnd   = $rangeStart + $rangeCount

# The pool counters are read every Nth sample and left EMPTY in between.
# Empty, not carried forward: a repeated value would read as a measurement
# that was taken, and a blank is honest about the instant it was not.
function Get-Sample {
    param([bool]$IncludePool)

    $tcp   = Get-NetTCPConnection -EA SilentlyContinue
    $procs = Get-Process -EA SilentlyContinue

    $np = ''
    $pp = ''
    if ($IncludePool) {
        # One call for both paths rather than two: half the cost of the pair.
        $c  = (Get-Counter -Counter '\Memory\Pool Nonpaged Bytes', '\Memory\Pool Paged Bytes' -EA SilentlyContinue).CounterSamples
        $np = [int](($c | Where-Object { $_.Path -like '*nonpaged*' }).CookedValue / 1MB)
        $pp = [int](($c | Where-Object { $_.Path -notlike '*nonpaged*' }).CookedValue / 1MB)
    }

    [PSCustomObject]@{
        # ISO 8601, so a sample lines up with the failure-snapshot reporter's
        # timestamps without anyone having to reconcile two formats.
        t              = (Get-Date).ToString('o')
        ephemeralInUse = ($tcp | Where-Object {
                             $_.LocalPort -ge $rangeStart -and $_.LocalPort -lt $rangeEnd -and
                             $_.State -ne 'Listen'
                          } | Measure-Object).Count
        ephemeralLimit = $rangeCount
        timeWait       = ($tcp | Where-Object { $_.State -eq 'TimeWait' }    | Measure-Object).Count
        established    = ($tcp | Where-Object { $_.State -eq 'Established' } | Measure-Object).Count
        nonpagedPoolMB = $np
        pagedPoolMB    = $pp
        handles        = ($procs | Measure-Object -Property HandleCount -Sum).Sum
    }
}

# Header only for a new file, so repeated runs can append to one timeline.
if (-not (Test-Path $Path)) {
    ('t,' + ($FIELDS -join ',')) | Out-File -FilePath $Path -Encoding utf8
}

$deadline = if ($Seconds -gt 0) { (Get-Date).AddSeconds($Seconds) } else { [datetime]::MaxValue }
$n = 0

while ((Get-Date) -lt $deadline) {
    $row = Get-Sample -IncludePool ($n % $PoolEvery -eq 0)
    $n++
    # Add-Content opens, writes and closes each time. At this rate the cost is
    # irrelevant, and it is what makes the file complete at every instant
    # rather than whenever a buffer happens to flush.
    $line = ($FIELDS | ForEach-Object { $row.$_ }) -join ','
    Add-Content -Path $Path -Value ("$($row.t),$line") -Encoding utf8
    if ($IntervalSeconds -gt 0) { Start-Sleep -Seconds $IntervalSeconds }
}
