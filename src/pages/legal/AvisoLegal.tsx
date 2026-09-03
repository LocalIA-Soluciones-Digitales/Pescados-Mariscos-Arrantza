import { useTranslation } from 'react-i18next';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/pages/home/components/Footer';

export default function AvisoLegal() {
  const { t } = useTranslation();

  return (
    <>
      <Navbar />
      <main id="main-content" className="bg-background-50 pt-28 md:pt-32 pb-16 md:pb-24">
        <div className="container-wide px-4 md:px-6 lg:px-12 max-w-3xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-heading font-semibold text-foreground-950 mb-8">
            {t('legal.aviso.page_title')}
          </h1>

          <div className="space-y-8 text-sm md:text-base text-foreground-600 leading-relaxed">
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.aviso.s1.title')}
              </h2>
              <p>{t('legal.aviso.s1.p')}</p>
              <ul className="mt-2 space-y-1">
                <li><strong>{t('legal.aviso.owner_label')}:</strong> Pescados y Mariscos Arrantza</li>
                <li><strong>{t('legal.aviso.legalname_label')}:</strong> David Tamayo Huerta</li>
                <li><strong>{t('legal.aviso.nif_label')}:</strong> 78880797C</li>
                <li><strong>{t('legal.aviso.legalform_label')}:</strong> {t('legal.aviso.legalform_value')}</li>
                <li><strong>{t('legal.aviso.address_label')}:</strong> Calle Jesús Aramburu, 1, 48950 Erandio, Bizkaia, España</li>
                <li><strong>{t('legal.aviso.phone_label')}:</strong> +34 619 60 98 88</li>
                <li><strong>{t('legal.aviso.email_label')}:</strong> d-tamayo@hotmail.com</li>
              </ul>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.aviso.s2.title')}
              </h2>
              <p>{t('legal.aviso.s2.p')}</p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.aviso.s3.title')}
              </h2>
              <p>{t('legal.aviso.s3.p')}</p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.aviso.s4.title')}
              </h2>
              <p>{t('legal.aviso.s4.p')}</p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.aviso.s5.title')}
              </h2>
              <p>{t('legal.aviso.s5.p')}</p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.aviso.s6.title')}
              </h2>
              <p>{t('legal.aviso.s6.p')}</p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
