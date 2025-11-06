"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import ParticleFlowSystem from "./ParticleFlowSystem";
import { useRouter } from "next/navigation";
import {
  EffectComposer,
  DepthOfField,
  Bloom,
} from "@react-three/postprocessing";

// Ticker data pool - fixed set as specified
const TICKER_POOL = [
  { symbol: "SPY", change: 12.45, changePercent: 1.52 },
  { symbol: "QQQ", change: 8.32, changePercent: 0.89 },
  { symbol: "TSLA", change: -15.23, changePercent: -2.34 },
  { symbol: "NVDA", change: 45.67, changePercent: 3.21 },
  { symbol: "AAPL", change: 2.15, changePercent: 0.76 },
  { symbol: "AMZN", change: -8.9, changePercent: -1.45 },
];

// Generate mini sparkline data (simple sine wave pattern)
function generateSparkline(isPositive: boolean, length: number = 12): number[] {
  const data: number[] = [];
  const base = isPositive ? 0.3 : 0.7;
  for (let i = 0; i < length; i++) {
    const value = base + Math.sin((i / length) * Math.PI * 2) * 0.3;
    data.push(Math.max(0, Math.min(1, value)));
  }
  return data;
}

interface TickerData {
  symbol: string;
  change: number;
  changePercent: number;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number };
  isBullish: boolean;
}

export default function LandingHero() {
  const router = useRouter();
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [tickers, setTickers] = useState<TickerData[]>([]);
  const [animatedPositions, setAnimatedPositions] = useState<
    Array<{ x: number; y: number }>
  >([]);
  const [hoveredTicker, setHoveredTicker] = useState<number | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const animatedPosRef = useRef<Array<{ x: number; y: number }>>([]);

  // Initialize tickers with flow positions in a vortex pattern
  useEffect(() => {
    // Shuffle ticker pool to rotate selection
    const shuffled = [...TICKER_POOL].sort(() => Math.random() - 0.5);

    // Create a tighter vortex/funnel arrangement
    const selectedTickers = shuffled.slice(0, 6).map((ticker, idx) => {
      const isBullish = ticker.changePercent > 0;

      // Create vortex pattern: tighter arrangement in center, expanding outward
      // Bullish go up-left, bearish go down-right
      const spiralAngle = (idx / 6) * Math.PI * 2;
      const spiralRadius = 2.5 + (idx % 3) * 1.2; // Tighter radius for vortex

      // Adjust angle based on bullish/bearish direction
      const adjustedAngle = isBullish
        ? spiralAngle - Math.PI / 4 // Up-left quadrant
        : spiralAngle + Math.PI / 4; // Down-right quadrant

      // Position along a vortex/funnel (more cohesive)
      const position = {
        x: Math.cos(adjustedAngle) * spiralRadius,
        y: Math.sin(adjustedAngle) * spiralRadius * 0.5, // Flatten for vortex effect
        z: ((idx % 3) - 1) * 0.6, // Deterministic z depth
      };

      // Velocity based on bullish/bearish flow (deterministic with slight variation)
      const velBase = 0.025;
      const velVariation = (idx % 5) * 0.003;
      const velocity = isBullish
        ? {
            // Bullish: bottom-left → top-right (more diagonal)
            x: velBase + velVariation,
            y: velBase + velVariation * 1.2,
          }
        : {
            // Bearish: top-right → bottom-left (more diagonal)
            x: -velBase - velVariation,
            y: -velBase - velVariation * 1.2,
          };

      return {
        ...ticker,
        position,
        velocity,
        isBullish,
      };
    });

    setTickers(selectedTickers);

    // Initialize animated positions
    animatedPosRef.current = selectedTickers.map((t) => ({
      x: t.position.x,
      y: t.position.y,
    }));
    setAnimatedPositions(animatedPosRef.current);
  }, []);

  // Animate HTML ticker card positions with bouncing behavior
  useEffect(() => {
    if (tickers.length === 0) return;

    let animationFrame: number;
    const startTime = Date.now();

    // Initialize animated entities with position and velocity
    const animatedEntities = animatedPosRef.current.map((p, idx) => {
      const ticker = tickers[idx];
      const isBullish = ticker.isBullish;
      const flowDirection = isBullish ? Math.PI / 4 : Math.PI / 4 + Math.PI;
      const driftSpeed = 0.02; // A constant, gentle speed
      return {
        x: p.x,
        y: p.y,
        vx: Math.cos(flowDirection) * driftSpeed,
        vy: Math.sin(flowDirection) * driftSpeed,
      };
    });

    const animate = () => {
      const t = (Date.now() - startTime) * 0.001;

      const newPositions = animatedEntities.map((entity, idx) => {
        // Apply a subtle, organic wave to the movement
        const wave = Math.sin(t * 0.5 + idx * 0.5) * 0.001;
        let newVx = entity.vx + wave;
        let newVy = entity.vy + wave;

        // Update position based on velocity
        let newX = entity.x + newVx;
        let newY = entity.y + newVy;

        // Boundary check and bounce logic
        const boundary = 8;
        const distanceFromCenter = Math.sqrt(newX * newX + newY * newY);

        if (distanceFromCenter > boundary) {
          // Normalize the position vector to get the normal at the boundary
          const nx = newX / distanceFromCenter;
          const ny = newY / distanceFromCenter;

          // Calculate the dot product of the velocity and the normal
          const dot = newVx * nx + newVy * ny;

          // Reflect the velocity vector
          newVx = newVx - 2 * dot * nx;
          newVy = newVy - 2 * dot * ny;

          // Clamp the position to the boundary to prevent getting stuck
          newX = nx * boundary;
          newY = ny * boundary;
        }

        // Update the entity's state for the next frame
        entity.x = newX;
        entity.y = newY;
        entity.vx = newVx;
        entity.vy = newVy;

        return { x: newX, y: newY };
      });

      setAnimatedPositions(newPositions);
      animationFrame = requestAnimationFrame(animate);
    };

    animate();
    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [tickers]);

  // Track mouse for parallax with smoothing
  useEffect(() => {
    let targetMouse = { x: 0, y: 0 };
    let currentMouse = { x: 0, y: 0 };

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      targetMouse.x = (e.clientX - rect.left) / rect.width - 0.5;
      targetMouse.y = (e.clientY - rect.top) / rect.height - 0.5;
    };

    const smoothMouse = () => {
      // Smooth interpolation (ease-out)
      currentMouse.x += (targetMouse.x - currentMouse.x) * 0.1;
      currentMouse.y += (targetMouse.y - currentMouse.y) * 0.1;

      setMouse({ x: currentMouse.x, y: currentMouse.y });
      requestAnimationFrame(smoothMouse);
    };

    smoothMouse();
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  // Track scroll for interactive effects
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      ref={containerRef}
      className="landing-hero"
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#05060A",
      }}
    >
      {/* Three.js Canvas Background */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 0,
        }}
      >
        <Canvas
          camera={{ position: [0, 0, 8], fov: 75 }}
          gl={{ antialias: true, alpha: true }}
        >
          <ambientLight intensity={0.3} />
          <pointLight position={[10, 10, 10]} intensity={0.5} />

          {/* Particle flow system - layered streaks */}
          <ParticleFlowSystem count={720} mouse={mouse} />
          <EffectComposer>
            <DepthOfField
              focusDistance={0}
              focalLength={0.02}
              bokehScale={2}
              height={480}
            />
            <Bloom
              intensity={0.2}
              luminanceThreshold={0.1}
              luminanceSmoothing={0.9}
              height={300}
            />
          </EffectComposer>
        </Canvas>
      </div>

      {/* Content Overlay */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: "8vh",
          paddingBottom: "10vh",
        }}
      >
        {/* Logo */}
        <div
          style={{
            marginBottom: "2.4vh",
            textAlign: "center",
          }}
        >
          <h1
            className="kummawave-logo"
            style={{
              fontFamily: "var(--font-geist-sans), sans-serif",
              fontWeight: 700,
              fontSize: "clamp(3rem, 8vw, 6rem)",
              letterSpacing: "0.02em",
              background: "linear-gradient(135deg, #7A5CFF 0%, #21F0D5 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              margin: 0,
              cursor: "pointer",
              transition:
                "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease",
              transform: `translateY(${mouse.y * 3}px) scale(${
                1 + Math.abs(mouse.x) * 0.008
              })`,
              opacity: 0.97,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "0.97";
            }}
          >
            KUMMAWAVE
          </h1>
        </div>

        {/* New Headline */}
        <h2
          style={{
            fontFamily: "var(--font-geist-sans), 'Inter', sans-serif",
            fontSize: "clamp(28px, 4vw, 48px)",
            fontWeight: 600,
            color: "#ffffff",
            marginTop: "2.5vh",
            marginBottom: "1.5vh",
            textAlign: "center",
            letterSpacing: "-0.01em",
          }}
        >
          The Edge You Need.
        </h2>

        {/* Sub-line */}
        <p
          style={{
            fontFamily: "var(--font-geist-sans), 'Inter', sans-serif",
            fontSize: "clamp(16px, 1.8vw, 22px)",
            fontWeight: 400,
            color: "rgba(255, 255, 255, 0.8)",
            marginTop: "1.5vh",
            marginBottom: "3rem",
            textAlign: "center",
            lineHeight: "1.6",
          }}
        >
          Institutional-grade tools for the modern trader.
          <br />
          Master your strategy with data-driven insights and intelligent
          journaling.
        </p>

        {/* CTA Buttons */}
        <div
          style={{
            display: "flex",
            gap: "32px",
            flexWrap: "wrap",
            justifyContent: "center",
            marginTop: "auto",
          }}
        >
          {/* Primary CTA */}
          <div
            style={{
              position: "relative",
              background: "rgba(255, 255, 255, 0.1)",
              borderRadius: "8px",
              padding: "1px",
              display: "inline-block",
              transition: "all 0.4s ease",
              border: "1px solid rgba(255, 255, 255, 0.2)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px) scale(1.02)";
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.15)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
              e.currentTarget.style.boxShadow =
                "0 0 30px rgba(122, 92, 255, 0.3), 0 0 60px rgba(33, 240, 213, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0) scale(1)";
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <button
              onClick={() => router.push("/dashboard")}
              className="cta-primary"
              style={{
                padding: "16px 40px",
                fontSize: "18px",
                fontWeight: 500,
                color: "#ffffff",
                background: "#05060A",
                border: "none",
                borderRadius: "7px",
                cursor: "pointer",
                width: "100%",
                transition: "all 0.4s ease",
                fontFamily: "var(--font-geist-sans), sans-serif",
              }}
            >
              Launch Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
