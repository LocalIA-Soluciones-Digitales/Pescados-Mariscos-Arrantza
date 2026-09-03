import { useTranslation } from 'react-i18next';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/pages/home/components/Footer';

export default function Cookies() {
  const { t } = useTranslation();

  return (
    <>
      <Navbar />
      <main id="main-content" className="bg-background-50 pt-28 md:pt-32 pb-16 md:pb-24">
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
                {t('legal.cookies.s2b.title')}
              </h2>
              <p className="mb-2">{t('legal.cookies.s2b.p')}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse mt-2">
                  <thead>
                    <tr className="border-b border-background-200">
                      <th className="py-2 pr-4 font-semibold text-foreground-950">{t('legal.cookies.table.name')}</th>
                      <th className="py-2 pr-4 font-semibold text-foreground-950">{t('legal.cookies.table.type')}</th>
                      <th className="py-2 pr-4 font-semibold text-foreground-950">{t('legal.cookies.table.purpose')}</th>
                      <th className="py-2 font-semibold text-foreground-950">{t('legal.cookies.table.duration')}</th>
                    </tr>
                  </thead>
                  <tbody className="align-top">
                    <tr className="border-b border-background-100">
                      <td className="py-2 pr-4 font-mono text-xs">arrantza_device_id</td>
                      <td className="py-2 pr-4">{t('legal.cookies.row.technical')}</td>
                      <td className="py-2 pr-4">{t('legal.cookies.row1.purpose')}</td>
                      <td className="py-2">{t('legal.cookies.row.year')}</td>
                    </tr>
                    <tr className="border-b border-background-100">
                      <td className="py-2 pr-4 font-mono text-xs">arrantza_lang</td>
                      <td className="py-2 pr-4">{t('legal.cookies.row.technical')}</td>
                      <td className="py-2 pr-4">{t('legal.cookies.row2.purpose')}</td>
                      <td className="py-2">{t('legal.cookies.row.persistent')}</td>
                    </tr>
                    <tr className="border-b border-background-100">
                      <td className="py-2 pr-4 font-mono text-xs">arrantza_cart</td>
                      <td className="py-2 pr-4">{t('legal.cookies.row.technical')}</td>
                      <td className="py-2 pr-4">{t('legal.cookies.row3.purpose')}</td>
                      <td className="py-2">{t('legal.cookies.row.persistent')}</td>
                    </tr>
                    <tr className="border-b border-background-100">
                      <td className="py-2 pr-4 font-mono text-xs">arrantza_cookie_consent</td>
                      <td className="py-2 pr-4">{t('legal.cookies.row.technical')}</td>
                      <td className="py-2 pr-4">{t('legal.cookies.row4.purpose')}</td>
                      <td className="py-2">{t('legal.cookies.row.persistent')}</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">pmz_visitor_id / pmz_session_id / pmz_source</td>
                      <td className="py-2 pr-4">{t('legal.cookies.row.analytics')}</td>
                      <td className="py-2 pr-4">{t('legal.cookies.row5.purpose')}</td>
                      <td className="py-2">{t('legal.cookies.row.session_or_year')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-foreground-400">{t('legal.cookies.s2b.note')}</p>
              <p className="mt-1 text-xs text-foreground-400">{t('legal.cookies.maps_note')}</p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                {t('legal.cookies.s3.title')}
              </h2>
              <p className="mb-2">{t('legal.cookies.s3.pre')}</p>
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
                <a href="mailto:d-tamayo@hotmail.com" className="text-primary-600 hover:underline">
                  d-tamayo@hotmail.com
                </a>{' '}
                {t('legal.cookies.s4.p2')} +34 619 60 98 88.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
