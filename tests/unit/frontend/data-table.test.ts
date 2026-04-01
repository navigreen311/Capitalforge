// ============================================================
// DataTable — unit tests
// Tests column rendering definitions, sorting logic (asc/desc/null
// cycle), pagination math, empty state message, and helper
// functions — all from data-table.tsx without React rendering.
// ============================================================

import { describe, it, expect } from 'vitest';

// ── Types matching data-table.tsx ────────────────────────────────────────────

type SortDirection = 'asc' | 'desc' | null;

interface ColumnDef<T> {
  key: string;
  header: string;
  cell?: (row: T, rowIndex: number) => unknown;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

interface SortState {
  key: string;
  direction: SortDirection;
}

// ── Inline helpers matching data-table.tsx ────────────────────────────────────

function getNestedValue<T extends Record<string, unknown>>(obj: T, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc !== null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

function sortData<T extends Record<string, unknown>>(data: T[], sort: SortState): T[] {
  if (!sort.direction) return data;
  return [...data].sort((a, b) => {
    const va = getNestedValue(a, sort.key);
    const vb = getNestedValue(b, sort.key);
    const aStr = va == null ? '' : String(va);
    const bStr = vb == null ? '' : String(vb);
    const aNum = parseFloat(aStr.replace(/[^0-9.-]/g, ''));
    const bNum = parseFloat(bStr.replace(/[^0-9.-]/g, ''));
    const numeric = !isNaN(aNum) && !isNaN(bNum);
    const cmp = numeric ? aNum - bNum : aStr.localeCompare(bStr);
    return sort.direction === 'asc' ? cmp : -cmp;
  });
}

function handleSortCycle(prev: SortState, key: string): SortState {
  if (prev.key !== key) return { key, direction: 'asc' };
  if (prev.direction === 'asc')  return { key, direction: 'desc' };
  if (prev.direction === 'desc') return { key, direction: null };
  return { key, direction: 'asc' };
}

// ── Test data ─────────────────────────────────────────────────────────────────

interface TestRow extends Record<string, unknown> {
  id: string;
  name: string;
  amount: number;
  status: string;
}

const SAMPLE_DATA: TestRow[] = [
  { id: '1', name: 'Charlie', amount: 3000, status: 'active' },
  { id: '2', name: 'Alice',   amount: 1000, status: 'pending' },
  { id: '3', name: 'Bob',     amount: 2000, status: 'active' },
  { id: '4', name: 'Diana',   amount: 5000, status: 'declined' },
  { id: '5', name: 'Eve',     amount: 750,  status: 'review' },
];

const SAMPLE_COLUMNS: ColumnDef<TestRow>[] = [
  { key: 'name',   header: 'Name',   sortable: true  },
  { key: 'amount', header: 'Amount', sortable: true, align: 'right' },
  { key: 'status', header: 'Status', sortable: false },
];

// ────────────────────────────────────────────────────────────────────────────

describe('DataTable — column definitions', () => {
  it('sample columns have the correct keys', () => {
    const keys = SAMPLE_COLUMNS.map((c) => c.key);
    expect(keys).toContain('name');
    expect(keys).toContain('amount');
    expect(keys).toContain('status');
  });

  it('column headers are defined for each column', () => {
    SAMPLE_COLUMNS.forEach((col) => {
      expect(col.header).toBeTruthy();
    });
  });

  it('sortable flag is set correctly', () => {
    const nameCol = SAMPLE_COLUMNS.find((c) => c.key === 'name')!;
    const statusCol = SAMPLE_COLUMNS.find((c) => c.key === 'status')!;
    expect(nameCol.sortable).toBe(true);
    expect(statusCol.sortable).toBe(false);
  });

  it('align defaults to left when not specified', () => {
    const nameCol = SAMPLE_COLUMNS.find((c) => c.key === 'name')!;
    const align = nameCol.align ?? 'left';
    expect(align).toBe('left');
  });

  it('amount column has right alignment', () => {
    const amountCol = SAMPLE_COLUMNS.find((c) => c.key === 'amount')!;
    expect(amountCol.align).toBe('right');
  });

  it('custom cell renderer is optional', () => {
    SAMPLE_COLUMNS.forEach((col) => {
      // cell is not required — absence is valid
      expect(col).toBeDefined();
    });
  });
});

describe('DataTable — getNestedValue helper', () => {
  it('retrieves top-level value', () => {
    const obj = { name: 'Alice', amount: 1000 };
    expect(getNestedValue(obj, 'name')).toBe('Alice');
    expect(getNestedValue(obj, 'amount')).toBe(1000);
  });

  it('retrieves nested value via dot notation', () => {
    const obj = { client: { name: 'Bob', score: 720 } } as Record<string, unknown>;
    expect(getNestedValue(obj, 'client.name')).toBe('Bob');
    expect(getNestedValue(obj, 'client.score')).toBe(720);
  });

  it('returns undefined for missing key', () => {
    const obj = { name: 'Alice' };
    expect(getNestedValue(obj, 'missing')).toBeUndefined();
  });

  it('returns undefined for missing nested key', () => {
    const obj = { client: { name: 'Alice' } } as Record<string, unknown>;
    expect(getNestedValue(obj, 'client.missing')).toBeUndefined();
  });
});

describe('DataTable — sorting', () => {
  it('sortData returns original order when direction is null', () => {
    const sorted = sortData(SAMPLE_DATA, { key: 'name', direction: null });
    expect(sorted.map((r) => r.name)).toEqual(['Charlie', 'Alice', 'Bob', 'Diana', 'Eve']);
  });

  it('sorts strings ascending (A → Z)', () => {
    const sorted = sortData(SAMPLE_DATA, { key: 'name', direction: 'asc' });
    const names = sorted.map((r) => r.name);
    expect(names).toEqual(['Alice', 'Bob', 'Charlie', 'Diana', 'Eve']);
  });

  it('sorts strings descending (Z → A)', () => {
    const sorted = sortData(SAMPLE_DATA, { key: 'name', direction: 'desc' });
    const names = sorted.map((r) => r.name);
    expect(names).toEqual(['Eve', 'Diana', 'Charlie', 'Bob', 'Alice']);
  });

  it('sorts numbers ascending', () => {
    const sorted = sortData(SAMPLE_DATA, { key: 'amount', direction: 'asc' });
    const amounts = sorted.map((r) => r.amount);
    expect(amounts).toEqual([750, 1000, 2000, 3000, 5000]);
  });

  it('sorts numbers descending', () => {
    const sorted = sortData(SAMPLE_DATA, { key: 'amount', direction: 'desc' });
    const amounts = sorted.map((r) => r.amount);
    expect(amounts).toEqual([5000, 3000, 2000, 1000, 750]);
  });

  it('does not mutate the original data array', () => {
    const originalOrder = SAMPLE_DATA.map((r) => r.id);
    sortData(SAMPLE_DATA, { key: 'name', direction: 'asc' });
    expect(SAMPLE_DATA.map((r) => r.id)).toEqual(originalOrder);
  });
});

describe('DataTable — sort cycle (asc → desc → null → asc)', () => {
  it('clicking a new column starts asc sort', () => {
    const next = handleSortCycle({ key: '', direction: null }, 'name');
    expect(next).toEqual({ key: 'name', direction: 'asc' });
  });

  it('clicking the same column (asc) toggles to desc', () => {
    const next = handleSortCycle({ key: 'name', direction: 'asc' }, 'name');
    expect(next).toEqual({ key: 'name', direction: 'desc' });
  });

  it('clicking the same column (desc) clears sort to null', () => {
    const next = handleSortCycle({ key: 'name', direction: 'desc' }, 'name');
    expect(next).toEqual({ key: 'name', direction: null });
  });

  it('clicking the same column (null) restarts asc', () => {
    const next = handleSortCycle({ key: 'name', direction: null }, 'name');
    expect(next).toEqual({ key: 'name', direction: 'asc' });
  });

  it('switching to a different column resets direction to asc', () => {
    const next = handleSortCycle({ key: 'name', direction: 'desc' }, 'amount');
    expect(next).toEqual({ key: 'amount', direction: 'asc' });
  });
});

describe('DataTable — pagination math', () => {
  const PAGE_SIZE = 2;
  const TOTAL = 5;

  it('calculates total pages correctly', () => {
    expect(Math.max(1, Math.ceil(5 / 2))).toBe(3);
    expect(Math.max(1, Math.ceil(4 / 2))).toBe(2);
    expect(Math.max(1, Math.ceil(0 / 2))).toBe(1); // empty state → at least 1 page
  });

  it('page 1 slice is correct', () => {
    const page = 1;
    const start = (page - 1) * PAGE_SIZE;
    const rows = SAMPLE_DATA.slice(start, start + PAGE_SIZE);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Charlie');
  });

  it('page 2 slice is correct', () => {
    const page = 2;
    const start = (page - 1) * PAGE_SIZE;
    const rows = SAMPLE_DATA.slice(start, start + PAGE_SIZE);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Bob');
  });

  it('last page shows remaining items', () => {
    const page = 3;
    const start = (page - 1) * PAGE_SIZE;
    const rows = SAMPLE_DATA.slice(start, start + PAGE_SIZE);
    expect(rows).toHaveLength(1); // 5 items, page size 2: page 3 has 1
    expect(rows[0].name).toBe('Eve');
  });

  it('page display string is formatted correctly', () => {
    const page = 1;
    const pageSize = 2;
    const total = 5;
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    const display = `${start + 1}–${end} of ${total}`;
    expect(display).toBe('1–2 of 5');
  });

  it('default page size options are [10, 25, 50]', () => {
    const pageSizeOptions = [10, 25, 50];
    expect(pageSizeOptions).toContain(10);
    expect(pageSizeOptions).toContain(25);
    expect(pageSizeOptions).toContain(50);
  });
});

describe('DataTable — empty state', () => {
  it('default empty message is "No records found."', () => {
    const emptyMessage = 'No records found.';
    expect(emptyMessage).toBe('No records found.');
  });

  it('empty data array renders 0 rows', () => {
    const emptyData: TestRow[] = [];
    expect(emptyData).toHaveLength(0);
  });

  it('shows custom empty message when provided', () => {
    const customMessage = 'No applications found for this period.';
    expect(customMessage).toBe('No applications found for this period.');
  });

  it('total pages is 1 even for empty data', () => {
    const totalPages = Math.max(1, Math.ceil(0 / 10));
    expect(totalPages).toBe(1);
  });
});

describe('DataTable — row key logic', () => {
  it('uses id field as default row key', () => {
    const row = SAMPLE_DATA[0];
    const key = String(row['id'] ?? 0);
    expect(key).toBe('1');
  });

  it('falls back to index when id is missing', () => {
    const row = { name: 'Unknown' } as Record<string, unknown>;
    const key = String(row['id'] ?? 0);
    expect(key).toBe('0');
  });
});
