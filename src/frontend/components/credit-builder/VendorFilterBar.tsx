// ============================================================
// VendorFilterBar — Filter bar for vendor recommendations table
// Provides tier, bureau, and search filtering controls
// ============================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VendorFilterBarProps {
  tierFilter: string;
  onTierChange: (tier: string) => void;
  bureauFilter: string;
  onBureauChange: (bureau: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIER_OPTIONS = [
  { value: '', label: 'All Tiers' },
  { value: 'tier1', label: 'Tier 1 \u2014 Easy Start' },
  { value: 'tier2', label: 'Tier 2 \u2014 Growing Profile' },
  { value: 'tier3', label: 'Tier 3 \u2014 Established' },
] as const;

const BUREAU_OPTIONS = [
  { value: '', label: 'All Bureaus' },
  { value: 'dnb', label: 'D&B only' },
  { value: 'experian', label: 'Reports to Experian Biz' },
  { value: 'equifax', label: 'Reports to Equifax Biz' },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VendorFilterBar({
  tierFilter,
  onTierChange,
  bureauFilter,
  onBureauChange,
  searchQuery,
  onSearchChange,
}: VendorFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Tier dropdown */}
      <select
        value={tierFilter}
        onChange={(e) => onTierChange(e.target.value)}
        className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {TIER_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Bureau dropdown */}
      <select
        value={bureauFilter}
        onChange={(e) => onBureauChange(e.target.value)}
        className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {BUREAU_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Search input */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search vendors..."
        className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}
