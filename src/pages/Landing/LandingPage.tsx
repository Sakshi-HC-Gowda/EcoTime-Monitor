import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { VisualWorkflow } from './components/VisualWorkflow';
//import { DashboardPreview } from './components/DashboardPreview';
import { Footer } from './components/Footer';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#070a13] text-[#f8fafc] overflow-x-hidden">
      <Navbar />
      <Hero />
      <Features />
      <VisualWorkflow />
      {/* <DashboardPreview /> */}
      <Footer />
    </div>
  );
}
