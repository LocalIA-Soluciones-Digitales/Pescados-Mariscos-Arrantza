import { useTranslation } from 'react-i18next';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/pages/home/components/Footer';

export default function Cookies() {
  const { t } = useTranslation();

  return (
    <>
      <Navbar />
      <main className="bg-background-50 pt-28 md:pt-32 pb-16 md:pb-24">
        <div className="container-wide px-4 md:px-6 lg:px-12 max-w-3xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-heading font-semibold text-foreground-950 mb-8">
            {t('footer.cookies')}
          </h1>

          <div className="space-y-8 text-sm md:text-base text-foreground-600 leading-relaxed">
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.cookies.s1.title')}
              </h2>
              <p>{t('legal.cookies.s1.p')}</p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.cookies.s2.title')}
              </h2>
              <ul className="space-y-2 list-disc pl-5">
                <li>
                  <strong>{t('legal.cookies.s2.li1_label')}:</strong> {t('legal.cookies.s2.li1')}
                </li>
                <li>
                  <strong>{t('legal.cookies.s2.li2_label')}:</strong> {t('legal.cookies.s2.li2')}
                </li>
                <li>
                  <strong>{t('legal.cookies.s2.li3_label')}:</strong> {t('legal.cookies.s2.li3')}
                </li>
              </ul>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.cookies.s3.title')}
              </h2>
              <p>{t('legal.cookies.s3.p')}</p>
              <ul className="mt-2 space-y-1 list-disc pl-5">
                <li>Google Chrome</li>
                <li>Mozilla Firefox</li>
                <li>Safari</li>
                <li>Microsoft Edge</li>
              </ul>
              <p className="mt-2">{t('legal.cookies.s3.p2')}</p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.cookies.s4.title')}
              </h2>
              <p>
                {t('legal.cookies.s4.p1')}{' '}
                <a href="mailto:jonmendiola98@gmail.com" className="text-primary-600 hover:underline">
                  jonmendiola98@gmail.com
                </a>{' '}
                {t('legal.cookies.s4.p2')} +34 608 240 759.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
