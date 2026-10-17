import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { ErrorLogEntry } from '@/lib/errorLog';

const MAX_ROWS = 1000;

export function useErrorLogs() {
  const [errors, setErrors] = useState<ErrorLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchErrors = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('error_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);
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

  // Borra un grupo concreto (al darlo por resuelto) en lotes para no pasarse
  // del largo de URL de PostgREST con muchos ids.
  const removeIds = useCallback(async (ids: string[]) => {
    for (let i = 0; i < ids.length; i += 100) {
      await supabase.from('error_logs').delete().in('id', ids.slice(i, i + 100));
    }
    setErrors((prev) => prev.filter((e) => !ids.includes(e.id)));
  }, []);

  return { errors, loading, refetch: fetchErrors, clearAll, removeIds };
}
