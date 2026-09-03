import { useTranslation } from 'react-i18next';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/pages/home/components/Footer';

export default function Privacidad() {
  const { t } = useTranslation();

  return (
    <>
      <Navbar />
      <main id="main-content" className="bg-background-50 pt-28 md:pt-32 pb-16 md:pb-24">
        <div className="container-wide px-4 md:px-6 lg:px-12 max-w-3xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-heading font-semibold text-foreground-950 mb-8">
            {t('legal.privacidad.page_title')}
          </h1>

          <div className="space-y-8 text-sm md:text-base text-foreground-600 leading-relaxed">
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.privacidad.s1.title')}
              </h2>
              <p>{t('legal.privacidad.s1.p')}</p>
              <ul className="mt-2 space-y-1">
                <li><strong>{t('legal.aviso.owner_label')}:</strong> Pescados y Mariscos Arrantza</li>
                <li><strong>{t('legal.aviso.legalname_label')}:</strong> David Tamayo Huerta</li>
                <li><strong>{t('legal.aviso.nif_label')}:</strong> 78880797C</li>
                <li><strong>{t('legal.aviso.legalform_label')}:</strong> {t('legal.aviso.legalform_value')}</li>
                <li><strong>{t('legal.aviso.address_label')}:</strong> Calle Jesús Aramburu, 1, 48950 Erandio, Bizkaia, España</li>
                <li><strong>{t('legal.aviso.email_label')}:</strong> d-tamayo@hotmail.com</li>
                <li><strong>{t('legal.aviso.phone_label')}:</strong> +34 619 60 98 88</li>
              </ul>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.privacidad.s2.title')}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse mt-2">
                  <thead>
                    <tr className="border-b border-background-200">
                      <th className="py-2 pr-4 font-semibold text-foreground-950">{t('legal.privacidad.table.purpose')}</th>
                      <th className="py-2 pr-4 font-semibold text-foreground-950">{t('legal.privacidad.table.data')}</th>
                      <th className="py-2 pr-4 font-semibold text-foreground-950">{t('legal.privacidad.table.basis')}</th>
                      <th className="py-2 font-semibold text-foreground-950">{t('legal.privacidad.table.retention')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-background-100">
                      <td className="py-2 pr-4">{t('legal.privacidad.row1.purpose')}</td>
                      <td className="py-2 pr-4">{t('legal.privacidad.row1.data')}</td>
                      <td className="py-2 pr-4">{t('legal.privacidad.row1.basis')}</td>
                      <td className="py-2">{t('legal.privacidad.row1.retention')}</td>
                    </tr>
                    <tr className="border-b border-background-100">
                      <td className="py-2 pr-4">{t('legal.privacidad.row2.purpose')}</td>
                      <td className="py-2 pr-4">{t('legal.privacidad.row2.data')}</td>
                      <td className="py-2 pr-4">{t('legal.privacidad.row2.basis')}</td>
                      <td className="py-2">{t('legal.privacidad.row2.retention')}</td>
                    </tr>
                    <tr className="border-b border-background-100">
                      <td className="py-2 pr-4">{t('legal.privacidad.row3.purpose')}</td>
                      <td className="py-2 pr-4">{t('legal.privacidad.row3.data')}</td>
                      <td className="py-2 pr-4">{t('legal.privacidad.row3.basis')}</td>
                      <td className="py-2">{t('legal.privacidad.row3.retention')}</td>
                    </tr>
                    <tr className="border-b border-background-100">
                      <td className="py-2 pr-4">{t('legal.privacidad.row4.purpose')}</td>
                      <td className="py-2 pr-4">{t('legal.privacidad.row4.data')}</td>
                      <td className="py-2 pr-4">{t('legal.privacidad.row4.basis')}</td>
                      <td className="py-2">{t('legal.privacidad.row4.retention')}</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4">{t('legal.privacidad.row5.purpose')}</td>
                      <td className="py-2 pr-4">{t('legal.privacidad.row5.data')}</td>
                      <td className="py-2 pr-4">{t('legal.privacidad.row5.basis')}</td>
                      <td className="py-2">{t('legal.privacidad.row5.retention')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.privacidad.s3.title')}
              </h2>
              <p>{t('legal.privacidad.s3.p')}</p>
              <ul className="mt-2 space-y-1 list-disc pl-5">
                <li>{t('legal.privacidad.s3.li1')}</li>
                <li>{t('legal.privacidad.s3.li2')}</li>
                <li>{t('legal.privacidad.s3.li3')}</li>
                <li>{t('legal.privacidad.s3.li4')}</li>
              </ul>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.privacidad.s4.title')}
              </h2>
              <p>{t('legal.privacidad.s4.p')}</p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.privacidad.s5.title')}
              </h2>
              <p>{t('legal.privacidad.s5.p')}</p>
              <ul className="mt-2 space-y-1 list-disc pl-5">
                <li>{t('legal.privacidad.s5.li1')}</li>
                <li>{t('legal.privacidad.s5.li2')}</li>
                <li>{t('legal.privacidad.s5.li3')}</li>
                <li>{t('legal.privacidad.s5.li4')}</li>
                <li>{t('legal.privacidad.s5.li5')}</li>
                <li>{t('legal.privacidad.s5.li6')}</li>
              </ul>
              <p className="mt-2">
                {t('legal.privacidad.s5.p2_pre')}{' '}
                <a href="mailto:d-tamayo@hotmail.com" className="text-primary-600 hover:underline">d-tamayo@hotmail.com</a>.
              </p>
              <p className="mt-2">{t('legal.privacidad.s5.p3')}</p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.privacidad.s6.title')}
              </h2>
              <p>{t('legal.privacidad.s6.p')}</p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.privacidad.s7.title')}
              </h2>
              <p>{t('legal.privacidad.s7.p')}</p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.privacidad.s8.title')}
              </h2>
              <p>{t('legal.privacidad.s8.p')}</p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
