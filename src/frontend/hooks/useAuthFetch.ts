'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiRequestError } from '@/lib/api-client';
import { shouldUseMocks, getMockData } from '@/lib/dashboard-mocks';

export interface AuthFetchError {
  type: 'auth_required' | 'server_error' | 'network_error' | 'not_configured';
  message: string;
  status?: number;
}

export type { AuthFetchError as AuthFetchErrorType };

export function useAuthFetch<T>(path: string, params?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [error, setError] = useState<AuthFetchError | null>(null);

  const serializedParams = params ? JSON.stringify(params) : undefined;

  const fetchData = useCallback(async () => {
    // Guard against undefined/null in URL (clientId not yet resolved)
    if (path.includes('undefined') || path.includes('null')) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    // ── Mock data shortcut — checked FIRST, before any auth logic ──
    if (shouldUseMocks()) {
      const mock = getMockData(path);
      if (mock !== null) {
        // Simulate realistic network delay
        await new Promise((r) => setTimeout(r, 300 + Math.random() * 200));
        setData(mock as T);
        setIsLoading(false);
        setIsAuthLoading(false);
        return;
      }
      // No mock found for this path — fall through to real API
      console.warn(`[useAuthFetch] No mock data for: ${path}`);
    }

    // ── Real API call ──
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
      setIsAuthLoading(false);

      if (!token) {
        setError({ type: 'auth_required', message: 'Sign in required' });
        setIsLoading(false);
        return;
      }

      const parsedParams = serializedParams ? JSON.parse(serializedParams) : undefined;
      const result = await apiClient.get<T>(path.replace('/api', ''), { params: parsedParams });
      if (result.success) {
        setData(result.data as T);
      } else {
        // API returned success: false
        setError({ type: 'server_error', message: 'Unexpected response format' });
      }
    } catch (err) {
      if (err instanceof ApiRequestError && (err.statusCode === 401 || err.statusCode === 403)) {
        // Try token refresh once
        const refreshed = await attemptTokenRefresh();
        if (refreshed) {
          try {
            const parsedParams = serializedParams ? JSON.parse(serializedParams) : undefined;
            const retryResult = await apiClient.get<T>(path.replace('/api', ''), { params: parsedParams });
            if (retryResult.success) {
              setData(retryResult.data as T);
              setIsLoading(false);
              return;
            }
          } catch (retryErr) {
            setError({
              type: 'auth_required',
              message: retryErr instanceof ApiRequestError ? retryErr.message : 'Authentication failed',
              status: retryErr instanceof ApiRequestError ? retryErr.statusCode : undefined,
            });
            console.error(`[useAuthFetch] retry ${path}:`, retryErr);
            setIsLoading(false);
            return;
          }
        } else {
          setError({ type: 'auth_required', message: 'Authentication required', status: 401 });
          setIsLoading(false);
          return;
        }
      } else if (err instanceof ApiRequestError) {
        setError({ type: 'server_error', message: err.message, status: err.statusCode });
      } else {
        setError({ type: 'network_error', message: 'Connection issue' });
      }
      console.error(`[useAuthFetch] ${path}:`, err);
    } finally {
      setIsLoading(false);
    }
  }, [path, serializedParams]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, isAuthLoading, error, refetch: fetchData };
}

// ─── Token refresh helper ────────────────────────────────────────────────────

async function attemptTokenRefresh(): Promise<boolean> {
  try {
    const refreshToken = typeof window !== 'undefined'
      ? localStorage.getItem('cf_refresh_token')
      : null;

    if (!refreshToken) return false;

    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) return false;

    const data = await response.json();
    if (data.access_token) {
      localStorage.setItem('cf_access_token', data.access_token);
    }
    if (data.refresh_token) {
      localStorage.setItem('cf_refresh_token', data.refresh_token);
    }
    return !!data.access_token;
  } catch {
    return false;
  }
}
