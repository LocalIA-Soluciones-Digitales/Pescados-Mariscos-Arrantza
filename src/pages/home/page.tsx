import Navbar from '@/components/feature/Navbar';
import Hero from './components/Hero';
import AvailableToday from './components/AvailableToday';
import About from './components/About';
import Process from './components/Process';
import WhyChooseUs from './components/WhyChooseUs';
import Gallery from './components/Gallery';
import Testimonials from './components/Testimonials';
import FAQ from './components/FAQ';
import LocationMap from './components/LocationMap';
import Contact from './components/Contact';
import Footer from './components/Footer';
import FloatingCallButton from './components/FloatingCallButton';

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <AvailableToday />
        <About />
        <Process />
        <WhyChooseUs />
        <Gallery />
        <Testimonials />
        <FAQ />
        <LocationMap />
        <Contact />
      </main>
      <Footer />
      <FloatingCallButton />
    </>
  );
}