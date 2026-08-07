'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiRequestError } from '@/lib/api-client';
import { attemptTokenRefresh } from '@/lib/token-refresh';
import { getAccessToken } from '@/lib/session-storage';

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

    // Every path below reaches the API. There is no mock branch: this hook
    // used to answer from a fixture set before any auth logic ran, which meant
    // a screen could render a full, confident dashboard while signed out and
    // pointed at nothing. Data on screen now came from the server or the
    // component shows why it did not.
    try {
      const token = getAccessToken();
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

  useEffect(() => { void fetchData(); }, [fetchData]);

  return { data, isLoading, isAuthLoading, error, refetch: fetchData };
}

// ─── Token refresh helper ────────────────────────────────────────────────────

// Moved to lib/token-refresh so `api-client` can use it too — it could not
// import this file, which imports `api-client`. Re-exported here because
// several call sites already import it from this module.
export { attemptTokenRefresh };
