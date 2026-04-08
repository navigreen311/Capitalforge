// ============================================================
// Issuer Reconsideration Guidance
// ============================================================
// Per-issuer guidance data for reconsideration calls including
// phone numbers, best times, talking points, and success rates.
// ============================================================

export interface IssuerReconGuidance {
  issuer: string;
  phone: string;
  department: string;
  bestTimeToCall: string;
  talkingPoints: string[];
  historicalSuccessRate: number; // 0-100
  avgReversalDays: number;
}

export const ISSUER_RECON_GUIDANCE: Record<string, IssuerReconGuidance> = {
  Chase: {
    issuer: 'Chase',
    phone: '1-888-270-2127',
    department: 'Business Card Reconsideration Line',
    bestTimeToCall: 'Tue-Thu, 9-11 AM ET',
    talkingPoints: [
      'Reference your existing Chase business checking relationship and deposit history.',
      'Mention total years in business and annual revenue figures.',
      'If denied for 5/24, explain that recent accounts were strategic and utilization is low.',
      'Offer to move credit from an existing Chase card to the new product.',
      'Ask to speak with a senior analyst if the first rep cannot override.',
    ],
    historicalSuccessRate: 35,
    avgReversalDays: 7,
  },
  Amex: {
    issuer: 'Amex',
    phone: '1-800-567-1083',
    department: 'Business New Accounts Reconsideration',
    bestTimeToCall: 'Mon-Wed, 10 AM - 1 PM ET',
    talkingPoints: [
      'Highlight your history with Amex personal or business cards and payment record.',
      'Provide updated income documentation or bank statements if income was the issue.',
      'Emphasize planned spend categories that align with the card rewards structure.',
      'Amex values relationship tenure -- mention how long you have been a member.',
      'Request a manual review if the decline was automated.',
    ],
    historicalSuccessRate: 40,
    avgReversalDays: 5,
  },
  'Capital One': {
    issuer: 'Capital One',
    phone: '1-800-625-7866',
    department: 'Business Credit Reconsideration',
    bestTimeToCall: 'Mon-Fri, 8-10 AM ET',
    talkingPoints: [
      'Capital One does not allow moving credit between cards -- focus on business fundamentals.',
      'Provide evidence of trade lines if denied for thin file (Dun & Bradstreet, Experian Business).',
      'Offer to start with a lower credit limit and request a review after 6 months.',
      'Mention any existing Capital One accounts in good standing.',
      'Ask if additional documentation (tax returns, bank statements) would help the review.',
    ],
    historicalSuccessRate: 20,
    avgReversalDays: 10,
  },
  Citi: {
    issuer: 'Citi',
    phone: '1-800-763-9795',
    department: 'Business Card Reconsideration Department',
    bestTimeToCall: 'Tue-Thu, 9 AM - 12 PM ET',
    talkingPoints: [
      'Reference your Citi business checking or savings account relationship.',
      'If denied for inquiries, explain each recent inquiry and its business purpose.',
      'Citi allows recon within 30 days of denial -- call promptly.',
      'Ask for a supervisor review if the initial analyst cannot approve.',
      'Offer to provide 2 years of business tax returns as supporting evidence.',
    ],
    historicalSuccessRate: 30,
    avgReversalDays: 8,
  },
  'Bank of America': {
    issuer: 'Bank of America',
    phone: '1-866-460-3638',
    department: 'Business Card Application Review',
    bestTimeToCall: 'Mon-Wed, 8-11 AM ET',
    talkingPoints: [
      'BofA heavily weights existing banking relationships -- mention your BofA business accounts.',
      'Preferred Rewards for Business status significantly improves approval odds.',
      'If denied for internal policy, request the specific reason codes from the analyst.',
      'Offer to consolidate business banking to BofA to strengthen the relationship.',
      'Ask about the Business Advantage Relationship Rewards tier for better terms.',
    ],
    historicalSuccessRate: 25,
    avgReversalDays: 12,
  },
  'US Bank': {
    issuer: 'US Bank',
    phone: '1-800-947-1444',
    department: 'Business Credit Card Reconsideration',
    bestTimeToCall: 'Mon-Fri, 9 AM - 2 PM CT',
    talkingPoints: [
      'US Bank values existing deposit relationships -- mention any US Bank business accounts.',
      'If denied for utilization, show a plan to pay down balances before the account opens.',
      'Provide updated credit report showing recent positive changes.',
      'US Bank is conservative -- be prepared with strong financials and a clear business case.',
      'Ask if a secured deposit or CD could offset the risk concern.',
    ],
    historicalSuccessRate: 22,
    avgReversalDays: 14,
  },
  'Wells Fargo': {
    issuer: 'Wells Fargo',
    phone: '1-800-869-3557',
    department: 'Business Credit Reconsideration Line',
    bestTimeToCall: 'Tue-Thu, 10 AM - 1 PM PT',
    talkingPoints: [
      'Wells Fargo prefers existing banking customers -- reference your WF business checking.',
      'If denied for derogatory marks, provide evidence of resolution (paid lien, dispute letters).',
      'Mention your business revenue trajectory and projected credit needs.',
      'Wells Fargo may offer a secured business card as an alternative -- ask about options.',
      'Request that the analyst review your full file, not just the automated score.',
    ],
    historicalSuccessRate: 18,
    avgReversalDays: 15,
  },
};

/**
 * Look up recon guidance for an issuer name.
 * Falls back to null if the issuer is not in the guidance database.
 */
export function getReconGuidance(issuer: string): IssuerReconGuidance | null {
  return ISSUER_RECON_GUIDANCE[issuer] ?? null;
}
