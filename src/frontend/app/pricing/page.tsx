'use client';

// ============================================================
// /pricing — Public pricing page
// Dark theme marketing layout with 3-tier pricing cards
// and feature comparison table. No auth required.
// ============================================================

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PricingTier {
  name: string;
  price: string;
  priceNote?: string;
  description: string;
  features: string[];
  cta: string;
  ctaAction: 'get-started' | 'book-demo';
  highlighted?: boolean;
  badge?: string;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const TIERS: PricingTier[] = [
  {
    name: 'Starter',
    price: '$297',
    priceNote: '/month',
    description: 'For advisors launching their first funding practice.',
    features: [
      'Up to 5 active clients',
      'Core Operations dashboard',
      'Basic compliance checks',
      'Business onboarding wizard',
      'Funding round management',
      'Email support',
    ],
    cta: 'Get Started',
    ctaAction: 'get-started',
  },
  {
    name: 'Pro',
    price: '$697',
    priceNote: '/month',
    description: 'For growing teams who need the full platform.',
    features: [
      'Up to 25 active clients',
      'All Starter features',
      'VoiceForge telephony',
      'VisionAudioForge doc AI',
      'Claude AI suitability engine',
      'Card stacking optimizer',
      'Repayment & APR monitoring',
      'Priority support',
    ],
    cta: 'Get Started',
    ctaAction: 'get-started',
    highlighted: true,
    badge: 'Most Popular',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'For institutions that require scale, security, and custom SLAs.',
    features: [
      'Unlimited active clients',
      'All Pro features',
      'Multi-tenant white-label',
      'Full API access',
      'Dedicated account manager',
      'Custom SLA & uptime guarantee',
      'SSO / SAML integration',
      'Compliance audit exports',
    ],
    cta: 'Book a Demo',
    ctaAction: 'book-demo',
  },
];

const COMPARISON_FEATURES: { feature: string; starter: string | boolean; pro: string | boolean; enterprise: string | boolean }[] = [
  { feature: 'Active clients',        starter: 'Up to 5',   pro: 'Up to 25',   enterprise: 'Unlimited' },
  { feature: 'Business onboarding',   starter: true,        pro: true,          enterprise: true },
  { feature: 'Funding rounds',        starter: true,        pro: true,          enterprise: true },
  { feature: 'Compliance checks',     starter: 'Basic',     pro: 'Advanced',    enterprise: 'Advanced' },
  { feature: 'Card stacking optimizer', starter: false,     pro: true,          enterprise: true },
  { feature: 'VoiceForge telephony',  starter: false,       pro: true,          enterprise: true },
  { feature: 'VisionAudioForge AI',   starter: false,       pro: true,          enterprise: true },
  { feature: 'Claude AI engine',      starter: false,       pro: true,          enterprise: true },
  { feature: 'APR monitoring',        starter: false,       pro: true,          enterprise: true },
  { feature: 'Repayment management',  starter: false,       pro: true,          enterprise: true },
  { feature: 'Multi-tenant',          starter: false,       pro: false,         enterprise: true },
  { feature: 'API access',            starter: false,       pro: false,         enterprise: true },
  { feature: 'SSO / SAML',            starter: false,       pro: false,         enterprise: true },
  { feature: 'Custom SLA',            starter: false,       pro: false,         enterprise: true },
  { feature: 'Support',               starter: 'Email',     pro: 'Priority',    enterprise: 'Dedicated' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function CheckIcon() {
  return (
    <svg className="w-5 h-5 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-5 h-5 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CellValue({ value }: { value: string | boolean }) {
  if (value === true) return <CheckIcon />;
  if (value === false) return <XIcon />;
  return <span className="text-sm text-gray-300">{value}</span>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PricingPage() {
  const [ctaClicked, setCtaClicked] = useState<string | null>(null);

  const handleCta = (tier: PricingTier) => {
    if (tier.ctaAction === 'book-demo') {
      setCtaClicked(`Demo request for ${tier.name} — coming soon`);
    } else {
      setCtaClicked(`Get Started with ${tier.name} — coming soon`);
    }
    setTimeout(() => setCtaClicked(null), 3000);
  };

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100">
      {/* Hero */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12 text-center">
        {/* Branding */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-lg bg-[#C9A84C] flex items-center justify-center">
            <span className="text-[#0A1628] font-black text-lg">CF</span>
          </div>
          <span className="text-2xl font-bold tracking-tight text-white">CapitalForge</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto">
          Choose the plan that fits your funding advisory practice.
          All plans include our core onboarding and compliance tools.
        </p>
      </div>

      {/* Pricing cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-2xl border p-8 flex flex-col ${
                tier.highlighted
                  ? 'border-[#C9A84C] bg-[#0E1D35] shadow-lg shadow-[#C9A84C]/10'
                  : 'border-gray-700/50 bg-[#0E1D35]/60'
              }`}
            >
              {/* Badge */}
              {tier.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-[#C9A84C] text-[#0A1628] text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                    {tier.badge}
                  </span>
                </div>
              )}

              {/* Tier name */}
              <h3 className="text-lg font-semibold text-white mb-2">{tier.name}</h3>
              <p className="text-sm text-gray-400 mb-6">{tier.description}</p>

              {/* Price */}
              <div className="mb-8">
                <span className="text-4xl font-extrabold text-white">{tier.price}</span>
                {tier.priceNote && (
                  <span className="text-gray-400 text-base ml-1">{tier.priceNote}</span>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-3 mb-8 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <CheckIcon />
                    <span className="text-sm text-gray-300">{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                onClick={() => handleCta(tier)}
                className={`w-full py-3 px-6 rounded-xl font-semibold text-sm transition-all ${
                  tier.highlighted
                    ? 'bg-[#C9A84C] text-[#0A1628] hover:bg-[#D4B65E] shadow-lg shadow-[#C9A84C]/20'
                    : tier.ctaAction === 'book-demo'
                    ? 'bg-white/10 text-white border border-gray-600 hover:bg-white/20'
                    : 'bg-blue-600 text-white hover:bg-blue-500'
                }`}
              >
                {tier.cta}
              </button>
            </div>
          ))}
        </div>

        {/* Toast */}
        {ctaClicked && (
          <div className="fixed bottom-6 right-6 bg-[#0E1D35] border border-[#C9A84C]/30 rounded-xl px-5 py-3 shadow-xl text-sm text-gray-200 z-50 animate-fade-in">
            {ctaClicked}
          </div>
        )}
      </div>

      {/* Feature comparison table */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <h2 className="text-2xl font-bold text-white text-center mb-8">Feature comparison</h2>
        <div className="rounded-xl border border-gray-700/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0E1D35]">
                <th className="text-left px-5 py-4 text-gray-400 font-semibold">Feature</th>
                <th className="text-center px-5 py-4 text-gray-400 font-semibold">Starter</th>
                <th className="text-center px-5 py-4 font-semibold">
                  <span className="text-[#C9A84C]">Pro</span>
                </th>
                <th className="text-center px-5 py-4 text-gray-400 font-semibold">Enterprise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {COMPARISON_FEATURES.map((row) => (
                <tr key={row.feature} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3 text-gray-300 font-medium">{row.feature}</td>
                  <td className="px-5 py-3 text-center">
                    <div className="flex items-center justify-center">
                      <CellValue value={row.starter} />
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <div className="flex items-center justify-center">
                      <CellValue value={row.pro} />
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <div className="flex items-center justify-center">
                      <CellValue value={row.enterprise} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-800 py-8 text-center">
        <p className="text-sm text-gray-500">
          CapitalForge — The institutional-grade operating system for corporate credit, funding stacks, and compliance.
        </p>
      </div>
    </div>
  );
}
