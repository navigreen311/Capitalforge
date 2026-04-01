// ============================================================
// Tenant Lookup Routes (public — needed for login flow)
// GET /api/tenants/by-slug/:slug
// GET /api/tenants
// ============================================================

import { Router, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/tenants/by-slug/:slug
router.get('/by-slug/:slug', async (req: Request, res: Response): Promise<void> => {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: req.params.slug },
    select: { id: true, name: true, slug: true, plan: true },
  });

  if (!tenant) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant not found' } });
    return;
  }

  res.json({ success: true, data: tenant });
});

// GET /api/tenants
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, name: true, slug: true, plan: true },
    take: 10,
  });

  res.json({ success: true, data: tenants });
});

export { router as tenantLookupRouter };
