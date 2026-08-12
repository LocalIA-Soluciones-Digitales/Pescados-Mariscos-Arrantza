import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { confirmarNewsletter, bajaNewsletter } from '@/lib/newsletterLog';

interface NewsletterActionProps {
  mode: 'confirmar' | 'baja';
}

export default function NewsletterAction({ mode }: NewsletterActionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [result, setResult] = useState<'checking' | 'success' | 'already' | 'invalid'>('checking');

  useEffect(() => {
    if (!token) {
      setResult('invalid');
      return;
    }

    if (mode === 'confirmar') {
      confirmarNewsletter(token).then((status) => {
        if (status === 'confirmado') setResult('success');
        else if (status === 'ya_confirmado') setResult('already');
        else setResult('invalid');
      });
    } else {
      bajaNewsletter(token).then((status) => {
        setResult(status === 'baja' ? 'success' : 'invalid');
      });
    }
  }, [mode, token]);

  const prefix = mode === 'confirmar' ? 'newsletter.confirm' : 'newsletter.baja';
  const checkingText = t(`${prefix}.checking`);
  const title =
    result === 'success'
      ? t(`${prefix}.success.title`)
      : result === 'already'
        ? t('newsletter.confirm.already.title')
        : t(`${prefix}.invalid.title`);
  const body =
    result === 'success'
      ? t(`${prefix}.success.body`)
      : result === 'already'
        ? t('newsletter.confirm.already.body')
        : t(`${prefix}.invalid.body`);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-100 px-4">
      <div className="w-full max-w-[400px] bg-background-50 border border-background-200/70 rounded-lg p-8 shadow-sm text-center">
        {result === 'checking' ? (
          <p className="text-sm text-foreground-400">{checkingText}</p>
        ) : (
          <>
            <div
              className={`w-12 h-12 mx-auto mb-4 flex items-center justify-center rounded-full ${
                result === 'invalid' ? 'bg-red-50 text-red-500' : 'bg-accent-100 text-accent-600'
              }`}
            >
              <i className={`text-xl ${result === 'invalid' ? 'ri-error-warning-line' : 'ri-checkbox-circle-line'}`}></i>
            </div>
            <h1 className="font-heading text-lg font-semibold text-foreground-950 mb-2">{title}</h1>
            <p className="text-sm text-foreground-500 mb-6">{body}</p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-xs text-foreground-400 hover:text-foreground-700 transition-colors"
            >
              {t('newsletter.back')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
