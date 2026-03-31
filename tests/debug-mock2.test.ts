import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../src/backend/services/sanctions-screening.js', () => ({
  screenSanctions: vi.fn().mockResolvedValue({
    result: 'no_match',
    confidenceScore: 0.0,
    reason: 'No watchlist matches found.',
    requiresManualReview: false,
    matchedEntries: [],
    screenedAt: new Date(),
  }),
  isHardOFACStop: vi.fn().mockReturnValue(false),
}));

vi.mock('../src/backend/services/fraud-detection.js', () => ({
  detectFraud: vi.fn().mockResolvedValue({
    riskScore: 10, disposition: 'clear', signals: [],
    requiresManualReview: false, summary: 'No fraud.', evaluatedAt: new Date(),
  }),
}));

import { KybKycService, setPrismaClient } from '../src/backend/services/kyb-kyc.service.js';
import { screenSanctions } from '../src/backend/services/sanctions-screening.js';

function makeMockPrisma(business: any, owner: any) {
  return {
    business: {
      findFirst: vi.fn().mockImplementation((args?: any) => {
        if (args?.include?.owners) return Promise.resolve({ ...business, owners: [owner] });
        return Promise.resolve(business);
      }),
      update: vi.fn().mockResolvedValue(business),
    },
    businessOwner: {
      update: vi.fn().mockResolvedValue(owner),
      findMany: vi.fn().mockResolvedValue([owner]),
    },
    complianceCheck: {
      findFirst: vi.fn().mockResolvedValue({ findings: { status: 'verified' } }),
      create: vi.fn().mockResolvedValue({ id: 'check-1' }),
    },
    ledgerEvent: { create: vi.fn().mockResolvedValue({ id: 'evt-1' }) },
  };
}

describe('debug mock service', () => {
  it('screenSanctions is mocked inside verifyKyb', async () => {
    const business = {
      id: 'biz-1', tenantId: 'tenant-1', legalName: 'Test Corp', ein: '12-3456789',
      entityType: 'llc', stateOfFormation: 'DE', status: 'intake',
      annualRevenue: new Prisma.Decimal('480000'), monthlyRevenue: new Prisma.Decimal('40000'),
      dateOfFormation: new Date('2021-01-01'), industry: 'technology', mcc: '7372',
    };
    const owner = {
      id: 'owner-1', businessId: 'biz-1', firstName: 'Jane', lastName: 'Doe',
      ownershipPercent: new Prisma.Decimal('100'), isBeneficialOwner: true,
      kycStatus: 'pending', kycVerifiedAt: null,
    };
    const prisma = makeMockPrisma(business, owner);
    setPrismaClient(prisma as any);
    
    const svc = new KybKycService(prisma as any);
    console.log('screenSanctions isMockFunction:', vi.isMockFunction(screenSanctions));
    
    const result = await svc.verifyKyb({
      businessId: 'biz-1', tenantId: 'tenant-1',
      legalName: 'Test Corp', ein: '12-3456789',
      entityType: 'llc', stateOfFormation: 'DE',
    });
    
    console.log('Result:', result);
    expect(result.status).toBe('verified');
  });
});
