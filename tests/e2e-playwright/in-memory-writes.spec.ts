// ============================================================
// Nothing is "saved" into a process any more
//
// Four endpoints accepted writes into module-level arrays and answered 200
// or 201 as though something had been stored:
//
//   POST /api/financial/hardship-cases    hardshipCases.push
//   POST /api/platform/referrals          REFERRALS_DATA.push
//   POST /api/platform/workflows          WORKFLOWS_DATA.push
//   POST /api/platform/reports/schedules   SCHEDULES.push
//
// Each was shared by every tenant, invisible to any other process, and gone
// on restart. Two of them had a real table sitting beside them the whole
// time — hardship_cases and workflow_rules — and two had nothing, so they
// refuse now instead of pretending.
// ============================================================

import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:4000/api';

async function token(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('cf_access_token'));
}

async function firstBusinessId(t: string | null): Promise<string> {
  const res = await fetch(`${API}/compliance/disclosures`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  const body = (await res.json()) as { data: { businesses: { businessId: string }[] } };
  expect(body.data.businesses.length).toBeGreaterThan(0);
  return body.data.businesses[0].businessId;
}

test.describe('In-memory writes', () => {
  test('a hardship case survives being written', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    const t = await token(page);
    const businessId = await firstBusinessId(t);

    const created = await fetch(`${API}/financial/hardship-cases`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessId,
        missedPaymentCount: 3,
        currentUtilization: 0.94,
        totalBalance: 84_500,
        monthlyRevenue: 30_000,
      }),
    });
    expect(created.status).toBe(201);
    const { data } = (await created.json()) as { data: { id: string } };
    expect(data.id).toBeTruthy();

    // The proof the old version could not give: read it back.
    const listed = await fetch(`${API}/financial/hardship-cases`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => r.json())
      .then((b) => (b as { data: { id: string; businessId: string }[] }).data);

    const found = listed.find((c) => c.id === data.id);
    expect(found, 'the case must come back from the database').toBeTruthy();
    expect(found!.businessId).toBe(businessId);
  });

  test('a hardship case needs a client that exists', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    const t = await token(page);

    // It used to take a free-text client name, which is why its cases could
    // not be joined to anything.
    const noBusiness = await fetch(`${API}/financial/hardship-cases`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientName: 'Carlos Mendez', flag: 'missed_payment' }),
    });
    expect(noBusiness.status).toBe(422);

    const unknown = await fetch(`${API}/financial/hardship-cases`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId: 'not-a-real-business' }),
    });
    expect(unknown.status).toBe(404);
  });

  test('does not serve the hardship and tax fixtures', async ({ signedInPage: page }) => {
    await page.goto('/dashboard');
    const t = await token(page);

    const hardship = await fetch(`${API}/financial/hardship-cases`, {
      headers: { Authorization: `Bearer ${t}` },
    }).then((r) => r.text());
    for (const invented of ['Carlos Mendez', 'Mendez Trucking', 'James Thornton', 'Sarah Mitchell']) {
      expect(hardship).not.toContain(invented);
    }

    const tax = await fetch(`${API}/financial/tax-documents`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    const taxBody = (await tax.json()) as {
      data: { documents: unknown[]; generated: boolean; why: string };
    };
    // Four 1099s for "Acme Holdings LLC", with file sizes and generation
    // timestamps, for forms nothing produces.
    expect(taxBody.data.documents).toEqual([]);
    expect(taxBody.data.generated).toBe(false);
    expect(taxBody.data.why.length).toBeGreaterThan(0);
    expect(JSON.stringify(taxBody)).not.toContain('Acme Holdings');
  });

  test('a workflow rule survives being written, and says it will not run', async ({
    signedInPage: page,
  }) => {
    await page.goto('/dashboard');
    const t = await token(page);

    const name = `E2E rule ${Date.now()}`;
    const created = await fetch(`${API}/platform/workflows`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        trigger: 'application.submitted',
        condition: 'creditLimit > 25000',
        action: 'notify the assigned advisor',
      }),
    });
    expect(created.status).toBe(201);
    const { data } = (await created.json()) as { data: { id: string; willRun: boolean } };
    expect(data.willRun, 'nothing executes these rules').toBe(false);

    const listed = await fetch(`${API}/platform/workflows`, {
      headers: { Authorization: `Bearer ${t}` },
    }).then((r) => r.json());
    const body = listed as {
      data: { workflows: { id: string; name: string; status: string }[]; execution: { runs: boolean } };
    };
    const found = body.data.workflows.find((w) => w.id === data.id);
    expect(found, 'the rule must come back from the database').toBeTruthy();
    expect(found!.name).toBe(name);
    expect(body.data.execution.runs).toBe(false);

    // Toggling persists too.
    const toggled = await fetch(`${API}/platform/workflows/${data.id}/toggle`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${t}` },
    });
    expect(toggled.status).toBe(200);

    const after = await fetch(`${API}/platform/workflows`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => r.json())
      .then((b) => (b as { data: { workflows: { id: string; status: string }[] } }).data.workflows);
    expect(after.find((w) => w.id === data.id)!.status).toBe('paused');
  });

  test('a workflow has no execution history, because nothing runs one', async ({
    signedInPage: page,
  }) => {
    await page.goto('/dashboard');
    const t = await token(page);

    const workflows = await fetch(`${API}/platform/workflows`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => r.json())
      .then((b) => (b as { data: { workflows: { id: string }[] } }).data.workflows);

    if (workflows.length === 0) return;

    const res = await fetch(`${API}/platform/workflows/${workflows[0].id}/history`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    const body = (await res.json()) as {
      data: { executions: unknown[]; execution: { runs: boolean; why: string } };
    };

    // Five were generated from the workflow id on every request, with
    // durations and "Action completed".
    expect(body.data.executions).toEqual([]);
    expect(body.data.execution.runs).toBe(false);
    expect(JSON.stringify(body)).not.toContain('Action completed');
  });

  test('referrals and report schedules refuse rather than pretend', async ({
    signedInPage: page,
  }) => {
    await page.goto('/dashboard');
    const t = await token(page);

    const referral = await fetch(`${API}/platform/referrals`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ advisorId: 'adv_1', advisorName: 'Sarah Chen', source: 'Email' }),
    });
    expect(referral.status).toBe(501);

    const followUp = await fetch(`${API}/platform/referrals/pref_001/follow-up`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'email', notes: 'checked in' }),
    });
    expect(followUp.status).toBe(501);

    const schedule = await fetch(`${API}/platform/reports/schedules`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportType: 'monthly-summary',
        frequency: 'monthly',
        recipients: ['ops@demoadvisors.io'],
      }),
    });
    expect(schedule.status).toBe(501);

    // And the lists carry nothing invented.
    const list = await fetch(`${API}/platform/referrals`, {
      headers: { Authorization: `Bearer ${t}` },
    }).then((r) => r.text());
    for (const invented of ['Sarah Chen', 'Marcus Williams', 'Priya Nair', 'James Okafor']) {
      expect(list).not.toContain(invented);
    }
  });
});
