// ============================================================
// /portal/[clientId] — Client Portal dashboard
// Standalone page (no advisor sidebar). Shows funding status,
// APR countdowns, upcoming payments, and documents to sign.
// Dark theme: navy #0A1628, gold #C9A84C
// ============================================================

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────

interface FundingStatus {
  totalFunded:       number;
  activeCards:       number;
  nextPaymentDue:    string;
  nextPaymentAmount: number;
  utilizationPct:    number;
}

interface AprCountdown {
  cardName:       string;
  issuer:         string;
  introAprExpiry: string;
  daysRemaining:  number;
  currentApr:     string;
  regularApr:     string;
  creditLimit:    number;
  balance:        number;
  severity:       'ok' | 'warning' | 'critical';
}

interface Payment {
  id:       string;
  cardName: string;
  dueDate:  string;
  amount:   number;
  status:   string;
}

interface UnsignedDoc {
  id:        string;
  title:     string;
  type:      string;
  createdAt: string;
  urgent:    boolean;
}

interface PortalSummary {
  clientId:          string;
  businessName:      string;
  contactEmail:      string;
  fundingStatus:     FundingStatus;
  aprCountdowns:     AprCountdown[];
  upcomingPayments:  Payment[];
  unsignedDocuments: UnsignedDoc[];
}

// ── Helpers ──────────────────────────────────────────────────

function usd(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function severityColor(s: AprCountdown['severity']): string {
  if (s === 'critical') return 'border-red-500/60 bg-red-900/20';
  if (s === 'warning')  return 'border-amber-500/60 bg-amber-900/20';
  return 'border-emerald-500/40 bg-emerald-900/15';
}

function severityBadge(s: AprCountdown['severity']): { text: string; cls: string } {
  if (s === 'critical') return { text: 'URGENT', cls: 'bg-red-600 text-white' };
  if (s === 'warning')  return { text: 'SOON', cls: 'bg-amber-600 text-white' };
  return { text: 'OK', cls: 'bg-emerald-700 text-emerald-100' };
}

// ── Mock data fallback (used when API is unreachable) ────────

const FALLBACK: PortalSummary = {
  clientId:     'client-apex-001',
  businessName: 'Apex Ventures LLC',
  contactEmail: 'ops@apexventures.com',
  fundingStatus: {
    totalFunded:      185000,
    activeCards:       4,
    nextPaymentDue:    '2026-04-12',
    nextPaymentAmount: 2750,
    utilizationPct:    42,
  },
  aprCountdowns: [
    { cardName: 'Chase Ink Business Unlimited', issuer: 'Chase',            introAprExpiry: '2026-05-15', daysRemaining: 38, currentApr: '0.00%', regularApr: '18.49%', creditLimit: 50000, balance: 21000, severity: 'warning' },
    { cardName: 'Amex Blue Business Plus',      issuer: 'American Express', introAprExpiry: '2026-09-01', daysRemaining: 147, currentApr: '0.00%', regularApr: '17.99%', creditLimit: 40000, balance: 15500, severity: 'ok' },
    { cardName: 'Capital One Spark Cash Plus',  issuer: 'Capital One',      introAprExpiry: '2026-04-20', daysRemaining: 13, currentApr: '0.00%', regularApr: '22.49%', creditLimit: 55000, balance: 32000, severity: 'critical' },
    { cardName: 'US Bank Business Triple Cash', issuer: 'US Bank',          introAprExpiry: '2026-12-10', daysRemaining: 247, currentApr: '0.00%', regularApr: '19.99%', creditLimit: 40000, balance: 8500, severity: 'ok' },
  ],
  upcomingPayments: [
    { id: 'pmt-1', cardName: 'Capital One Spark Cash Plus',  dueDate: '2026-04-08', amount: 850,  status: 'due' },
    { id: 'pmt-2', cardName: 'Chase Ink Business Unlimited',  dueDate: '2026-04-10', amount: 1200, status: 'due' },
    { id: 'pmt-3', cardName: 'Amex Blue Business Plus',       dueDate: '2026-04-12', amount: 700,  status: 'upcoming' },
  ],
  unsignedDocuments: [
    { id: 'doc-1', title: 'Annual Fee Disclosure — Chase Ink',  type: 'disclosure',     createdAt: '2026-04-01', urgent: true },
    { id: 'doc-2', title: 'Balance Transfer Consent',           type: 'consent',        createdAt: '2026-04-03', urgent: false },
    { id: 'doc-3', title: 'Repayment Acknowledgment — Q2 2026', type: 'acknowledgment', createdAt: '2026-04-05', urgent: true },
    { id: 'doc-4', title: 'Auto-Pay Authorization — US Bank',   type: 'consent',        createdAt: '2026-04-06', urgent: false },
  ],
};

// ── Page ─────────────────────────────────────────────────────

export default function ClientPortalPage() {
  const params = useParams<{ clientId: string }>();
  const clientId = params.clientId;

  const [data, setData]       = useState<PortalSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/portal/${clientId}/summary`);
        if (!res.ok) throw new Error('API unavailable');
        const json = await res.json();
        if (!cancelled) setData(json.data);
      } catch {
        // Fallback to embedded mock data
        if (!cancelled) setData(FALLBACK);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [clientId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading your portal...
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-400">Client not found.</p>
      </div>
    );
  }

  const { businessName, fundingStatus, aprCountdowns, upcomingPayments, unsignedDocuments } = data;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-[#C9A84C]/10 border border-[#C9A84C]/30 flex items-center justify-center">
            <span className="text-sm font-black text-[#C9A84C]">CF</span>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">CapitalForge Client Portal</p>
            <h1 className="text-2xl font-bold text-white">{businessName}</h1>
          </div>
        </div>
      </header>

      {/* ── Section 1: Funding Status ──────────────────────── */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-1.5 h-5 bg-[#C9A84C] rounded-full inline-block" />
          Funding Status
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Funded" value={usd(fundingStatus.totalFunded)} />
          <StatCard label="Active Cards" value={String(fundingStatus.activeCards)} />
          <StatCard label="Next Payment Due" value={fmtDate(fundingStatus.nextPaymentDue)} sub={usd(fundingStatus.nextPaymentAmount)} />
          <StatCard label="Utilization" value={`${fundingStatus.utilizationPct}%`} sub="of total credit" />
        </div>
      </section>

      {/* ── Section 2: APR Countdown ───────────────────────── */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-1.5 h-5 bg-[#C9A84C] rounded-full inline-block" />
          APR Countdown
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {aprCountdowns
            .sort((a, b) => a.daysRemaining - b.daysRemaining)
            .map((card) => {
              const badge = severityBadge(card.severity);
              return (
                <div
                  key={card.cardName}
                  className={`rounded-xl border p-5 ${severityColor(card.severity)}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{card.cardName}</p>
                      <p className="text-xs text-gray-400">{card.issuer}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
                      {badge.text}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-2xl font-bold text-white">{card.daysRemaining}</p>
                      <p className="text-[10px] text-gray-400 uppercase">Days Left</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-300">{fmtDate(card.introAprExpiry)}</p>
                      <p className="text-[10px] text-gray-400 uppercase">Expiry</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-300">{card.regularApr}</p>
                      <p className="text-[10px] text-gray-400 uppercase">Regular APR</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/10 flex justify-between text-xs text-gray-400">
                    <span>Balance: {usd(card.balance)}</span>
                    <span>Limit: {usd(card.creditLimit)}</span>
                  </div>
                </div>
              );
            })}
        </div>
      </section>

      {/* ── Section 3: Upcoming Payments ───────────────────── */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-1.5 h-5 bg-[#C9A84C] rounded-full inline-block" />
          Upcoming Payments <span className="text-xs text-gray-500 font-normal ml-1">(next 7 days)</span>
        </h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                <th className="text-left px-5 py-3 font-medium">Card</th>
                <th className="text-left px-5 py-3 font-medium">Due Date</th>
                <th className="text-right px-5 py-3 font-medium">Amount</th>
                <th className="text-right px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {upcomingPayments.map((pmt) => (
                <tr key={pmt.id} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-3 text-gray-100 font-medium">{pmt.cardName}</td>
                  <td className="px-5 py-3 text-gray-400">{fmtDate(pmt.dueDate)}</td>
                  <td className="px-5 py-3 text-right text-gray-100 font-medium">{usd(pmt.amount)}</td>
                  <td className="px-5 py-3 text-right">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        pmt.status === 'due'
                          ? 'bg-amber-600/20 text-amber-400 border border-amber-600/30'
                          : 'bg-gray-700/50 text-gray-400 border border-gray-700'
                      }`}
                    >
                      {pmt.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
              {upcomingPayments.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-gray-500">
                    No payments due in the next 7 days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Section 4: Documents to Sign ───────────────────── */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-1.5 h-5 bg-[#C9A84C] rounded-full inline-block" />
          Documents to Sign
        </h2>
        <div className="space-y-3">
          {unsignedDocuments.map((doc) => (
            <div
              key={doc.id}
              className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center justify-between hover:border-gray-700 transition-colors"
            >
              <div className="flex items-center gap-4">
                {/* Icon */}
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  doc.urgent ? 'bg-red-900/30 border border-red-700/40' : 'bg-gray-800 border border-gray-700'
                }`}>
                  <svg className={`w-4 h-4 ${doc.urgent ? 'text-red-400' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{doc.title}</p>
                  <p className="text-xs text-gray-500">
                    {doc.type.charAt(0).toUpperCase() + doc.type.slice(1)} &middot; {fmtDate(doc.createdAt)}
                    {doc.urgent && <span className="ml-2 text-red-400 font-semibold">Action Required</span>}
                  </p>
                </div>
              </div>
              <button
                className="
                  px-4 py-2 rounded-lg text-xs font-semibold
                  bg-[#C9A84C]/10 border border-[#C9A84C]/30
                  text-[#C9A84C] hover:bg-[#C9A84C]/20
                  transition-colors whitespace-nowrap
                "
                onClick={() => alert(`Sign Now placeholder for document: ${doc.title}`)}
              >
                Sign Now
              </button>
            </div>
          ))}
          {unsignedDocuments.length === 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-8 text-center text-gray-500">
              All documents are signed. Nothing to action.
            </div>
          )}
        </div>
      </section>

      {/* ── Footer / Back Link ─────────────────────────────── */}
      <footer className="pt-6 border-t border-gray-800 flex items-center justify-between">
        <Link
          href="/dashboard"
          className="text-sm text-[#C9A84C] hover:text-[#e0bc5e] hover:underline transition-colors"
        >
          &larr; Back to Advisor View
        </Link>
        <p className="text-xs text-gray-700">
          &copy; {new Date().getFullYear()} CapitalForge
        </p>
      </footer>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
