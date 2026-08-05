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
                1. ¿Qué son las cookies?
              </h2>
              <p>
                Las cookies son pequeños archivos de texto que este sitio web, propiedad
                de Pescados y Mariscos Arrantza, almacena en el navegador del usuario para
                permitir su correcto funcionamiento, recordar preferencias y, en su caso,
                obtener información estadística sobre la navegación.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                2. Tipos de cookies utilizadas
              </h2>
              <ul className="space-y-2 list-disc pl-5">
                <li>
                  <strong>Cookies técnicas (necesarias):</strong> imprescindibles para el
                  funcionamiento básico del sitio, como recordar el idioma seleccionado o
                  los productos añadidos al carrito de pedido.
                </li>
                <li>
                  <strong>Cookies de preferencias:</strong> permiten recordar información
                  para que el usuario acceda al servicio con determinadas características
                  que puedan diferenciar su experiencia de la de otros usuarios.
                </li>
                <li>
                  <strong>Cookies analíticas:</strong> permiten el seguimiento y análisis
                  del comportamiento de los usuarios en el sitio web, con el fin de mejorar
                  la oferta de productos y servicios.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                3. Desactivación y eliminación de cookies
              </h2>
              <p>
                El usuario puede permitir, bloquear o eliminar las cookies instaladas en
                su equipo mediante la configuración de las opciones de su navegador. A
                continuación se facilitan enlaces a las instrucciones de los navegadores
                más habituales:
              </p>
              <ul className="mt-2 space-y-1 list-disc pl-5">
                <li>Google Chrome</li>
                <li>Mozilla Firefox</li>
                <li>Safari</li>
                <li>Microsoft Edge</li>
              </ul>
              <p className="mt-2">
                Ten en cuenta que la desactivación de determinadas cookies puede afectar
                a la disponibilidad y correcto funcionamiento de algunas secciones del
                sitio, como el carrito de pedido.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                4. Más información
              </h2>
              <p>
                Para cualquier duda o consulta sobre esta política de cookies, puedes
                contactar con nosotros en{' '}
                <a href="mailto:jonmendiola98@gmail.com" className="text-primary-600 hover:underline">
                  jonmendiola98@gmail.com
                </a>{' '}
                o en el teléfono +34 608 240 759.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
