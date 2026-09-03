import {
  Navbar,
  Hero,
  AIEntryBanner,
  LogoMarquee,
  Features,
  Work,
  Stats,
  Testimonials,
  CTA,
  Footer,
} from "@/components/landing";

const Index = () => {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <Navbar />
      <main>
        <Hero />
        <AIEntryBanner />
        <LogoMarquee />
        <Features />
        <Work />
        <Stats />
        <Testimonials />
        <CTA />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
