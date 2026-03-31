import { describe, it, expect, vi } from 'vitest';

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

import { screenSanctions } from '../src/backend/services/sanctions-screening.js';
import { KybKycService, setPrismaClient } from '../src/backend/services/kyb-kyc.service.js';

describe('debug mock', () => {
  it('screenSanctions mock intercepts service calls', async () => {
    const result = await screenSanctions({ name: 'Test', country: 'US' });
    expect(result).toBeDefined();
    expect(result.result).toBe('no_match');
  });
});
