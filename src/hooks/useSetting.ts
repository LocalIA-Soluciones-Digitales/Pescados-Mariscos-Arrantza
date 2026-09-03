import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getMiClienteId } from '@/lib/clienteContext';

export function useSetting<T>(key: string, defaultValue: T) {
  const [value, setValueState] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const defaultRef = useRef(defaultValue);

  const fetchValue = useCallback(async () => {
    setLoading(true);
    try {
      const cliente_id = await getMiClienteId();
      const { data } = await supabase.from('settings').select('value').eq('cliente_id', cliente_id).eq('key', key).maybeSingle();
      setValueState((data?.value as T) ?? defaultRef.current);
    } catch {
      setValueState(defaultRef.current);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    fetchValue();
  }, [fetchValue]);

  const save = useCallback(
    async (next: T) => {
      setValueState(next);
      try {
        const cliente_id = await getMiClienteId();
        await supabase.from('settings').upsert({ cliente_id, key, value: next });
      } catch {
        // Sin cliente resuelto no hay dónde guardar; el valor ya se refleja en UI.
      }
    },
    [key],
  );

  return { value, loading, save };
}
