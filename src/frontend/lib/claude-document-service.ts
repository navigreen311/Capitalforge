// ============================================================
// CapitalForge — Claude AI Document Generation Service
// Central service for all AI-powered document generation.
// Mock mode: returns template content when NEXT_PUBLIC_USE_MOCK_DATA=true
// ============================================================

export type DocumentType =
  | 'decline_reconsideration_letter'
  | 'adverse_action_response'
  | 'hardship_workout_proposal'
  | 'business_purpose_statement'
  | 'product_reality_acknowledgment'
  | 'fee_disclosure_letter'
  | 'welcome_package'
  | 'apr_expiry_warning_letter'
  | 'restack_opportunity_summary'
  | 'compliance_incident_report'
  | 'client_progress_report'
  | 'funding_round_summary'
  | 'advisor_call_summary'
  | 'collection_notice'
  | 'consent_confirmation_letter';

export interface GenerateDocumentParams {
  type: DocumentType;
  context: Record<string, unknown>;
  tone?: 'formal' | 'professional' | 'empathetic' | 'firm';
  length?: 'brief' | 'standard' | 'detailed';
}

export interface GeneratedDocument {
  content: string;
  word_count: number;
  generated_at: string;
  model: string;
  type: DocumentType;
}

// ── Mock content templates ──────────────────────────────────────

const MOCK_TEMPLATES: Record<DocumentType, (ctx: Record<string, unknown>) => string> = {
  decline_reconsideration_letter: (ctx) => `${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n\nTo: ${ctx.issuer ?? 'Issuer'} Reconsideration Department\nRe: Application for ${ctx.card_name ?? 'Business Credit Card'}\nBusiness: ${ctx.client_name ?? 'Client'}\n\nDear Credit Analyst,\n\nI am writing to respectfully request reconsideration of the recent business credit card application for ${ctx.client_name ?? 'our business'}, which was declined on ${ctx.decline_date ?? 'a recent date'}.\n\nI understand the application was declined due to: ${ctx.decline_reasons ?? 'the stated reasons in the adverse action notice'}.\n\nI would like to provide additional context to support reconsideration:\n\n1. Our business has demonstrated consistent revenue of ${ctx.annual_revenue ? '$' + Number(ctx.annual_revenue).toLocaleString() : '[revenue]'} annually and maintains strong cash flow.\n\n2. The recent credit inquiries reflect a strategic business credit-building initiative and do not represent ongoing credit-seeking behavior.\n\n3. We are committed to responsibly managing this account and have a track record of on-time payments across all existing obligations.\n\nI am confident that upon review, ${ctx.issuer ?? 'your institution'} will find our application merits approval. I am available to provide supporting documentation including bank statements, tax returns, or financial projections.\n\nPlease contact me at your earliest convenience.\n\nSincerely,\n${ctx.advisor_name ?? '[Advisor Name]'}\n${ctx.advisor_company ?? 'CapitalForge'}`,

  adverse_action_response: (ctx) => `Re: Adverse Action Notice — ${ctx.client_name ?? 'Client'}\n\nWe acknowledge receipt of the adverse action notice dated ${ctx.notice_date ?? '[date]'} regarding the application for ${ctx.card_name ?? '[card]'} with ${ctx.issuer ?? '[issuer]'}.\n\nWe wish to address each stated reason and provide supporting documentation for reconsideration.\n\n${ctx.decline_reasons ?? 'The stated reasons have been reviewed.'}\n\nWe request that ${ctx.issuer ?? 'the issuer'} reconsider this application in light of the additional context provided.\n\nSincerely,\n${ctx.advisor_name ?? '[Advisor]'}`,

  hardship_workout_proposal: (ctx) => `${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n\nTo: ${ctx.issuer ?? 'Issuer'} Hardship Department\nRe: Payment Arrangement Request\nAccount Holder: ${ctx.client_name ?? 'Client'}\nCurrent Balance: ${ctx.current_balance ? '$' + Number(ctx.current_balance).toLocaleString() : '[balance]'}\n\nDear Hardship Team,\n\nI am writing on behalf of ${ctx.client_name ?? 'our client'} to request a temporary payment arrangement due to ${ctx.hardship_reason ?? 'temporary financial difficulty'}.\n\nWe respectfully request:\n1. A temporary payment reduction for the next 3-6 months\n2. An interest rate reduction from ${ctx.current_apr ?? '[current APR]'}% to a hardship rate\n3. A structured repayment plan that allows the client to maintain good standing\n\nThe client remains committed to fulfilling all obligations and has ${ctx.monthly_revenue ? 'monthly revenue of $' + Number(ctx.monthly_revenue).toLocaleString() : 'ongoing business income'} to service a modified payment plan.\n\nWe appreciate your consideration of this request.\n\nSincerely,\n${ctx.advisor_name ?? '[Advisor]'}\nCapitalForge`,

  business_purpose_statement: (ctx) => `Business Purpose Statement\n\nBusiness: ${ctx.client_name ?? '[Business Name]'}\nEntity Type: ${ctx.business_type ?? '[Entity Type]'}\nIndustry: ${ctx.industry ?? '[Industry]'}\nNAICS Code: ${ctx.naics_code ?? '[NAICS]'}\n\nThe requested credit line of ${ctx.requested_amount ? '$' + Number(ctx.requested_amount).toLocaleString() : '[amount]'} for the ${ctx.card_name ?? '[card product]'} will be used exclusively for legitimate business operations including: ${ctx.intended_use ?? 'working capital, vendor payments, and operational expenses'}.\n\nThis credit facility supports the ongoing operations of ${ctx.client_name ?? 'the business'} and will not be used for personal expenses, cash advances, or any non-business purpose.`,

  product_reality_acknowledgment: (ctx) => `PRODUCT-REALITY ACKNOWLEDGMENT\n\nClient: ${ctx.client_name ?? '[Client]'}\nPrimary Owner: ${ctx.primary_owner ?? '[Owner]'}\nDate: ${new Date().toLocaleDateString()}\n\nI acknowledge and understand that:\n\n1. I am receiving business credit cards, not a traditional business loan.\n2. Cards carry variable APRs after any introductory period expires.\n3. Personal guarantees may apply to business credit card accounts.\n4. Cash advances are restricted and subject to additional fees.\n5. The program fee structure is as disclosed in the Fee Disclosure Letter.\n\nI have read, understand, and agree to the terms of the CapitalForge Business Credit Card Stacking Program.\n\nSignature: ________________________\nDate: ${new Date().toLocaleDateString()}`,

  fee_disclosure_letter: (ctx) => `FEE DISCLOSURE LETTER\n\nTo: ${ctx.client_name ?? '[Client]'}\nFrom: ${ctx.advisor_name ?? '[Advisor]'}, CapitalForge\nDate: ${new Date().toLocaleDateString()}\n\nThis letter discloses all fees associated with your CapitalForge engagement:\n\n- Program Fee: ${ctx.program_fee_flat ? '$' + Number(ctx.program_fee_flat).toLocaleString() : '[flat fee]'}\n- Percentage of Funding Fee: ${ctx.program_fee_pct ?? '[X]'}% of total funded amount\n- Estimated Total Fees: Based on funding estimate of ${ctx.funding_estimate ? '$' + Number(ctx.funding_estimate).toLocaleString() : '[estimate]'}\n\nRefund Policy: ${ctx.refund_policy ?? 'Non-refundable after funding round commences.'}\n\nPlease review these terms carefully. Contact your advisor with any questions.`,

  welcome_package: (ctx) => `Welcome to CapitalForge!\n\nDear ${ctx.owner_name ?? ctx.client_name ?? '[Client]'},\n\nWe are thrilled to welcome ${ctx.client_name ?? 'your business'} to the CapitalForge Business Credit Card Stacking Program.\n\nYour advisor, ${ctx.advisor_name ?? '[Advisor]'}, will guide you through every step of the funding process.\n\nNext Steps:\n${Array.isArray(ctx.next_steps) ? (ctx.next_steps as string[]).map((s, i) => `${i + 1}. ${s}`).join('\n') : '1. Complete acknowledgments\n2. Upload bank statements\n3. Schedule strategy call'}\n\nWe look forward to helping you access the capital your business deserves.\n\nWarm regards,\n${ctx.advisor_name ?? '[Advisor]'}\nCapitalForge`,

  apr_expiry_warning_letter: (ctx) => `URGENT: APR Expiry Notice\n\nDear ${ctx.owner_name ?? ctx.client_name ?? '[Client]'},\n\nThis letter is to advise you that one or more of your business credit cards have 0% introductory APR periods expiring soon.\n\n${Array.isArray(ctx.expiring_cards) ? (ctx.expiring_cards as Array<Record<string, unknown>>).map(c => `- ${c.card_name} (${c.issuer}): Balance $${Number(c.balance).toLocaleString()}, expires in ${c.days_remaining} days`).join('\n') : 'Your card APR is expiring soon.'}\n\nWe recommend immediate action to minimize interest charges. Please contact ${ctx.advisor_name ?? 'your advisor'} to discuss options.\n\nSincerely,\n${ctx.advisor_name ?? '[Advisor]'}\nCapitalForge`,

  restack_opportunity_summary: (ctx) => `Re-Stack Funding Opportunity\n\nClient: ${ctx.client_name ?? '[Client]'}\n\nBased on your current credit profile, you are eligible for an additional round of funding.\n\nEstimated additional credit: ${ctx.estimated_credit ? '$' + Number(ctx.estimated_credit).toLocaleString() : '[estimate]'}\nReadiness score: ${ctx.readiness_score ?? '[score]'}/100\n\nContact your advisor to discuss next steps.`,

  compliance_incident_report: (ctx) => `COMPLIANCE INCIDENT REPORT\n\nDate: ${new Date().toLocaleDateString()}\nIncident Type: ${ctx.incident_type ?? '[Type]'}\nSeverity: ${ctx.severity ?? '[Severity]'}\n\nDescription: ${ctx.description ?? '[Description of the incident]'}\n\nAffected Clients: ${ctx.affected_clients ?? '[None identified]'}\n\nRoot Cause: ${ctx.root_cause ?? '[Under investigation]'}\n\nRemediation Steps:\n1. ${ctx.remediation ?? 'Investigation initiated'}`,

  client_progress_report: (ctx) => `Client Progress Report\n\nClient: ${ctx.client_name ?? '[Client]'}\nPeriod: ${ctx.period ?? 'Current Quarter'}\nAdvisor: ${ctx.advisor_name ?? '[Advisor]'}\n\nFunding Status: ${ctx.funding_status ?? 'In progress'}\nCredit Score Change: ${ctx.score_change ?? 'Stable'}\nPayment Performance: ${ctx.payment_performance ?? 'On track'}\n\nRecommended Next Steps:\n${ctx.next_steps ?? '1. Continue current strategy'}`,

  funding_round_summary: (ctx) => `FUNDING ROUND SUMMARY\n\nClient: ${ctx.client_name ?? '[Client]'}\nRound: ${ctx.round_number ?? '[#]'} (${ctx.round_id ?? '[ID]'})\n\nTotal Credit Secured: ${ctx.total_credit ? '$' + Number(ctx.total_credit).toLocaleString() : '[amount]'}\nTarget: ${ctx.target_credit ? '$' + Number(ctx.target_credit).toLocaleString() : '[target]'}\n\nCards Obtained:\n${Array.isArray(ctx.cards) ? (ctx.cards as Array<Record<string, unknown>>).map(c => `- ${c.name} (${c.issuer}): $${Number(c.approved_amount).toLocaleString()}`).join('\n') : '[Cards listed here]'}\n\nProgram Fee: ${ctx.program_fee ? '$' + Number(ctx.program_fee).toLocaleString() : '[fee]'}\nNet Usable Capital: ${ctx.net_capital ? '$' + Number(ctx.net_capital).toLocaleString() : '[net]'}`,

  advisor_call_summary: (ctx) => `Call Summary\n\nClient: ${ctx.client_name ?? '[Client]'}\nDate: ${ctx.call_date ?? new Date().toLocaleDateString()}\nDuration: ${ctx.call_duration_minutes ?? '[X]'} minutes\nAdvisor: ${ctx.advisor_name ?? '[Advisor]'}\n\nPurpose: ${ctx.call_purpose ?? '[Purpose]'}\n\nTopics Discussed:\n${Array.isArray(ctx.topics_discussed) ? (ctx.topics_discussed as string[]).map(t => `- ${t}`).join('\n') : '- [Topics]'}\n\nAction Items:\n${Array.isArray(ctx.action_items) ? (ctx.action_items as string[]).map(a => `- ${a}`).join('\n') : '- [Action items]'}`,

  collection_notice: (ctx) => `PAST DUE NOTICE\n\nTo: ${ctx.client_name ?? '[Client]'}\nDate: ${new Date().toLocaleDateString()}\n\nAmount Due: ${ctx.amount_due ? '$' + Number(ctx.amount_due).toLocaleString() : '[amount]'}\nOriginal Due Date: ${ctx.due_date ?? '[date]'}\n\nThis notice is to inform you that payment is past due. Please remit payment immediately to avoid further action.\n\nPayment may be made via: ACH, wire transfer, or check.\n\nIf you have questions, contact ${ctx.advisor_name ?? 'your advisor'} at CapitalForge.`,

  consent_confirmation_letter: (ctx) => `CONSENT CONFIRMATION\n\nDear ${ctx.client_name ?? '[Client]'},\n\nThis letter confirms that your communication consent has been recorded as of ${ctx.consent_date ?? new Date().toLocaleDateString()}.\n\nConsented Channels: ${Array.isArray(ctx.channels) ? (ctx.channels as string[]).join(', ') : 'Voice, SMS, Email'}\n\nYou may revoke consent at any time by contacting your advisor or visiting the client portal.\n\nSincerely,\nCapitalForge Compliance`,
};

// ── Main generate function ──────────────────────────────────────

export async function generateDocument(
  params: GenerateDocumentParams
): Promise<GeneratedDocument> {
  // Mock mode — return template content
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
    await new Promise(res => setTimeout(res, 1200 + Math.random() * 800));
    const template = MOCK_TEMPLATES[params.type];
    const content = template ? template(params.context) : `[Mock ${params.type} document for ${params.context.client_name ?? 'client'}]`;
    return {
      content,
      word_count: content.split(/\s+/).length,
      generated_at: new Date().toISOString(),
      model: 'claude-sonnet-4-20250514 (mock)',
      type: params.type,
    };
  }

  // Real API call (requires API key configured server-side or via proxy)
  try {
    const response = await fetch('/api/v1/ai/generate-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data as GeneratedDocument;
  } catch {
    // Fallback to mock if API unavailable
    const template = MOCK_TEMPLATES[params.type];
    const content = template ? template(params.context) : `[Generated ${params.type} document]`;
    return {
      content,
      word_count: content.split(/\s+/).length,
      generated_at: new Date().toISOString(),
      model: 'template-fallback',
      type: params.type,
    };
  }
}

// ── Document Vault save helper ──────────────────────────────────

export async function saveToDocumentVault(doc: GeneratedDocument, clientId: string): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
  await fetch('/api/v1/documents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      client_id: clientId,
      type: doc.type,
      filename: `${doc.type}_${new Date().toISOString().split('T')[0]}.txt`,
      content: doc.content,
      generated_by: 'claude_ai',
      model: doc.model,
      generated_at: doc.generated_at,
      word_count: doc.word_count,
    }),
  }).catch(() => {}); // graceful failure
}
