import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { ErrorLogEntry } from '@/lib/errorLog';

export function useErrorLogs() {
  const [errors, setErrors] = useState<ErrorLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchErrors = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('error_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setErrors(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchErrors();
  }, [fetchErrors]);

  const clearAll = useCallback(async () => {
    await supabase.from('error_logs').delete().not('id', 'is', null);
    await fetchErrors();
  }, [fetchErrors]);

  return { errors, loading, refetch: fetchErrors, clearAll };
}
