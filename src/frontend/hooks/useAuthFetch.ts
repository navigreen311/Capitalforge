'use client';
import { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiRequestError } from '@/lib/api-client';

export interface AuthFetchError {
  type: 'auth_required' | 'server_error' | 'network_error' | 'not_configured';
  message: string;
  status?: number;
}

export function useAuthFetch<T>(path: string, params?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AuthFetchError | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
      if (!token) {
        setError({ type: 'auth_required', message: 'Sign in required' });
        setIsLoading(false);
        return;
      }
      const result = await apiClient.get<T>(path.replace('/api', ''), { params });
      if (result.success) {
        setData(result.data as T);
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.statusCode === 401 || err.statusCode === 403) {
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
  }, [path, params]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}
