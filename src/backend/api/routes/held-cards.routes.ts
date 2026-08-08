// ============================================================
// CapitalForge — cards a client already holds
//
//   GET    /api/clients/:businessId/held-cards
//   POST   /api/clients/:businessId/held-cards
//   DELETE /api/clients/:businessId/held-cards/:id
//
// The optimizer form collects held cards and, until now, sent them only on the
// run request. So they existed for the length of one plan: invisible to the
// next run, and invisible to the 5/24 panel, which is how "5 of 5 slots open"
// appeared beside a panel listing a held Chase card.
//
// ── Why saving is explicit rather than a side effect of running a plan
//
// Two reasons, and the second is the one that settles it.
//
// The checkboxes are also how an advisor explores: ticking a card to see what
// the plan does is a question, not a claim. Recording it silently would fill a
// client's file with assertions nobody meant to make — and every row here
// carries an attestor's name.
//
// And an auto-write on run would only ever add. Ticking would record a card;
// unticking would not remove it, because a run cannot tell "I no longer hold
// this" from "I did not mention it this time". That is the enable-without-
// disable shape this codebase has now found three times — legal hold, tenant
// suspend, and the missing unsuspend — so it is not a shape to build a fourth
// instance of deliberately.
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import { z } from 'zod';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { PERMISSIONS } from '../../../shared/constants/index.js';
import { prisma as sharedPrisma } from '../../config/database.js';
import { createHeldCardsService } from '../../services/held-cards.service.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';

const router = Router();
const heldCards = createHeldCardsService(sharedPrisma);

const CardSchema = z.object({
  issuer: z.string().min(1, 'issuer is required'),
  productName: z.string().min(1).optional(),
  /**
   * ISO date, or null when the client cannot recall.
   *
   * Optional on purpose. Requiring it would push advisors to invent a date to
   * get past the form, and an invented date counts toward 5/24 as confidently
   * as a real one — the failure being avoided is worse than the gap.
   */
  openedAt: z.string().datetime().nullable().optional(),
  creditLimit: z.number().nonnegative().nullable().optional(),
});

const SaveSchema = z.object({
  cards: z.array(CardSchema).max(50),
  /**
   * Replace what is on record rather than adding to it.
   *
   * The form shows a complete list, so saving it is a statement about the
   * whole set: a card removed from the form is a card the client no longer
   * holds. Without this the only possible edit is adding, which is the
   * one-way write the explicit save exists to avoid.
   */
  replace: z.boolean().default(true),
});

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: { code, message } } satisfies ApiResponse);
}

/** The business, if it belongs to this tenant. */
async function ownedBusiness(businessId: string, tenantId: string) {
  return sharedPrisma.business.findFirst({ where: { id: businessId, tenantId } });
}

// ── GET ──────────────────────────────────────────────────────

router.get(
  '/clients/:businessId/held-cards',
  tenantMiddleware,
  requirePermissions(PERMISSIONS.BUSINESS_READ),
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = req.tenant!;
    const businessId = req.params['businessId']!;

    if (!(await ownedBusiness(businessId, tenantId))) {
      fail(res, 404, 'NOT_FOUND', `Client ${businessId} was not found.`);
      return;
    }

    const cards = await heldCards.listForBusiness(businessId, tenantId);

    // `creditLimit` is a Prisma Decimal, which serialises to a JSON *string*.
    // This handler returned rows unchanged, so a numeric column crossed the
    // wire as "25000" — and the POST schema below, correctly, wants a number.
    //
    // The round trip is not hypothetical: the optimizer reads this list,
    // keeps the cards its own catalogue cannot show, and sends them back
    // untouched on save precisely so they are not deleted on behalf of an
    // advisor who was never shown them. That payload failed validation, so
    // saving the form 400'd for any client holding a card outside
    // `EXISTING_CARD_CATALOGUE` with a limit on it.
    //
    // It had never happened because `held_cards` was empty in every tenant:
    // with no rows, nothing is ever unrepresented, and the branch could not
    // run. The first three seeded rows reached it immediately.
    //
    // Fixed here rather than at the caller because a numeric field should not
    // leave the API as a string — the same `Number(...)` this repo already
    // applies wherever a Decimal is serialised.
    res.json({
      success: true,
      data: {
        cards: cards.map((card) => ({
          ...card,
          creditLimit: card.creditLimit == null ? null : Number(card.creditLimit),
        })),
      },
    } satisfies ApiResponse);
  },
);

// ── POST ─────────────────────────────────────────────────────

router.post(
  '/clients/:businessId/held-cards',
  tenantMiddleware,
  requirePermissions(PERMISSIONS.BUSINESS_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId, userId } = req.tenant!;
    const businessId = req.params['businessId']!;

    const parsed = SaveSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, 'VALIDATION_ERROR', 'Invalid held-card list.');
      return;
    }

    if (!(await ownedBusiness(businessId, tenantId))) {
      fail(res, 404, 'NOT_FOUND', `Client ${businessId} was not found.`);
      return;
    }

    // Replace-in-a-transaction, so a save is never half-applied. A partial
    // write here would leave a client's card list in a state neither the
    // advisor nor the record intended.
    const written = await sharedPrisma.$transaction(async (tx) => {
      if (parsed.data.replace) {
        await tx.heldCard.deleteMany({ where: { businessId, tenantId } });
      }

      if (parsed.data.cards.length === 0) return 0;

      const { count } = await tx.heldCard.createMany({
        data: parsed.data.cards.map((c) => ({
          tenantId,
          businessId,
          issuer: c.issuer,
          productName: c.productName ?? null,
          openedAt: c.openedAt == null ? null : new Date(c.openedAt),
          creditLimit: c.creditLimit ?? null,
          // The attestor is the signed-in advisor, not a field the client
          // supplies. An attestation naming whoever the caller says it names
          // is not an attestation.
          attestedBy: userId,
          source: 'advisor_attested',
        })),
      });
      return count;
    });

    logger.info('[held-cards] Saved from form', {
      businessId,
      written,
      replaced: parsed.data.replace,
      undated: parsed.data.cards.filter((c) => c.openedAt == null).length,
    });

    const cards = await heldCards.listForBusiness(businessId, tenantId);
    res.json({ success: true, data: { cards, written } } satisfies ApiResponse);
  },
);

// ── DELETE ───────────────────────────────────────────────────

router.delete(
  '/clients/:businessId/held-cards/:id',
  tenantMiddleware,
  requirePermissions(PERMISSIONS.BUSINESS_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = req.tenant!;

    const removed = await heldCards.remove(req.params['id']!, tenantId);
    if (!removed) {
      fail(res, 404, 'NOT_FOUND', 'That card is not on record for this client.');
      return;
    }

    res.json({ success: true, data: { removed: true } } satisfies ApiResponse);
  },
);

export { router as heldCardsRouter };
