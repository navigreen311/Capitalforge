// ============================================================
// The last five endpoints that answered success into process memory
//
//   rewards            cancelledCards          a card reported cancelled while
//                                              the application stayed approved
//   spend-governance   acknowledgedViolations  who acknowledged a compliance
//                                              violation, and when
//   spend-governance   businessPurposeUpdates  the justification that decides
//                                              whether the violation stands
//   statements         dismissedAnomalies      a financial discrepancy
//                                              dismissed, with a reason
//   statements         completedSteps          which investigation steps had
//                                              been done
//
// Each answered 200 and wrote to a module-level object: gone at the next
// restart, invisible to every other worker meanwhile.
//
// Three of them act on rows that exist and now write to them. The two
// statement endpoints do not: a StatementAnomaly is built while reading a
// statement and carries no identifier, so the :id in those paths corresponds
// to nothing the system ever issued. They refuse.
// ============================================================

import { test, expect, expectOk } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

async function auth(page: import('@playwright/test').Page): Promise<string> {
  const t = await page.evaluate(() => localStorage.getItem('cf_access_token'));
  return `Bearer ${t}`;
}

async function seededClientId(page: import('@playwright/test').Page): Promise<string> {
  const body = (await fetch(`${API}/v1/clients?pageSize=100`, {
    headers: { Authorization: await auth(page) },
  }).then(expectOk)) as { data: { id: string; businessName: string }[] };
  const apex = body.data.find((c) => c.businessName.includes('Apex Digital'));
  expect(apex, 'the seeded client is present').toBeTruthy();
  return apex!.id;
}

test.describe('Spend governance', () => {
  test('a business purpose persists and clears the violation', async ({ signedInPage: page }) => {
    await page.goto('/spend-governance');
    const a = await auth(page);
    const clientId = await seededClientId(page);

    const violationsBefore = (await fetch(
      `${API}/businesses/${clientId}/business-purpose/violations`,
      { headers: { Authorization: a } },
    ).then(expectOk)) as {
      data: { transactionId: string; isCompliant: boolean; violations: string[] }[];
    };

    const offending = violationsBefore.data.find((v) =>
      v.violations.some((msg) => msg.includes('business-purpose documentation')),
    );
    expect(offending, 'the seed records a transaction missing its documentation').toBeTruthy();

    const res = await fetch(
      `${API}/spend-governance/transactions/${offending!.transactionId}/business-purpose`,
      {
        method: 'PATCH',
        headers: { Authorization: a, 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessPurpose: 'Reception furniture for the new office.' }),
      },
    );
    expect(res.status).toBe(200);

    // The purpose used to live in a module-level object, so the check never
    // saw it and reported the same thing on the next read. It is a column on
    // the row, and checkNetworkRuleCompliance reads it.
    const violationsAfter = (await fetch(
      `${API}/businesses/${clientId}/business-purpose/violations`,
      { headers: { Authorization: a } },
    ).then(expectOk)) as {
      data: { transactionId: string; isCompliant: boolean; violations: string[] }[];
    };

    const same = violationsAfter.data.find((v) => v.transactionId === offending!.transactionId);

    // The documentation violation is gone. The transaction is still not
    // compliant, and asserting otherwise would be wrong: a personal-use
    // category breaks a separate rule that no amount of documentation clears,
    // so the purpose resolves one finding rather than the transaction.
    expect(
      same!.violations.some((msg) => msg.includes('business-purpose documentation')),
      'the documentation violation is resolved',
    ).toBe(false);
    expect(same!.violations.length).toBeLessThan(offending!.violations.length);
  });

  test('an acknowledgement is recorded, and does not resolve the violation', async ({
    signedInPage: page,
  }) => {
    await page.goto('/spend-governance');
    const a = await auth(page);
    const clientId = await seededClientId(page);

    const violations = (await fetch(`${API}/businesses/${clientId}/business-purpose/violations`, {
      headers: { Authorization: a },
    }).then(expectOk)) as { data: { transactionId: string }[] };
    expect(violations.data.length).toBeGreaterThan(0);

    const body = (await fetch(
      `${API}/spend-governance/violations/${violations.data[0]!.transactionId}/acknowledge`,
      {
        method: 'POST',
        headers: { Authorization: a, 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledgedBy: 'Alexandra Torres' }),
      },
    ).then(expectOk)) as {
      data: { acknowledgedBy: string | null; acknowledgedAt: string; stillReported: boolean };
    };

    expect(body.data.acknowledgedBy).toBe('Alexandra Torres');
    // Acknowledging records that somebody looked. It does not make a derived
    // violation stop being derived.
    expect(body.data.stillReported).toBe(true);
  });

  test('does not put a name against an acknowledgement nobody gave', async ({
    signedInPage: page,
  }) => {
    await page.goto('/spend-governance');
    const a = await auth(page);
    const clientId = await seededClientId(page);

    const violations = (await fetch(`${API}/businesses/${clientId}/business-purpose/violations`, {
      headers: { Authorization: a },
    }).then(expectOk)) as { data: { transactionId: string }[] };

    const body = (await fetch(
      `${API}/spend-governance/violations/${violations.data[0]!.transactionId}/acknowledge`,
      {
        method: 'POST',
        headers: { Authorization: a, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    ).then(expectOk)) as { data: { acknowledgedBy: string | null } };

    expect(body.data.acknowledgedBy).toBeNull();
  });

  test('refuses a transaction on another tenant', async ({ signedInPage: page }) => {
    await page.goto('/spend-governance');
    const a = await auth(page);

    const res = await fetch(
      `${API}/spend-governance/violations/00000000-0000-0000-0000-000000000000/acknowledge`,
      {
        method: 'POST',
        headers: { Authorization: a, 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledgedBy: 'Nobody' }),
      },
    );
    // It used to answer 200 for any id at all.
    expect(res.status).toBe(404);
  });
});

test.describe('Card cancellation', () => {
  /**
   * Its own card, not a seeded one.
   *
   * Cancelling is a one-way status change and the seed is create-only, so a
   * test that consumes a seeded application passes once and then finds nothing
   * cancellable — the same shape that made the card-benefit test unrepeatable.
   * Applications named "E2E ..." are swept by clean:dev-data.
   */
  async function disposableCard(
    page: import('@playwright/test').Page,
  ): Promise<{ id: string; a: string }> {
    const a = await auth(page);

    // assignedAdvisorIds is required — at least one. The fixture puts the
    // signed-in user in localStorage exactly as the login page does, so the
    // id is there without another round trip.
    const advisorId = await page.evaluate(() => {
      const raw = localStorage.getItem('cf_user');
      return raw === null ? null : (JSON.parse(raw) as { id?: string }).id ?? null;
    });
    expect(advisorId, 'the signed-in advisor id is available').toBeTruthy();

    const res = await fetch(`${API}/businesses/seed-biz-001/applications`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issuer: 'Chase',
        cardProduct: `E2E cancellation ${Date.now()}`,
        creditLimit: 1000,
        assignedAdvisorIds: [advisorId],
      }),
    });
    expect(res.status, 'a card can be created to cancel').toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    return { id: body.data.id, a };
  }

  test('persists and survives a re-read', async ({ signedInPage: page }) => {
    await page.goto('/rewards');
    const { id, a } = await disposableCard(page);

    const body = (await fetch(`${API}/rewards/cards/${id}/cancel`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Annual fee not justified' }),
    }).then(expectOk)) as { data: { status: string; closedWithIssuer: boolean } };

    expect(body.data.status).toBe('cancelled');
    // Recording a cancellation is not closing the account with the issuer.
    expect(body.data.closedWithIssuer).toBe(false);

    // The application used to keep its old status while this answered
    // "cancelled", so the card stayed open credit everywhere else.
    const after = (await fetch(`${API}/applications?pageSize=100`, {
      headers: { Authorization: a },
    }).then(expectOk)) as { data: { id: string; status: string }[] };

    expect(after.data.find((x) => x.id === id)?.status).toBe('cancelled');
  });

  test('states no reason when none was given', async ({ signedInPage: page }) => {
    await page.goto('/rewards');
    const { id, a } = await disposableCard(page);

    const body = (await fetch(`${API}/rewards/cards/${id}/cancel`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).then(expectOk)) as { data: { reason: string | null } };

    // It used to record "No reason provided" — a sentence nobody said.
    expect(body.data.reason).toBeNull();
  });

  test('refuses to cancel the same card twice', async ({ signedInPage: page }) => {
    await page.goto('/rewards');
    const { id, a } = await disposableCard(page);

    const first = await fetch(`${API}/rewards/cards/${id}/cancel`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'First' }),
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${API}/rewards/cards/${id}/cancel`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Again' }),
    });
    expect(second.status).toBe(422);
  });

  test('refuses a card on another tenant', async ({ signedInPage: page }) => {
    await page.goto('/rewards');
    const res = await fetch(`${API}/rewards/cards/00000000-0000-0000-0000-000000000000/cancel`, {
      method: 'POST',
      headers: { Authorization: await auth(page), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Test' }),
    });
    expect(res.status).toBe(404);
  });
});

test.describe('Statement anomalies', () => {
  test('dismissal is refused, because an anomaly has no identity', async ({
    signedInPage: page,
  }) => {
    await page.goto('/statements');
    const a = await auth(page);

    const res = await fetch(`${API}/statements/anomalies/any-id-at-all/dismiss`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Reviewed with the client' }),
    });

    // It answered 200 and kept the dismissal in memory under a key the system
    // never issued, while the anomaly went on being reported.
    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain('carry no identifier');
  });

  test('an investigation step is refused for the same reason', async ({ signedInPage: page }) => {
    await page.goto('/statements');
    const a = await auth(page);

    const res = await fetch(`${API}/statements/anomalies/any-id-at-all/steps/contacted-issuer`, {
      method: 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Left a message' }),
    });

    expect(res.status).toBe(501);
  });

  test('anomalies are still reported', async ({ signedInPage: page }) => {
    // Refusing the dismissal must not have removed the detection.
    await page.goto('/statements');
    const a = await auth(page);
    const clientId = await seededClientId(page);

    const res = await fetch(`${API}/businesses/${clientId}/statements/anomalies`, {
      headers: { Authorization: a },
    });
    expect(res.status).toBe(200);
  });
});
