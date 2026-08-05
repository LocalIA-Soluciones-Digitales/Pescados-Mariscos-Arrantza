import { useTranslation } from 'react-i18next';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/pages/home/components/Footer';

export default function AvisoLegal() {
  const { t } = useTranslation();

  return (
    <>
      <Navbar />
      <main className="bg-background-50 pt-28 md:pt-32 pb-16 md:pb-24">
        <div className="container-wide px-4 md:px-6 lg:px-12 max-w-3xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-heading font-semibold text-foreground-950 mb-8">
            {t('footer.privacy')}
          </h1>

          <div className="space-y-8 text-sm md:text-base text-foreground-600 leading-relaxed">
            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                1. Datos identificativos
              </h2>
              <p>
                En cumplimiento del deber de información recogido en el artículo 10 de la
                Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información
                y del Comercio Electrónico, se informa a los usuarios del sitio web de los
                siguientes datos:
              </p>
              <ul className="mt-2 space-y-1">
                <li><strong>Titular:</strong> Pescados y Mariscos Arrantza</li>
                <li><strong>Dirección:</strong> Calle Jesús Aramburu, 1, 48950 Erandio, Bizkaia, España</li>
                <li><strong>Teléfono:</strong> +34 608 240 759</li>
                <li><strong>Correo electrónico:</strong> jonmendiola98@gmail.com</li>
              </ul>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                2. Objeto
              </h2>
              <p>
                El presente sitio web tiene como finalidad ofrecer información sobre los
                productos y servicios de Pescados y Mariscos Arrantza, así como facilitar
                la realización de pedidos y encargos por parte de los usuarios.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                3. Condiciones de uso
              </h2>
              <p>
                El acceso y uso de este sitio web atribuye la condición de usuario y
                supone la aceptación plena de todas las cláusulas incluidas en este
                Aviso Legal. El usuario se compromete a hacer un uso adecuado de los
                contenidos y servicios que se ofrecen, y a no emplearlos para incurrir
                en actividades ilícitas o contrarias a la buena fe y al ordenamiento legal.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                4. Propiedad intelectual e industrial
              </h2>
              <p>
                Todos los contenidos del sitio web (textos, imágenes, marcas, logotipos y
                demás elementos gráficos), así como su código fuente, son propiedad de
                Pescados y Mariscos Arrantza o de terceros que han autorizado su uso, y
                están protegidos por la normativa de propiedad intelectual e industrial.
                Queda prohibida su reproducción, distribución o transformación sin
                autorización expresa del titular.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                5. Responsabilidad
              </h2>
              <p>
                Pescados y Mariscos Arrantza no se hace responsable de los daños y
                perjuicios de cualquier naturaleza que pudieran derivarse de la falta de
                disponibilidad o continuidad del funcionamiento del sitio web, ni de
                errores u omisiones en los contenidos, sin perjuicio de las medidas que
                se adopten para evitarlo.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold text-foreground-950 mb-2">
                6. Legislación aplicable
              </h2>
              <p>
                Las presentes condiciones se rigen por la legislación española. Para
                cualquier controversia derivada del uso del sitio web, las partes se
                someten a los juzgados y tribunales del domicilio del usuario, salvo que
                la ley disponga otra cosa.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
