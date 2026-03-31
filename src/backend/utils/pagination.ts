// ============================================================
// CapitalForge — Pagination Helper
// Converts PaginationParams → Prisma skip/take/orderBy
// Builds ApiResponse metadata for paginated endpoints
// ============================================================

import type { PaginationParams, ApiResponse } from '../../shared/types/index.js';

// ── Constants ─────────────────────────────────────────────────
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// ── Types ─────────────────────────────────────────────────────
export interface PrismaPageArgs {
  skip: number;
  take: number;
  orderBy: Record<string, 'asc' | 'desc'>;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// ── Normalise incoming params ─────────────────────────────────
export function normalizePaginationParams(
  params: Partial<PaginationParams>,
): Required<PaginationParams> {
  const page = Math.max(1, params.page ?? DEFAULT_PAGE);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE),
  );
  return {
    page,
    pageSize,
    sortBy: params.sortBy ?? 'createdAt',
    sortOrder: params.sortOrder ?? 'desc',
  };
}

// ── Convert params → Prisma skip/take/orderBy ─────────────────
export function buildPrismaPageArgs(
  params: Partial<PaginationParams>,
  allowedSortFields?: string[],
): PrismaPageArgs {
  const { page, pageSize, sortBy, sortOrder } = normalizePaginationParams(params);

  // Guard against orderBy field injection
  let safeSortBy = sortBy;
  if (allowedSortFields && allowedSortFields.length > 0) {
    if (!allowedSortFields.includes(sortBy)) {
      safeSortBy = allowedSortFields[0];
    }
  }

  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { [safeSortBy]: sortOrder },
  };
}

// ── Build pagination metadata for ApiResponse ─────────────────
export function buildPaginationMeta(
  params: Partial<PaginationParams>,
  total: number,
): PaginationMeta {
  const { page, pageSize } = normalizePaginationParams(params);
  const totalPages = Math.ceil(total / pageSize);

  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

// ── Build a complete paginated ApiResponse ────────────────────
export function buildPaginatedResponse<T>(
  data: T[],
  params: Partial<PaginationParams>,
  total: number,
): ApiResponse<T[]> {
  const meta = buildPaginationMeta(params, total);
  return {
    success: true,
    data,
    meta: {
      page: meta.page,
      pageSize: meta.pageSize,
      total: meta.total,
    },
  };
}

// ── Parse page params from query string values ────────────────
export function parsePaginationQuery(query: Record<string, string | undefined>): Partial<PaginationParams> {
  const page = query['page'] !== undefined ? parseInt(query['page'], 10) : undefined;
  const pageSize = query['pageSize'] !== undefined ? parseInt(query['pageSize'], 10) : undefined;
  const sortOrder =
    query['sortOrder'] === 'asc' || query['sortOrder'] === 'desc'
      ? query['sortOrder']
      : undefined;

  return {
    page: page !== undefined && !isNaN(page) ? page : undefined,
    pageSize: pageSize !== undefined && !isNaN(pageSize) ? pageSize : undefined,
    sortBy: query['sortBy'],
    sortOrder,
  };
}
