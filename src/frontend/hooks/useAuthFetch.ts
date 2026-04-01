'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
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

  // Serialize params to avoid infinite re-renders when callers pass object literals
  const serializedParams = params ? JSON.stringify(params) : undefined;

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    // Mock data shortcut — return immediately without hitting the API
    if (shouldUseMocks()) {
      const mock = getMockData(path);
      if (mock !== null) {
        setData(mock as T);
        setIsLoading(false);
        setIsAuthLoading(false);
        return;
      }
    }

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
      }
    } catch (err) {
      // On 401, attempt a single token refresh before giving up
      if (err instanceof ApiRequestError && err.statusCode === 401) {
        const refreshed = await attemptTokenRefresh();
        if (refreshed) {
          // Retry original request once with the new token
          try {
            const parsedParams = serializedParams ? JSON.parse(serializedParams) : undefined;
            const retryResult = await apiClient.get<T>(path.replace('/api', ''), { params: parsedParams });
            if (retryResult.success) {
              setData(retryResult.data as T);
              setIsLoading(false);
              return;
            }
          } catch (retryErr) {
            // Retry failed — fall through to error handling below
            if (retryErr instanceof ApiRequestError) {
              setError({
                type: retryErr.statusCode === 401 || retryErr.statusCode === 403
                  ? 'auth_required'
                  : 'server_error',
                message: retryErr.message,
                status: retryErr.statusCode,
              });
            } else {
              setError({ type: 'network_error', message: 'Connection issue' });
            }
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
        if (err.statusCode === 403) {
          setError({ type: 'auth_required', message: 'Authentication required', status: err.statusCode });
        } else {
          setError({ type: 'server_error', message: err.message, status: err.statusCode });
        }
      } else {
        setError({ type: 'network_error', message: 'Connection issue' });
      }
      console.error(`[useAuthFetch] ${path}:`, err);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
