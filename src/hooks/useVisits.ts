import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { VisitEntry } from '@/lib/visitLog';

const MAX_ROWS = 50_000;

// Trae todo el histórico guardado (hasta MAX_ROWS eventos más recientes).
export function useVisits() {
  const [visits, setVisits] = useState<VisitEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVisits = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('visits')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);
    setVisits((data ?? []).slice().reverse());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits]);

  return { visits, loading, refetch: fetchVisits };
}
