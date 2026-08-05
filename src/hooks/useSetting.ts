import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function useSetting<T>(key: string, defaultValue: T) {
  const [value, setValueState] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const defaultRef = useRef(defaultValue);

  const fetchValue = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
    setValueState((data?.value as T) ?? defaultRef.current);
    setLoading(false);
  }, [key]);

  useEffect(() => {
    fetchValue();
  }, [fetchValue]);

  const save = useCallback(
    async (next: T) => {
      setValueState(next);
      await supabase.from('settings').upsert({ key, value: next });
    },
    [key],
  );

  return { value, loading, save };
}
