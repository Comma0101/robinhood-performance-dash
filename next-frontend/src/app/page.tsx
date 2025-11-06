"use client";

import dynamic from "next/dynamic";
import React from "react";

// Dynamically import components that are not SSR-friendly or are large
const LandingHero = dynamic(() => import("@/components/LandingHero"), {
  ssr: false,
});
const QuantProofStrip = dynamic(() => import("@/components/QuantProofStrip"), {
  ssr: false,
});
const ThreePillars = dynamic(() => import("@/components/ThreePillars"), {
  ssr: false,
});
const DashboardsPreview = dynamic(
  () => import("@/components/DashboardsPreview"),
  { ssr: false }
);
const TrustLayer = dynamic(() => import("@/components/TrustLayer"), {
  ssr: false,
});
const FinalCTA = dynamic(() => import("@/components/FinalCTA"), { ssr: false });
const Footer = dynamic(() => import("@/components/Footer"), { ssr: false });

export default function LandingPage() {
  return (
    <div className="bg-[#0B0D10] text-[#E7ECEF]">
      <header>
        <LandingHero />
      </header>
      <main>
        <QuantProofStrip />
        <ThreePillars />
        <DashboardsPreview />
        <TrustLayer />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
