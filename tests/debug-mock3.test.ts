import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { screenSanctions, isHardOFACStop } from '../src/backend/services/sanctions-screening.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mock persistence', () => {
  it('test 1 - mock works', async () => {
    const result = await screenSanctions({ name: 'Test', country: 'US' });
    console.log('Test 1 result:', result);
    expect(result).toBeDefined();
  });

  it('test 2 - mock still works after restoreAllMocks', async () => {
    console.log('Test 2 - isMockFunction:', vi.isMockFunction(screenSanctions));
    const result = await screenSanctions({ name: 'Test', country: 'US' });
    console.log('Test 2 result:', result);
    expect(result).toBeDefined();
    expect(result?.result).toBe('no_match');
  });
});
