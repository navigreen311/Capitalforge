// ============================================================
// / — CapitalForge Public Landing Page
// Dark navy (#0A1628) + gold (#C9A84C) marketing layout
// No auth required — full-viewport marketing page
// ============================================================

'use client';

import { useRef } from 'react';

// ─── Data ───────────────────────────────────────────────────

const PAIN_POINTS = [
  {
    problem: 'Spreadsheets break at 50 clients',
    solution: 'Centralized client management with real-time portfolio tracking across unlimited clients.',
    icon: (
      <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    problem: 'Compliance is a liability',
    solution: 'Automated state disclosures, TILA checks, and UDAP monitoring so you never miss a deadline.',
    icon: (
      <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    problem: 'Advisors waste hours on admin',
    solution: 'AI-powered document generation, automated workflows, and one-click funding round management.',
    icon: (
      <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

const FEATURES = [
  {
    title: 'Stacking Optimizer with Issuer Rules Engine',
    description: 'Maximize approval odds by sequencing applications based on issuer velocity rules, inquiry sensitivity, and 5/24 tracking.',
    icon: '📊',
  },
  {
    title: 'Compliance Automation',
    description: 'State-by-state disclosure management, TILA checks, UDAP monitoring, and audit-ready documentation.',
    icon: '🛡',
  },
  {
    title: 'AI-Powered Document Generation',
    description: 'Generate adverse action letters, suitability reports, and compliance dossiers with Claude AI integration.',
    icon: '📄',
  },
  {
    title: 'VoiceForge Telephony Integration',
    description: 'Record, transcribe, and compliance-check every client call. Auto-flag prohibited claims.',
    icon: '📞',
  },
  {
    title: 'Client Portal',
    description: 'White-labeled portal for clients to track funding progress, upload documents, and sign disclosures.',
    icon: '👤',
  },
  {
    title: 'Portfolio Analytics',
    description: 'Real-time dashboards for portfolio health, risk heatmaps, repayment tracking, and restack opportunities.',
    icon: '📈',
  },
];

const TESTIMONIALS = [
  {
    name: 'Marcus Chen',
    role: 'Senior Credit Advisor, Apex Funding Group',
    quote: 'CapitalForge cut our onboarding time from 3 hours to 20 minutes. The compliance automation alone is worth 10x the price.',
  },
  {
    name: 'Sarah Williams',
    role: 'Managing Partner, Pinnacle Advisory',
    quote: 'We went from managing 30 clients in spreadsheets to 120+ on CapitalForge with zero compliance incidents. Game changer.',
  },
  {
    name: 'David Rodriguez',
    role: 'Founder, BlueStack Capital',
    quote: 'The stacking optimizer consistently finds 15-20% more credit capacity than our manual process. Our clients love the results.',
  },
];

const METRICS = [
  { value: '$42M+', label: 'In funding managed' },
  { value: '180+', label: 'Active advisors' },
  { value: '48', label: 'States covered' },
];

const PRICING_TIERS = [
  {
    name: 'Starter',
    price: '$297',
    period: '/month',
    description: 'For advisors launching their first funding practice.',
    features: [
      'Up to 5 active clients',
      'Core Operations dashboard',
      'Basic compliance checks',
      'Business onboarding wizard',
      'Funding round management',
      'Email support',
    ],
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$697',
    period: '/month',
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
    highlighted: true,
    badge: 'Most Popular',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
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
    highlighted: false,
  },
];

const FOOTER_LINKS = {
  Product: ['Features', 'Pricing', 'Integrations', 'Changelog'],
  Company: ['About', 'Careers', 'Blog', 'Contact'],
  Legal: ['Privacy Policy', 'Terms of Service', 'Compliance'],
  Support: ['Documentation', 'API Reference', 'Status', 'Help Center'],
};

// ─── Helpers ────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg className="w-5 h-5 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ─── Page ───────────────────────────────────────────────────

export default function LandingPage() {
  const featuresRef = useRef<HTMLDivElement>(null);

  const scrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0A1628] text-gray-100" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ─── Navbar ────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-[#0A1628]/95 backdrop-blur-sm border-b border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[#C9A84C] flex items-center justify-center">
              <span className="text-[#0A1628] font-black text-sm">CF</span>
            </div>
            <span className="text-xl font-bold tracking-tight text-white">CapitalForge</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <button onClick={scrollToFeatures} className="hover:text-white transition-colors">Features</button>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#testimonials" className="hover:text-white transition-colors">Testimonials</a>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/login"
              className="text-sm text-gray-300 hover:text-white transition-colors"
            >
              Sign in
            </a>
            <a
              href="/pricing"
              className="bg-[#C9A84C] text-[#0A1628] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#D4B65E] transition-colors"
            >
              Start Free Trial
            </a>
          </div>
        </div>
      </nav>

      {/* ─── Hero Section ──────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background gradient accent */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#C9A84C]/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-2 bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-full px-4 py-1.5 mb-8">
            <span className="w-2 h-2 rounded-full bg-[#C9A84C] animate-pulse" />
            <span className="text-xs font-medium text-[#C9A84C]">Now serving 180+ advisory firms</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-tight">
            The Operating System for{' '}
            <span className="text-[#C9A84C]">Business Credit Advisors</span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Manage funding rounds, stacking strategy, compliance, and client
            communication — all in one platform.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/pricing"
              className="w-full sm:w-auto bg-[#C9A84C] text-[#0A1628] px-8 py-3.5 rounded-xl text-base font-semibold hover:bg-[#D4B65E] transition-colors shadow-lg shadow-[#C9A84C]/20"
            >
              Start Free Trial
            </a>
            <button
              onClick={scrollToFeatures}
              className="w-full sm:w-auto bg-white/10 text-white px-8 py-3.5 rounded-xl text-base font-semibold border border-gray-700 hover:bg-white/20 transition-colors"
            >
              Watch Demo
            </button>
          </div>
        </div>
      </section>

      {/* ─── Problem / Solution Section ────────────────────── */}
      <section className="bg-[#0E1D35]/60 border-y border-gray-800/50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-white">
              Built for the problems advisors{' '}
              <span className="text-[#C9A84C]">actually face</span>
            </h2>
            <p className="text-gray-400 mt-3 max-w-xl mx-auto">
              Stop cobbling together spreadsheets, email threads, and sticky notes. CapitalForge replaces your entire back office.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {PAIN_POINTS.map((item) => (
              <div
                key={item.problem}
                className="rounded-2xl border border-gray-700/50 bg-[#0A1628] p-8 hover:border-[#C9A84C]/30 transition-colors"
              >
                <div className="mb-4">{item.icon}</div>
                <h3 className="text-lg font-semibold text-white mb-2">{item.problem}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{item.solution}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features Section ──────────────────────────────── */}
      <section ref={featuresRef} id="features" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-white">
              Everything you need to{' '}
              <span className="text-[#C9A84C]">scale your practice</span>
            </h2>
            <p className="text-gray-400 mt-3 max-w-xl mx-auto">
              Six integrated modules that work together to maximize funding, minimize risk, and keep you compliant.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-gray-700/50 bg-[#0E1D35]/60 p-6 hover:border-[#C9A84C]/30 transition-colors group"
              >
                <div className="text-3xl mb-4">{feature.icon}</div>
                <h3 className="text-base font-semibold text-white mb-2 group-hover:text-[#C9A84C] transition-colors">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Social Proof ──────────────────────────────────── */}
      <section id="testimonials" className="bg-[#0E1D35]/60 border-y border-gray-800/50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-16">
            {METRICS.map((metric) => (
              <div key={metric.label} className="text-center">
                <div className="text-4xl font-extrabold text-[#C9A84C]">{metric.value}</div>
                <div className="text-sm text-gray-400 mt-1">{metric.label}</div>
              </div>
            ))}
          </div>

          {/* Testimonials */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="rounded-2xl border border-gray-700/50 bg-[#0A1628] p-6"
              >
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-4 h-4 text-[#C9A84C]" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-sm text-gray-300 leading-relaxed mb-4 italic">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div>
                  <div className="text-sm font-semibold text-white">{t.name}</div>
                  <div className="text-xs text-gray-500">{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing Section ───────────────────────────────── */}
      <section id="pricing" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-white">
              Simple, transparent{' '}
              <span className="text-[#C9A84C]">pricing</span>
            </h2>
            <p className="text-gray-400 mt-3">
              Choose the plan that fits your funding advisory practice.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-2xl border p-8 flex flex-col ${
                  tier.highlighted
                    ? 'border-[#C9A84C] bg-[#0E1D35] shadow-lg shadow-[#C9A84C]/10'
                    : 'border-gray-700/50 bg-[#0E1D35]/60'
                }`}
              >
                {tier.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-[#C9A84C] text-[#0A1628] text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                      {tier.badge}
                    </span>
                  </div>
                )}

                <h3 className="text-lg font-semibold text-white mb-2">{tier.name}</h3>
                <p className="text-sm text-gray-400 mb-6">{tier.description}</p>

                <div className="mb-8">
                  <span className="text-4xl font-extrabold text-white">{tier.price}</span>
                  {tier.period && (
                    <span className="text-gray-400 text-base ml-1">{tier.period}</span>
                  )}
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <CheckIcon />
                      <span className="text-sm text-gray-300">{f}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href={tier.highlighted ? '/pricing' : tier.name === 'Enterprise' ? '/pricing' : '/pricing'}
                  className={`w-full py-3 px-6 rounded-xl font-semibold text-sm text-center transition-all block ${
                    tier.highlighted
                      ? 'bg-[#C9A84C] text-[#0A1628] hover:bg-[#D4B65E] shadow-lg shadow-[#C9A84C]/20'
                      : tier.name === 'Enterprise'
                      ? 'bg-white/10 text-white border border-gray-600 hover:bg-white/20'
                      : 'bg-blue-600 text-white hover:bg-blue-500'
                  }`}
                >
                  {tier.name === 'Enterprise' ? 'Book a Demo' : 'Get Started'}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Banner ────────────────────────────────────── */}
      <section className="bg-[#0E1D35] border-y border-gray-800/50 py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to scale your advisory practice?
          </h2>
          <p className="text-gray-400 mb-8">
            Join 180+ advisors already managing $42M+ in funding through CapitalForge.
          </p>
          <a
            href="/pricing"
            className="inline-block bg-[#C9A84C] text-[#0A1628] px-8 py-3.5 rounded-xl text-base font-semibold hover:bg-[#D4B65E] transition-colors shadow-lg shadow-[#C9A84C]/20"
          >
            Start Free Trial
          </a>
        </div>
      </section>

      {/* ─── Footer ────────────────────────────────────────── */}
      <footer className="border-t border-gray-800/50 pt-16 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-[#C9A84C] flex items-center justify-center">
                  <span className="text-[#0A1628] font-black text-xs">CF</span>
                </div>
                <span className="text-lg font-bold text-white">CapitalForge</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                The institutional-grade operating system for corporate credit, funding stacks, and compliance.
              </p>
            </div>

            {/* Link columns */}
            {Object.entries(FOOTER_LINKS).map(([category, links]) => (
              <div key={category}>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">{category}</h4>
                <ul className="space-y-2">
                  {links.map((link) => (
                    <li key={link}>
                      <a href="#" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Legal disclaimer */}
          <div className="border-t border-gray-800/50 pt-8">
            <p className="text-xs text-gray-600 leading-relaxed max-w-3xl">
              CapitalForge is not a lender, broker, or financial advisor. CapitalForge provides software tools for business credit
              advisors to manage their practices. All funding decisions are made by the advisors and their clients. Credit products
              are subject to issuer approval. CapitalForge does not guarantee funding amounts, approval rates, or credit terms.
              Users are responsible for compliance with all applicable federal and state regulations.
            </p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-6">
              <p className="text-xs text-gray-600">
                &copy; {new Date().getFullYear()} CapitalForge. All rights reserved.
              </p>
              <div className="flex items-center gap-4 text-xs text-gray-600">
                <a href="#" className="hover:text-gray-400 transition-colors">Privacy Policy</a>
                <a href="#" className="hover:text-gray-400 transition-colors">Terms of Service</a>
                <a href="#" className="hover:text-gray-400 transition-colors">Cookie Policy</a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
