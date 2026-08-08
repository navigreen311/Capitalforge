


const STATUSES: ComplaintStatus[] = ['open', 'investigating', 'escalated', 'resolved', 'closed'];

/**
 * Whether the complaint is finished with.
 *
 * The open count, the SLA cell and the Move-to menu all asked
 * `status !== 'Resolved'` against a column holding 'resolved', so a resolved
 * complaint counted as open, showed an SLA countdown and offered a status
 * change. Three symptoms, one comparison — they resolve together or not at
 * all, which is why this is a function and not three inline checks.
 */
function isClosedOut(status: ComplaintStatus): boolean {
  return status === 'resolved' || status === 'closed';
}

/** Presentation only. The value written to the register is the key. */
const STATUS_LABEL: Record<ComplaintStatus, string> = {
  open:          'Open',
  investigating: 'Investigating',
  escalated:     'Escalated',
  resolved:      'Resolved',
  closed:        'Closed',
};

/**
 * Mirrors VALID_TRANSITIONS in complaint.service.ts. Offering a move the
 * server will reject is a promise the register cannot keep, so the menu shows
 * only what the state machine allows from here.
 */
const ALLOWED_NEXT: Record<ComplaintStatus, ComplaintStatus[]> = {
  open:          ['investigating', 'escalated', 'closed'],
  investigating: ['resolved', 'escalated', 'open'],
  escalated:     ['investigating', 'resolved'],
  resolved:      ['closed', 'investigating'],
  closed:        [],
};
const COMPLAINT_TYPES: ComplaintType[] = ['Billing', 'Disclosure', 'Fair Lending', 'Product Mismatch', 'Advisor Conduct', 'Data Privacy', 'Other'];
const CHANNELS: Channel[] = ['Phone', 'Email', 'Web Portal', 'In-Person', 'Mail', 'Social Media'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TODAY = new Date();

function daysRemaining(slaDeadline: string): number {
  return Math.ceil((new Date(slaDeadline).getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24));
}

function slaColor(days: number, status: ComplaintStatus): string {
  if (isClosedOut(status)) return 'text-green-400';
  if (days < 0) return 'text-red-400';
  if (days <= 5) return 'text-amber-400';
  return 'text-green-400';
}

function slaBg(days: number, status: ComplaintStatus): string {
  if (isClosedOut(status)) return 'bg-green-900/20';
  if (days < 0) return 'bg-red-900/20';
  if (days <= 5) return 'bg-amber-900/20';
  return 'bg-green-900/20';
}

function statusBadge(s: ComplaintStatus): string {
  switch (s) {
    case 'open':          return 'bg-blue-900/50 text-blue-300 border border-blue-700';
    case 'investigating': return 'bg-yellow-900/50 text-yellow-300 border border-yellow-700';
    case 'escalated':     return 'bg-red-900/50 text-red-300 border border-red-700';
    case 'resolved':      return 'bg-green-900/50 text-green-300 border border-green-700';
    case 'closed':        return 'bg-gray-800 text-gray-400 border border-gray-700';
  }
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ComplaintsPage() {
  // Empty, not PLACEHOLDER_COMPLAINTS.
  //
  // The register fell back to invented complaints whenever the GET failed. A
  // complaints log is a regulatory record; showing fabricated entries when the
  // real ones cannot be read misstates what the business has received, and an
  // empty log and an unreachable server are not the same fact.
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | 'All'>('All');
  const [showIntakeForm, setShowIntakeForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // A failed write needs its own banner. loadError only renders inside the
  // empty-table cell, so with rows on screen a rejected status change would
  // have had nowhere to appear.
  const [writeError, setWriteError] = useState<string | null>(null);

  // Intake form
  const [form, setForm] = useState({
    businessName: '',
    complaintType: 'Billing' as ComplaintType,
    channel: 'Email' as Channel,
    description: '',
  });

  // Fetch from API
  useEffect(() => {
    void (async () => {
      try {
        const data = await loadJson<Complaint[]>('/api/compliance/complaints');
        setComplaints(data ?? []);
        setLoadError(null);
      } catch (e) {
        const info = toLoadError(e);
        setComplaints([]);
        setLoadError(
          info.type === 'auth_required'
            ? 'Your session has ended. Sign in again to see the complaints register.'
            : info.type === 'network_error'
              ? 'Could not reach the server, so no complaints are shown.'
              : `The complaints register could not be loaded. ${info.message}`,
        );
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const base = statusFilter === 'All' ? complaints : complaints.filter((c) => c.status === statusFilter);
    return [...base].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [complaints, statusFilter]);

  const handleSubmitComplaint = useCallback(() => {
    if (!form.businessName.trim() || !form.description.trim()) return;
    setShowIntakeForm(false);

    void (async () => {
      try {
        await loadJson('/api/compliance/complaints', {
          method: 'POST',
          body: {
            complaintType: form.complaintType,
            channel: form.channel,
            description: form.description,
          },
        });
        // Re-read rather than trusting the optimistic row: the server assigns
        // the id, the status and the timestamps, and this page used to invent
        // all three — a CMP-00N id that no row ever had, and a status of
        // 'Received' that nothing else understood.
        const rows = await loadJson<Complaint[]>('/api/compliance/complaints');
        setComplaints(rows);
        setWriteError(null);
        setForm({ businessName: '', complaintType: 'Billing', channel: 'Email', description: '' });
        setToast('Complaint logged');
      } catch (e) {
        setWriteError(`The complaint was not logged. ${toLoadError(e).message}`);
      }
    })();
  }, [form]);

  /**
   * Move a complaint to another status.
   *
   * This used to set state, raise a success toast, fire the request and
   * swallow whatever came back:
   *
   *   setToast(`${id} status updated to ${newStatus}`);
   *   void loadJson(...).catch(() => {});
   *
   * The toast fired before the server answered and regardless of what it
   * said, so a rejected write — a forbidden transition, a validation error, a
   * dropped connection — was reported as success and reverted on the next
   * reload. On a complaints register that is silent loss of a regulatory
   * record.
   *
   * Now: optimistic update for the click to feel immediate, awaited response,
   * toast only once the server has confirmed, and the previous status put back
   * with the error surfaced if it has not.
   *
   * The request goes to PUT /api/complaints/:id, which runs through
   * ComplaintService — transition validated against VALID_TRANSITIONS, events
   * emitted. The PATCH this used to call went straight to prisma and did
   * neither.
   */
  const handleStatusChange = useCallback(async (id: string, newStatus: ComplaintStatus): Promise<void> => {
    const previous = complaints.find((c) => c.id === id);
    if (!previous) return;

    setComplaints((prev) =>
      prev.map((c) => c.id === id ? { ...c, status: newStatus, updatedAt: new Date().toISOString() } : c)
    );

    try {
      await loadJson(`/api/complaints/${id}`, {
        method: 'PUT',
        body: { status: newStatus },
      });
      setWriteError(null);
      setToast(`${id} moved to ${STATUS_LABEL[newStatus]}`);
    } catch (e) {
      setComplaints((prev) =>
        prev.map((c) => c.id === id ? { ...c, status: previous.status, updatedAt: previous.updatedAt } : c)
      );
      setWriteError(`${id} was not moved to ${STATUS_LABEL[newStatus]}. ${toLoadError(e).message}`);
    }
  }, [complaints]);

  // Summary
  const open = complaints.filter((c) => !isClosedOut(c.status)).length;
  const breached = complaints.filter((c) => !isClosedOut(c.status) && daysRemaining(c.slaDeadline) < 0).length;

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Complaints</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {complaints.length} total &middot; {open} open
            {breached > 0 && <span className="ml-2 text-red-400 font-semibold">{breached} SLA breached</span>}
          </p>
        </div>
        <button
          onClick={() => setShowIntakeForm(true)}
          className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8973f] text-[#0A1628] text-sm font-semibold transition-colors"
        >
          New Complaint
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-800 overflow-x-auto">
        {(['All', ...STATUSES] as const).map((s) => {
          const count = s === 'All' ? complaints.length : complaints.filter((c) => c.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px whitespace-nowrap ${
                statusFilter === s
                  ? 'border-[#C9A84C] text-[#C9A84C]'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {s} <span className="text-xs text-gray-500 ml-1">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Complaint Log Table */}
      <div className="rounded-xl border border-gray-800 bg-[#0f1d32] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">ID</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Business</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Type</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Channel</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Status</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">SLA (30d)</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Created</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    {loadError ?? (complaints.length === 0
                      ? 'No complaints on record for this tenant.'
                      : 'No complaints match the filter.')}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => {
                  const days = daysRemaining(c.slaDeadline);
                  return (
                    <tr key={c.id} className="border-b border-gray-800/50 hover:bg-[#0A1628]/50 transition-colors">
                      <td className="px-4 py-3 text-gray-300 font-mono text-xs">{c.id}</td>
                      <td className="px-4 py-3">
                        <p className="text-gray-100 font-medium text-sm">{c.businessName}</p>
                        <p className="text-xs text-gray-500 truncate max-w-[200px]">{c.description}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
                          {c.complaintType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{c.channel}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusBadge(c.status)}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`rounded-lg px-2 py-1 inline-block ${slaBg(days, c.status)}`}>
                          <span className={`text-xs font-bold ${slaColor(days, c.status)}`}>
                            {isClosedOut(c.status) ? STATUS_LABEL[c.status] : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(c.createdAt)}</td>
                      <td className="px-4 py-3">
                        {ALLOWED_NEXT[c.status].length > 0 && (
                          <select aria-label="Change complaint status"
                            value=""
                            onChange={(e) => {
                              if (e.target.value) void handleStatusChange(c.id, e.target.value as ComplaintStatus);
                            }}
                            className="rounded-lg bg-[#0A1628] border border-gray-700 text-gray-300 text-xs px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#C9A84C]/50"
                          >
                            <option value="">Move to...</option>
                            {STATUSES.filter((s) => s !== c.status).map((s) => (
                              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Status Workflow Legend */}
      <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
        <span>Workflow:</span>
        {STATUSES.map((s, i) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`px-1.5 py-0.5 rounded ${statusBadge(s)} text-[10px]`}>{s}</span>
            {i < STATUSES.length - 1 && <span className="text-gray-700">&rarr;</span>}
          </span>
        ))}
      </div>

      {/* Intake Form Modal */}
      {showIntakeForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f1d32] border border-gray-700 rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">New Complaint</h3>
              <button onClick={() => setShowIntakeForm(false)} className="text-gray-400 hover:text-white text-xl">&times;</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">Business</label>
                <input aria-label="Business"
                  type="text"
                  value={form.businessName}
                  onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
                  className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                  placeholder="Business name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">Complaint Type</label>
                  <select aria-label="Complaint Type"
                    value={form.complaintType}
                    onChange={(e) => setForm((f) => ({ ...f, complaintType: e.target.value as ComplaintType }))}
                    className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                  >
                    {COMPLAINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-semibold uppercase block mb-1" htmlFor="compliance-complaints-channel">Channel</label>
                  <select id="compliance-complaints-channel"
                    value={form.channel}
                    onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as Channel }))}
                    className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                  >
                    {CHANNELS.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase block mb-1" htmlFor="compliance-complaints-description">Description</label>
                <textarea id="compliance-complaints-description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={4}
                  className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 resize-none"
                  placeholder="Describe the complaint..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-5">
              <button onClick={() => setShowIntakeForm(false)} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-semibold text-gray-300 transition-colors">
                Cancel
              </button>
              <button onClick={handleSubmitComplaint} className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8973f] text-sm font-semibold text-[#0A1628] transition-colors">
                Submit Complaint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {writeError !== null && (
        <div
          role="alert"
          data-testid="complaint-write-error"
          className="mb-4 rounded-lg border border-red-700 bg-red-900/40 px-4 py-3 text-sm text-red-200"
        >
          {writeError}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-[#0A1628] border border-[#C9A84C]/30 text-gray-100 text-sm rounded-xl shadow-2xl px-5 py-3 flex items-center gap-3">
          <span className="flex-1">{toast}</span>
          <button onClick={() => setToast(null)} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
        </div>
      )}
    </div>
  );
}
