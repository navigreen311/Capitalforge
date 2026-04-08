'use client';

// ============================================================
// /compliance/training — Compliance Training
// Training modules with completion status, progress bars,
// due dates, renewal indicators. Admin advisor grid.
// Start Module / Mark Complete actions.
// ============================================================

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrainingModule {
  id: string;
  title: string;
  description: string;
  durationMin: number;
  dueDate: string;
  renewalMonths: number;
  completed: boolean;
  completedAt: string | null;
  score: number | null;
}

interface AdvisorCert {
  name: string;
  modules: Record<string, boolean>;
}

type ViewMode = 'modules' | 'admin';

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const INITIAL_MODULES: TrainingModule[] = [
  { id: 'tm_001', title: 'TCPA Compliance', description: 'Telephone Consumer Protection Act requirements for outbound calling, texting, and consent management.', durationMin: 45, dueDate: '2026-05-01', renewalMonths: 12, completed: true, completedAt: '2026-02-15', score: 92 },
  { id: 'tm_002', title: 'UDAP Guidelines', description: 'Unfair, Deceptive, or Abusive Acts or Practices — identifying and avoiding UDAP violations in sales and marketing.', durationMin: 60, dueDate: '2026-05-15', renewalMonths: 12, completed: true, completedAt: '2026-01-20', score: 88 },
  { id: 'tm_003', title: 'State Disclosure Laws', description: 'Overview of state-by-state commercial finance disclosure requirements (CA, NY, TX, FL, VA, UT).', durationMin: 90, dueDate: '2026-06-01', renewalMonths: 6, completed: false, completedAt: null, score: null },
  { id: 'tm_004', title: 'Product-Reality Protocol', description: 'Training on accurately representing product features, avoiding guarantee language, and matching client expectations to reality.', durationMin: 30, dueDate: '2026-04-15', renewalMonths: 12, completed: false, completedAt: null, score: null },
  { id: 'tm_005', title: 'AML Basics', description: 'Anti-Money Laundering fundamentals — SAR filing, CDD/EDD, beneficial ownership verification, and red flag identification.', durationMin: 75, dueDate: '2026-07-01', renewalMonths: 12, completed: false, completedAt: null, score: null },
];

const ADVISORS: AdvisorCert[] = [
  { name: 'Sarah Chen', modules: { tm_001: true, tm_002: true, tm_003: true, tm_004: false, tm_005: false } },
  { name: 'Marcus Johnson', modules: { tm_001: true, tm_002: true, tm_003: false, tm_004: true, tm_005: false } },
  { name: 'Emily Rodriguez', modules: { tm_001: true, tm_002: false, tm_003: false, tm_004: false, tm_005: false } },
  { name: 'David Kim', modules: { tm_001: true, tm_002: true, tm_003: true, tm_004: true, tm_005: true } },
  { name: 'Lisa Thompson', modules: { tm_001: false, tm_002: false, tm_003: false, tm_004: false, tm_005: false } },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function isDueSoon(dateStr: string): boolean {
  const due = new Date(dateStr);
  const now = new Date();
  const diff = due.getTime() - now.getTime();
  return diff > 0 && diff < 14 * 24 * 60 * 60 * 1000; // within 14 days
}

function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date();
}

function needsRenewal(completedAt: string | null, renewalMonths: number): boolean {
  if (!completedAt) return false;
  const renewal = new Date(completedAt);
  renewal.setMonth(renewal.getMonth() + renewalMonths);
  return renewal < new Date();
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TrainingPage() {
  const [modules, setModules] = useState<TrainingModule[]>(INITIAL_MODULES);
  const [viewMode, setViewMode] = useState<ViewMode>('modules');
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const completedCount = modules.filter(m => m.completed).length;
  const totalCount = modules.length;
  const overallProgress = Math.round((completedCount / totalCount) * 100);

  const handleMarkComplete = (id: string) => {
    setModules(prev => prev.map(m =>
      m.id === id
        ? { ...m, completed: true, completedAt: new Date().toISOString().split('T')[0], score: 100 }
        : m
    ));
    const mod = modules.find(m => m.id === id);
    setToast(`"${mod?.title}" marked as complete.`);
    setTimeout(() => setToast(null), 3000);
  };

  const handleStartModule = (id: string) => {
    setActiveModuleId(id);
    setToast('Module started. Content would load in a real implementation.');
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Compliance Training</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {completedCount}/{totalCount} modules completed · {overallProgress}% overall progress
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('modules')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              viewMode === 'modules'
                ? 'bg-[#C9A84C] text-[#0A1628]'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            My Modules
          </button>
          <button
            onClick={() => setViewMode('admin')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              viewMode === 'admin'
                ? 'bg-[#C9A84C] text-[#0A1628]'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Admin View
          </button>
        </div>
      </div>

      {/* Overall Progress Bar */}
      <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 uppercase font-semibold">Overall Completion</span>
          <span className="text-sm font-bold text-[#C9A84C]">{overallProgress}%</span>
        </div>
        <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#C9A84C] rounded-full transition-all duration-500"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* ── Modules View ──────────────────────────────────────────── */}
      {viewMode === 'modules' && (
        <div className="space-y-4">
          {modules.map(mod => {
            const overdue = !mod.completed && isOverdue(mod.dueDate);
            const dueSoon = !mod.completed && isDueSoon(mod.dueDate);
            const renewal = mod.completed && needsRenewal(mod.completedAt, mod.renewalMonths);
            const progress = mod.completed ? 100 : activeModuleId === mod.id ? 15 : 0;

            return (
              <div
                key={mod.id}
                className={`rounded-xl border p-5 transition-colors ${
                  overdue
                    ? 'border-red-700 bg-red-950/30'
                    : renewal
                    ? 'border-orange-700 bg-orange-950/30'
                    : mod.completed
                    ? 'border-green-800/50 bg-gray-900'
                    : 'border-gray-800 bg-gray-900'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-100 text-sm">{mod.title}</h3>
                      {mod.completed && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-900 text-green-300 border border-green-700">
                          Complete
                        </span>
                      )}
                      {overdue && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-900 text-red-300 border border-red-700 animate-pulse">
                          Overdue
                        </span>
                      )}
                      {dueSoon && !overdue && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-900 text-yellow-300 border border-yellow-700">
                          Due Soon
                        </span>
                      )}
                      {renewal && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-900 text-orange-300 border border-orange-700">
                          Renewal Due
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mb-2">{mod.description}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{mod.durationMin} min</span>
                      <span>Due: {formatDate(mod.dueDate)}</span>
                      <span>Renews every {mod.renewalMonths} months</span>
                      {mod.completedAt && <span>Completed: {formatDate(mod.completedAt)}</span>}
                      {mod.score !== null && <span>Score: {mod.score}%</span>}
                    </div>

                    {/* Progress bar */}
                    <div className="mt-3 w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          mod.completed ? 'bg-green-500' : 'bg-[#C9A84C]'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {!mod.completed && (
                      <>
                        <button
                          onClick={() => handleStartModule(mod.id)}
                          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
                        >
                          Start Module
                        </button>
                        <button
                          onClick={() => handleMarkComplete(mod.id)}
                          className="px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-xs font-semibold transition-colors"
                        >
                          Mark Complete
                        </button>
                      </>
                    )}
                    {mod.completed && renewal && (
                      <button
                        onClick={() => handleStartModule(mod.id)}
                        className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold transition-colors"
                      >
                        Retake
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Admin View ────────────────────────────────────────────── */}
      {viewMode === 'admin' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="py-3 px-3 text-xs text-gray-400 uppercase font-semibold">Advisor</th>
                {modules.map(m => (
                  <th key={m.id} className="py-3 px-3 text-xs text-gray-400 uppercase font-semibold text-center whitespace-nowrap">
                    {m.title}
                  </th>
                ))}
                <th className="py-3 px-3 text-xs text-gray-400 uppercase font-semibold text-center">Progress</th>
              </tr>
            </thead>
            <tbody>
              {ADVISORS.map((advisor, i) => {
                const completed = Object.values(advisor.modules).filter(Boolean).length;
                const total = Object.keys(advisor.modules).length;
                const pct = Math.round((completed / total) * 100);

                return (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                    <td className="py-3 px-3 text-gray-200 font-medium">{advisor.name}</td>
                    {modules.map(m => {
                      const done = advisor.modules[m.id] ?? false;
                      return (
                        <td key={m.id} className="py-3 px-3 text-center">
                          {done ? (
                            <span className="text-green-400 font-bold text-xs">PASS</span>
                          ) : (
                            <span className="text-red-400 font-bold text-xs">---</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-[#C9A84C]' : 'bg-red-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className={`text-xs font-semibold ${pct === 100 ? 'text-green-400' : pct >= 50 ? 'text-[#C9A84C]' : 'text-red-400'}`}>
                          {pct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-[#0A1628] border border-[#C9A84C]/30 text-gray-100 text-sm rounded-xl shadow-2xl px-5 py-3 flex items-center gap-3">
          <span className="flex-1">{toast}</span>
          <button onClick={() => setToast(null)} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
        </div>
      )}
    </div>
  );
}
