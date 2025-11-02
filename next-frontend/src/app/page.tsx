"use client";

import dynamic from "next/dynamic";

// Disable SSR for landing hero to avoid hydration mismatches with Three.js and random ticker positions
const LandingHero = dynamic(() => import("@/components/LandingHero"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#05060A",
        color: "#ffffff",
        fontFamily: "var(--font-geist-sans), sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: "clamp(3rem, 8vw, 6rem)",
            fontWeight: 800,
            letterSpacing: "0.04em",
            background: "linear-gradient(135deg, #7A5CFF 0%, #21F0D5 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            marginBottom: "1rem",
          }}
        >
          KUMMAWAVE
        </div>
        <div style={{ fontSize: "20px", opacity: 0.8 }}>Loading...</div>
      </div>
    </div>
  ),
});

export default function LandingPage() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      <LandingHero />
    </div>
  );
}
