import { useTranslation } from 'react-i18next';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/pages/home/components/Footer';

export default function CondicionesContratacion() {
  const { t } = useTranslation();

  return (
    <>
      <Navbar />
      <main id="main-content" className="bg-background-50 pt-28 md:pt-32 pb-16 md:pb-24">
        <div className="container-wide px-4 md:px-6 lg:px-12 max-w-3xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-heading font-semibold text-foreground-950 mb-8">
            {t('legal.condiciones.page_title')}
          </h1>

          <div className="space-y-8 text-sm md:text-base text-foreground-600 leading-relaxed">
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.condiciones.s1.title')}
              </h2>
              <p>{t('legal.condiciones.s1.p')}</p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.condiciones.s2.title')}
              </h2>
              <p>{t('legal.condiciones.s2.p')}</p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.condiciones.s3.title')}
              </h2>
              <p>{t('legal.condiciones.s3.p')}</p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.condiciones.s4.title')}
              </h2>
              <p>{t('legal.condiciones.s4.p')}</p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.condiciones.s5.title')}
              </h2>
              <p>{t('legal.condiciones.s5.p')}</p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.condiciones.s6.title')}
              </h2>
              <p>{t('legal.condiciones.s6.p')}</p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.condiciones.s7.title')}
              </h2>
              <p>
                {t('legal.condiciones.s7.p')}{' '}
                <a href="mailto:d-tamayo@hotmail.com" className="text-primary-600 hover:underline">d-tamayo@hotmail.com</a>
                {' '}{t('legal.condiciones.s7.p2')} +34 619 60 98 88.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.condiciones.s8.title')}
              </h2>
              <p>{t('legal.condiciones.s8.p')}</p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
