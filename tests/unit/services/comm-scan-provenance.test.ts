// ============================================================
// What a communication scan records, and who it is about
//
//   - `advisorId` was validated as a UUID and nothing else. Every record this
//     module writes hangs off it, and GET /advisors/:id/qa-scores filters on
//     `{ advisorId, tenantId }` — so the QA surface reported faithfully over an
//     attribution nobody had checked.
//   - The violation event used `publish`, not `publishAndPersist`, so the
//     canonical ledger held no record that a compliance violation had ever been
//     detected.
//   - Deduplication claimed to keep "the highest-severity hit per claim ID" by
//     comparing severityWeight — which comes from the claim, so every hit of one
//     claim has the same weight and the comparison was never true. Repeats were
//     discarded silently.
//   - `reviewedAt` was set at scan time: a field named for human review
//     recording when the automation ran.
//   - `requiredDisclosures` and `contentWithDisclosures` were returned to the
//     caller and never stored, so nothing recorded what the client was sent.
//   - disc-005 was added to every scan, and every disclosure was appended to
//     the end — including on voice scripts, where a disclosure after the
//     sign-off does not do its job.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@backend/events/event-bus.js', () => ({
  eventBus: {
    publish: vi.fn().mockResolvedValue(undefined),
    publishAndPersist: vi.fn().mockResolvedValue({ id: 'evt-1', publishedAt: new Date() }),
  },
}));

vi.mock('@backend/config/database.js', () => ({ prisma: {} }));

import { eventBus } from '../../../src/backend/events/event-bus.js';

const publish = eventBus.publish as unknown as ReturnType<typeof vi.fn>;
const publishAndPersist = eventBus.publishAndPersist as unknown as ReturnType<typeof vi.fn>;

import {
  CommComplianceService,
  UnknownAdvisorError,
  UnanchoredVoiceDisclosureError,
  detectBannedClaims,
} from '../../../src/backend/services/comm-compliance.service.js';

const TENANT = 'tenant-1';
const ADVISOR = 'advisor-1';

const userFindFirst = vi.fn();
const recordCreate = vi.fn();

function service() {
  return new CommComplianceService({
    user: { findFirst: userFindFirst },
    commComplianceRecord: { create: recordCreate },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  userFindFirst.mockResolvedValue({ id: ADVISOR });
  recordCreate.mockResolvedValue({ id: 'scan-1' });
  publishAndPersist.mockResolvedValue({ id: 'evt-1', publishedAt: new Date() });
});

const GUARANTEE = 'We offer guaranteed approval on every application.';

describe('the advisor a scan is filed against', () => {
  it('is verified against users in the same tenant', async () => {
    await service().scanCommunication({
      tenantId: TENANT,
      advisorId: ADVISOR,
      channel: 'email',
      content: 'Hello.',
    });

    const [{ where }] = userFindFirst.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(where).toMatchObject({ id: ADVISOR, tenantId: TENANT });
  });

  it('is refused when it names nobody, rather than defaulting to the caller', async () => {
    userFindFirst.mockResolvedValue(null);

    await expect(
      service().scanCommunication({
        tenantId: TENANT,
        advisorId: 'not-an-advisor',
        channel: 'email',
        content: GUARANTEE,
      }),
    ).rejects.toBeInstanceOf(UnknownAdvisorError);

    // And nothing is written under the unverified id.
    expect(recordCreate).not.toHaveBeenCalled();
    expect(publishAndPersist).not.toHaveBeenCalled();
  });
});

describe('the violation event', () => {
  it('is written to the ledger, not only broadcast', async () => {
    await service().scanCommunication({
      tenantId: TENANT,
      advisorId: ADVISOR,
      channel: 'email',
      content: GUARANTEE,
    });

    expect(publishAndPersist).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
  });

  it('is not written when nothing was found', async () => {
    await service().scanCommunication({
      tenantId: TENANT,
      advisorId: ADVISOR,
      channel: 'email',
      content: 'Approval depends on your credit profile.',
    });

    expect(publishAndPersist).not.toHaveBeenCalled();
  });
});

describe('repeated claims', () => {
  it('are counted rather than discarded', async () => {
    const thrice = `${GUARANTEE} ${GUARANTEE} ${GUARANTEE}`;
    const violations = detectBannedClaims(thrice);

    const guarantee = violations.find((v) => v.category === 'guaranteed_approval');
    expect(guarantee?.occurrences).toBe(3);
    expect(guarantee?.positions).toHaveLength(3);
  });

  it('are one violation, and do not multiply the score', async () => {
    // Nine of one claim is one problem to fix, not nine.
    const once = service().scoreCommunication(GUARANTEE);
    const thrice = service().scoreCommunication(`${GUARANTEE} ${GUARANTEE} ${GUARANTEE}`);

    expect(thrice.violations).toHaveLength(once.violations.length);
    expect(thrice.riskScore).toBe(once.riskScore);
    expect(thrice.violations[0]!.occurrences).toBe(3);
    expect(once.violations[0]!.occurrences).toBe(1);
  });

  it('are found by the same detector the preview uses', async () => {
    // `scoreCommunication` held a second copy of the matching loop, so the
    // preview an advisor sees while typing and the record written on submit
    // were computed by two implementations of one rule.
    const preview = service().scoreCommunication(GUARANTEE);
    expect(preview.violations).toEqual(detectBannedClaims(GUARANTEE));
  });
});

describe('the persisted record', () => {
  it('records when the scan ran, not that anybody reviewed it', async () => {
    await service().scanCommunication({
      tenantId: TENANT,
      advisorId: ADVISOR,
      channel: 'email',
      content: GUARANTEE,
    });

    const [{ data }] = recordCreate.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(data.scannedAt).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty('reviewedAt');
    // Human review is its own state with its own actor, and nobody has done it.
    expect(data.humanReviewedAt).toBeUndefined();
    expect(data.reviewedByUserId).toBeUndefined();
  });

  it('keeps what the scan required and the text that would go out', async () => {
    // A complaint turns on the text the client was actually sent, and this was
    // returned to the caller and discarded.
    await service().scanCommunication({
      tenantId: TENANT,
      advisorId: ADVISOR,
      channel: 'email',
      content: 'We are an SBA partner with guaranteed approval.',
    });

    const [{ data }] = recordCreate.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(Array.isArray(data.requiredDisclosures)).toBe(true);
    expect(String(data.contentWithDisclosures)).toContain('[REQUIRED DISCLOSURE]');
    expect(String(data.contentWithDisclosures)).toContain('We are an SBA partner');
  });
});

describe('where a disclosure lands', () => {
  it('goes next to the claim that triggered it, not after the sign-off', async () => {
    // Appending is wrong for voice, and `channel` accepts it.
    const result = await service().scanCommunication({
      tenantId: TENANT,
      advisorId: ADVISOR,
      channel: 'voice',
      // Nothing here triggers a disclosure by keyword alone — "programme"
      // would have, and on voice that is now a refusal rather than an append.
      content: 'We are an SBA partner. Thanks for your time, and speak soon.',
    });

    const text = result.contentWithDisclosures;
    const disclosureAt = text.indexOf('independent advisory service');
    const signOffAt = text.indexOf('Thanks for your time');

    expect(disclosureAt).toBeGreaterThan(-1);
    expect(disclosureAt).toBeLessThan(signOffAt);
  });

  it('appends one that no violation anchors', async () => {
    // Triggered by a keyword rather than a violation, so there is no position
    // to attach it to. Appended, which is the honest fallback.
    const result = await service().scanCommunication({
      tenantId: TENANT,
      advisorId: ADVISOR,
      channel: 'email',
      content: 'Let us discuss your credit card application and the fees involved.',
    });

    expect(result.contentWithDisclosures).toMatch(/---\n\[REQUIRED DISCLOSURE\]/);
  });

  it('leaves clean text with no disclosure block at all', async () => {
    const result = await service().scanCommunication({
      tenantId: TENANT,
      advisorId: ADVISOR,
      channel: 'email',
      content: 'Approval depends on your credit profile. Results vary.',
    });

    expect(result.requiredDisclosures).toHaveLength(0);
    expect(result.contentWithDisclosures).not.toContain('[REQUIRED DISCLOSURE]');
  });
});

describe('a voice script whose disclosure has no anchor', () => {
  it('is refused rather than given one after the sign-off', async () => {
    // On a written message an appended disclosure is imperfect. On a spoken
    // one it is a disclosure after the call ended: the advisor stops talking,
    // and the text below the sign-off is read by nobody.
    //
    // This text triggers disc-001 and disc-002 by keyword — a credit
    // application and fees — with no banned claim to anchor either to.
    await expect(
      service().scanCommunication({
        tenantId: TENANT,
        advisorId: ADVISOR,
        channel: 'voice',
        content: 'Let us discuss your credit card application and the fees involved.',
      }),
    ).rejects.toBeInstanceOf(UnanchoredVoiceDisclosureError);

    // Nothing is recorded for a scan that produced no usable script.
    expect(recordCreate).not.toHaveBeenCalled();
  });

  it('names the disclosures the script has nowhere to put', async () => {
    const err = await service()
      .scanCommunication({
        tenantId: TENANT,
        advisorId: ADVISOR,
        channel: 'voice',
        content: 'Let us discuss your credit card application and the fees involved.',
      })
      .then(() => null)
      .catch((e: unknown) => e as UnanchoredVoiceDisclosureError);

    expect(err!.disclosureIds).toContain('disc-001');
    expect(err!.message).toMatch(/after the sign-off/);
  });

  it('still produces a voice script when every disclosure is anchored', async () => {
    // The SBA claim anchors disc-005, so it has somewhere to go.
    const result = await service().scanCommunication({
      tenantId: TENANT,
      advisorId: ADVISOR,
      channel: 'voice',
      content: 'We are an SBA partner. Thanks for your time.',
    });

    expect(result.contentWithDisclosures).toContain('independent advisory service');
    expect(result.contentWithDisclosures).not.toContain('---');
  });

  it('appends on a written channel, as before', async () => {
    const result = await service().scanCommunication({
      tenantId: TENANT,
      advisorId: ADVISOR,
      channel: 'email',
      content: 'Let us discuss your credit card application and the fees involved.',
    });

    expect(result.contentWithDisclosures).toContain('---');
  });
});
