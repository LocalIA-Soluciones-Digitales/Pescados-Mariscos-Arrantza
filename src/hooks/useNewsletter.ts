import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRealtimeTable } from './useRealtimeTable';

export interface NewsletterSubscriber {
  id: string;
  email: string;
  idioma: 'es' | 'eu';
  created_at: string;
  confirmado: boolean;
  confirmado_en: string | null;
}

export function useNewsletter() {
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSubscribers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('newsletter_subscribers').select('*').order('created_at', { ascending: false });
    setSubscribers(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSubscribers();
  }, [fetchSubscribers]);

  useRealtimeTable('newsletter_subscribers', fetchSubscribers);

  const remove = useCallback(
    async (id: string) => {
      await supabase.from('newsletter_subscribers').delete().eq('id', id);
      await fetchSubscribers();
    },
    [fetchSubscribers],
  );

  return { subscribers, loading, refetch: fetchSubscribers, remove };
}
