// ============================================================
// CapitalForge — credit-builder milestone detection
//
// The rule for when a milestone has been reached, kept out of the component
// that renders one so it can be tested without rendering — the same split as
// `credit-view`, and for the same reason.
//
// `checkMilestones` lived in MilestoneAlertSystem.tsx and was imported by the
// credit-builder page and never called, so no milestone could ever appear on a
// page that rendered the alert stack at the top of every view.
// ============================================================

export interface MilestoneAlert {
  id: string;
  type: 'success' | 'info' | 'warning';
  title: string;
  message: string;
  action?: { label: string; url: string };
}

/**
 * A reading of the two figures a milestone can be crossed on.
 *
 * Both are nullable, because both genuinely are: a client may have no PAYDEX
 * on record, and the tradeline list is null until it has been read. An unread
 * figure is not a zero, and a crossing cannot be claimed from one.
 */
export interface ProgressData {
  paydex: number | null;
  tradelineCount: number | null;
}

/**
 * True only when a threshold was crossed between two *known* readings.
 *
 * Null on either side means no crossing is asserted. Treating null as zero
 * would announce "Paydex hit 80!" the first time a score was successfully read
 * for a client who has held it for years — the milestone would be reporting
 * that the page had loaded, not that anything had happened.
 */
function crossed(before: number | null, after: number | null, threshold: number): boolean {
  if (before === null || after === null) return false;
  return before < threshold && after >= threshold;
}

/**
 * Compare a previous and a current reading and return an alert for any
 * threshold crossed between them.
 *
 * `prev` is null on the first reading of a client, which is not progress:
 * there is no earlier state to have moved from.
 */
export function checkMilestones(
  prev: ProgressData | null,
  curr: ProgressData,
  clientId?: string | null,
): MilestoneAlert[] {
  const alerts: MilestoneAlert[] = [];

  if (prev && crossed(prev.paydex, curr.paydex, 80)) {
    alerts.push({
      id: 'paydex_80',
      type: 'success',
      title: 'Paydex Milestone!',
      message: 'Paydex hit 80 — Tier 1 unlock criteria met.',
      action: {
        label: 'Run Optimizer →',
        // Carries the client through, as the graduation banner does. A
        // milestone link that dropped it would land the advisor on an empty
        // optimizer with no indication of which client it was about.
        url: clientId ? `/optimizer?client_id=${clientId}&from=milestone` : '/optimizer',
      },
    });
  }

  if (prev && crossed(prev.tradelineCount, curr.tradelineCount, 5)) {
    alerts.push({
      id: 'tradelines_5',
      type: 'success',
      title: '5 Tradelines!',
      message: '5+ reporting tradelines — Step 4 complete.',
    });
  }

  return alerts;
}
