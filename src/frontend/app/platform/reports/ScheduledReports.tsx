'use client';

// ============================================================
// ScheduledReports — Collapsible section for managing report
// delivery schedules with add/edit modal, active toggle, delete.
// ============================================================

import { useState, useCallback } from 'react';
import { useToast } from '@/components/global/ToastProvider';

// ── Types ────────────────────────────────────────────────────

type ScheduleReportType =
  | 'monthly-summary'
  | 'client-funding'
  | 'compliance-audit'
  | 'revenue'
  | 'pipeline-activity'
  | 'advisor-performance';

type Frequency = 'weekly' | 'monthly' | 'quarterly';
type DeliveryDay = '1st-of-month' | 'last-business-day' | 'every-monday';
type ExportFormat = 'pdf' | 'csv' | 'both';

interface ScheduleEntry {
  id: string;
  reportType: ScheduleReportType;
  frequency: Frequency;
  deliveryDay: DeliveryDay;
  recipients: string;
  format: ExportFormat;
  active: boolean;
}

// ── Constants ────────────────────────────────────────────────

const REPORT_TYPE_OPTIONS: { value: ScheduleReportType; label: string }[] = [
  { value: 'monthly-summary', label: 'Monthly Summary' },
  { value: 'client-funding', label: 'Client Funding' },
  { value: 'compliance-audit', label: 'Compliance Audit' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'pipeline-activity', label: 'Pipeline Activity' },
  { value: 'advisor-performance', label: 'Advisor Performance' },
];

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
];

const DELIVERY_DAY_OPTIONS: { value: DeliveryDay; label: string }[] = [
  { value: '1st-of-month', label: '1st of month' },
  { value: 'last-business-day', label: 'Last business day' },
  { value: 'every-monday', label: 'Every Monday' },
];

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: 'pdf', label: 'PDF' },
  { value: 'csv', label: 'CSV' },
  { value: 'both', label: 'Both' },
];

const INITIAL_SCHEDULES: ScheduleEntry[] = [
  {
    id: 'sched-1',
    reportType: 'monthly-summary',
    frequency: 'weekly',
    deliveryDay: 'every-monday',
    recipients: 'admin@capitalforge.io, ops@capitalforge.io',
    format: 'pdf',
    active: true,
  },
  {
    id: 'sched-2',
    reportType: 'revenue',
    frequency: 'monthly',
    deliveryDay: '1st-of-month',
    recipients: 'finance@capitalforge.io',
    format: 'both',
    active: true,
  },
  {
    id: 'sched-3',
    reportType: 'compliance-audit',
    frequency: 'quarterly',
    deliveryDay: 'last-business-day',
    recipients: 'compliance@capitalforge.io, legal@capitalforge.io',
    format: 'pdf',
    active: false,
  },
];

// ── Helpers ──────────────────────────────────────────────────

function labelFor<T extends string>(options: { value: T; label: string }[], v: T): string {
  return options.find((o) => o.value === v)?.label ?? v;
}

let scheduleIdCounter = 10;

// ── Component ───────────────────────────────────────────────

export default function ScheduledReports() {
  const toast = useToast();
  const [expanded, setExpanded] = useState(true);
  const [schedules, setSchedules] = useState<ScheduleEntry[]>(INITIAL_SCHEDULES);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form state
  const [formType, setFormType] = useState<ScheduleReportType>('monthly-summary');
  const [formFrequency, setFormFrequency] = useState<Frequency>('weekly');
  const [formDeliveryDay, setFormDeliveryDay] = useState<DeliveryDay>('1st-of-month');
  const [formRecipients, setFormRecipients] = useState('');
  const [formFormat, setFormFormat] = useState<ExportFormat>('pdf');

  const resetForm = useCallback(() => {
    setFormType('monthly-summary');
    setFormFrequency('weekly');
    setFormDeliveryDay('1st-of-month');
    setFormRecipients('');
    setFormFormat('pdf');
  }, []);

  const handleAddSchedule = useCallback(() => {
    if (!formRecipients.trim()) {
      toast.warning('Please enter at least one recipient email.');
      return;
    }
    const entry: ScheduleEntry = {
      id: `sched-${++scheduleIdCounter}`,
      reportType: formType,
      frequency: formFrequency,
      deliveryDay: formDeliveryDay,
      recipients: formRecipients.trim(),
      format: formFormat,
      active: true,
    };
    setSchedules((prev) => [...prev, entry]);
    setModalOpen(false);
    resetForm();
    toast.success('Schedule created successfully.');
  }, [formType, formFrequency, formDeliveryDay, formRecipients, formFormat, resetForm, toast]);

  const handleToggleActive = useCallback(
    (id: string) => {
      setSchedules((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          const next = { ...s, active: !s.active };
          toast.info(`Schedule ${next.active ? 'enabled' : 'disabled'}`);
          return next;
        }),
      );
    },
    [toast],
  );

  const handleDelete = useCallback(
    (id: string) => {
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      setDeleteConfirmId(null);
      toast.success('Schedule deleted.');
    },
    [toast],
  );

  // ── Select component helper ─────────────────────────────────

  function SelectField<T extends string>({
    label,
    value,
    onChange,
    options,
  }: {
    label: string;
    value: T;
    onChange: (v: T) => void;
    options: { value: T; label: string }[];
  }) {
    return (
      <div>
        <label className="block text-xs text-gray-400 font-medium mb-1.5 uppercase tracking-wide">
          {label}
        </label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className="w-full bg-[#111c33] border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#C9A84C] appearance-none"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <>
      {/* Collapsible Section */}
      <div className="bg-[#0f1b2e] border border-gray-700/50 rounded-xl mb-8 print:hidden">
        {/* Section Header */}
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="w-full flex items-center justify-between px-6 py-4 text-left"
        >
          <div className="flex items-center gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-[#C9A84C]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-semibold text-white">Scheduled Reports</span>
            <span className="text-xs text-gray-500 ml-1">({schedules.length})</span>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Collapsible Body */}
        {expanded && (
          <div className="px-6 pb-6 border-t border-gray-700/30">
            {/* + Add Schedule button */}
            <div className="flex justify-end mt-4 mb-4">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setModalOpen(true);
                }}
                className="px-4 py-2 text-sm font-semibold bg-[#C9A84C] text-[#0A1628] rounded-lg hover:bg-[#b8993f] transition"
              >
                + Add Schedule
              </button>
            </div>

            {/* Schedule Table */}
            {schedules.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">No scheduled reports yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-700/30">
                      <th className="text-left py-2 pr-4 font-medium">Report Type</th>
                      <th className="text-left py-2 pr-4 font-medium">Frequency</th>
                      <th className="text-left py-2 pr-4 font-medium">Delivery</th>
                      <th className="text-left py-2 pr-4 font-medium">Recipients</th>
                      <th className="text-left py-2 pr-4 font-medium">Format</th>
                      <th className="text-center py-2 pr-4 font-medium">Active</th>
                      <th className="text-right py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((s) => (
                      <tr key={s.id} className="border-b border-gray-700/20 last:border-0">
                        <td className="py-3 pr-4 text-gray-200 font-medium">
                          {labelFor(REPORT_TYPE_OPTIONS, s.reportType)}
                        </td>
                        <td className="py-3 pr-4 text-gray-400">
                          {labelFor(FREQUENCY_OPTIONS, s.frequency)}
                        </td>
                        <td className="py-3 pr-4 text-gray-400">
                          {labelFor(DELIVERY_DAY_OPTIONS, s.deliveryDay)}
                        </td>
                        <td className="py-3 pr-4 text-gray-400 max-w-[200px] truncate" title={s.recipients}>
                          {s.recipients}
                        </td>
                        <td className="py-3 pr-4 text-gray-400 uppercase">
                          {labelFor(FORMAT_OPTIONS, s.format)}
                        </td>
                        <td className="py-3 pr-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(s.id)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              s.active ? 'bg-emerald-500' : 'bg-gray-600'
                            }`}
                            aria-label={s.active ? 'Disable schedule' : 'Enable schedule'}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                                s.active ? 'translate-x-[18px]' : 'translate-x-[3px]'
                              }`}
                            />
                          </button>
                        </td>
                        <td className="py-3 text-right">
                          {deleteConfirmId === s.id ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="text-xs text-gray-400">Delete?</span>
                              <button
                                type="button"
                                onClick={() => handleDelete(s.id)}
                                className="text-xs font-semibold text-red-400 hover:text-red-300 transition"
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(null)}
                                className="text-xs font-semibold text-gray-400 hover:text-gray-300 transition"
                              >
                                No
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(s.id)}
                              className="text-gray-500 hover:text-red-400 transition"
                              aria-label="Delete schedule"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Add Schedule Modal ─────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />

          {/* Modal Card */}
          <div className="relative bg-[#0f1b2e] border border-gray-700/50 rounded-xl w-full max-w-lg mx-4 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">Add Report Schedule</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-white transition"
                aria-label="Close modal"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <SelectField
                label="Report Type"
                value={formType}
                onChange={setFormType}
                options={REPORT_TYPE_OPTIONS}
              />
              <SelectField
                label="Frequency"
                value={formFrequency}
                onChange={setFormFrequency}
                options={FREQUENCY_OPTIONS}
              />
              <SelectField
                label="Delivery Day"
                value={formDeliveryDay}
                onChange={setFormDeliveryDay}
                options={DELIVERY_DAY_OPTIONS}
              />

              {/* Recipients */}
              <div>
                <label className="block text-xs text-gray-400 font-medium mb-1.5 uppercase tracking-wide">
                  Recipients
                </label>
                <input
                  type="text"
                  value={formRecipients}
                  onChange={(e) => setFormRecipients(e.target.value)}
                  placeholder="email1@example.com, email2@example.com"
                  className="w-full bg-[#111c33] border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
                />
                <p className="text-xs text-gray-600 mt-1">Comma-separated email addresses</p>
              </div>

              <SelectField
                label="Format"
                value={formFormat}
                onChange={setFormFormat}
                options={FORMAT_OPTIONS}
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-700/30">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-gray-400 border border-gray-600 rounded-lg hover:bg-[#111c33] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddSchedule}
                className="px-4 py-2 text-sm font-semibold bg-[#C9A84C] text-[#0A1628] rounded-lg hover:bg-[#b8993f] transition"
              >
                Create Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
