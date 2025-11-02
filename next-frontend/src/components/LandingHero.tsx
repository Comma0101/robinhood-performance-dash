"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import ParticleFlowSystem from "./ParticleFlowSystem";
import { useRouter } from "next/navigation";

// Ticker data pool - fixed set as specified
const TICKER_POOL = [
  { symbol: "SPY", change: 12.45, changePercent: 1.52 },
  { symbol: "QQQ", change: 8.32, changePercent: 0.89 },
  { symbol: "TSLA", change: -15.23, changePercent: -2.34 },
  { symbol: "NVDA", change: 45.67, changePercent: 3.21 },
  { symbol: "AAPL", change: 2.15, changePercent: 0.76 },
  { symbol: "AMZN", change: -8.90, changePercent: -1.45 },
];

// Generate mini sparkline data (simple sine wave pattern)
function generateSparkline(isPositive: boolean, length: number = 12): number[] {
  const data: number[] = [];
  const base = isPositive ? 0.3 : 0.7;
  for (let i = 0; i < length; i++) {
    const value = base + (Math.sin((i / length) * Math.PI * 2) * 0.3);
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
        z: (idx % 3 - 1) * 0.6, // Deterministic z depth
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
    animatedPosRef.current = selectedTickers.map(t => ({
      x: t.position.x,
      y: t.position.y,
    }));
    setAnimatedPositions(animatedPosRef.current);
  }, []);

  // Animate HTML ticker card positions in circular pattern (synced with 3D)
  useEffect(() => {
    if (tickers.length === 0) return;

    let animationFrame: number;
    let lastTime = Date.now();
    const startTime = Date.now();
    
    // Smooth position tracking to prevent jitter
    const smoothedPositions = animatedPosRef.current.map(p => ({ ...p }));

    const animate = () => {
      const currentTime = Date.now();
      const deltaTime = (currentTime - lastTime) * 0.016; // ~60fps
      lastTime = currentTime;
      const t = (currentTime - startTime) * 0.001;

      setAnimatedPositions((prev) => {
        return prev.map((pos, idx) => {
          const ticker = tickers[idx];
          if (!ticker) return pos;

          const isBullish = ticker.isBullish;
          const centerX = 0;
          const centerY = 0;

          // Use smoothed position to prevent jitter
          const currentPos = smoothedPositions[idx] || pos;
          
          // Get current radius and angle
          const dx = currentPos.x - centerX;
          const dy = currentPos.y - centerY;
          const radius = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx);

          // Follow particle flow paths - subtle drift (4-7s)
          // Very gentle movement to prevent shaking
          const flowDirection = isBullish ? Math.PI / 4 : Math.PI / 4 + Math.PI;
          
          // Much slower drift speed
          const driftSpeed = 0.0015 + (idx % 3) * 0.0005;
          
          // Subtle sine wave for organic flow
          const flowOffset = Math.sin(t * 0.2 + idx) * 0.05;
          
          // Calculate new position following flow (very smooth)
          let targetX = centerX + Math.cos(flowDirection + flowOffset) * (radius + driftSpeed * t * 5);
          let targetY = centerY + Math.sin(flowDirection + flowOffset) * (radius + driftSpeed * t * 5);
          
          // Add gentle vertical component
          targetY += isBullish ? -0.0015 : 0.0015;

          // Smooth interpolation to prevent jitter
          const smoothFactor = 0.05;
          const newX = currentPos.x + (targetX - currentPos.x) * smoothFactor;
          const newY = currentPos.y + (targetY - currentPos.y) * smoothFactor;

          // Wrap around if too far from center
          const distanceFromCenter = Math.sqrt(
            Math.pow(newX - centerX, 2) + Math.pow(newY - centerY, 2)
          );
          let finalX = newX;
          let finalY = newY;
          
          if (distanceFromCenter > 10) {
            const resetAngle = Math.random() * Math.PI * 2;
            finalX = centerX + Math.cos(resetAngle) * 3;
            finalY = centerY + Math.sin(resetAngle) * 3;
          }

          // Update smoothed position
          smoothedPositions[idx] = { x: finalX, y: finalY };

          return { x: finalX, y: finalY };
        });
      });

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
      targetMouse.x = ((e.clientX - rect.left) / rect.width - 0.5);
      targetMouse.y = ((e.clientY - rect.top) / rect.height - 0.5);
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
              transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease",
              transform: `translateY(${mouse.y * 3}px) scale(${1 + Math.abs(mouse.x) * 0.008})`,
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
          Level Up Your Trading Game.
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
          Data-driven insights. Intelligent journaling.
          <br />
          Master consistency — build real edge.
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

          {/* Secondary CTA */}
          <button
            className="cta-secondary"
            style={{
              padding: "16px 40px",
              fontSize: "18px",
              fontWeight: 500,
              color: "rgba(255, 255, 255, 0.8)",
              background: "transparent",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.4s ease",
              fontFamily: "var(--font-geist-sans), sans-serif",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.4)";
              e.currentTarget.style.color = "rgba(255, 255, 255, 1)";
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
              e.currentTarget.style.color = "rgba(255, 255, 255, 0.8)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            View Insights
          </button>
        </div>

        {/* Value Badges - 3 Column Layout */}
        <div
          className="value-badges-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "2rem",
            marginTop: "3.5rem",
            maxWidth: "900px",
            width: "100%",
            padding: "0 2rem",
          }}
        >
          {/* Market Intelligence */}
          <a
            href="#market-intelligence"
            style={{
              textDecoration: "none",
              color: "inherit",
              cursor: "pointer",
              transition: "transform 0.3s ease, opacity 0.3s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.opacity = "0.9";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.opacity = "1";
            }}
          >
            <div
              style={{
                textAlign: "center",
                padding: "1.5rem",
                borderRadius: "12px",
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                transition: "all 0.3s ease",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>🔍</div>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "#ffffff",
                  marginBottom: "0.5rem",
                }}
              >
                Market Intelligence
              </div>
              <div
                style={{
                  fontSize: "14px",
                  color: "rgba(255, 255, 255, 0.6)",
                  lineHeight: "1.5",
                }}
              >
                Dealer positioning, gamma levels, liquidity flows
              </div>
            </div>
          </a>

          {/* Performance Tracking */}
          <a
            href="#performance-tracking"
            style={{
              textDecoration: "none",
              color: "inherit",
              cursor: "pointer",
              transition: "transform 0.3s ease, opacity 0.3s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.opacity = "0.9";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.opacity = "1";
            }}
          >
            <div
              style={{
                textAlign: "center",
                padding: "1.5rem",
                borderRadius: "12px",
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                transition: "all 0.3s ease",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>📈</div>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "#ffffff",
                  marginBottom: "0.5rem",
                }}
              >
                Performance Tracking
              </div>
              <div
                style={{
                  fontSize: "14px",
                  color: "rgba(255, 255, 255, 0.6)",
                  lineHeight: "1.5",
                }}
              >
                Automated journaling with fill-level execution stats
              </div>
            </div>
          </a>

          {/* Behavioral Edge */}
          <a
            href="#behavioral-edge"
            style={{
              textDecoration: "none",
              color: "inherit",
              cursor: "pointer",
              transition: "transform 0.3s ease, opacity 0.3s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.opacity = "0.9";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.opacity = "1";
            }}
          >
            <div
              style={{
                textAlign: "center",
                padding: "1.5rem",
                borderRadius: "12px",
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                transition: "all 0.3s ease",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>🎯</div>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "#ffffff",
                  marginBottom: "0.5rem",
                }}
              >
                Behavioral Edge
              </div>
              <div
                style={{
                  fontSize: "14px",
                  color: "rgba(255, 255, 255, 0.6)",
                  lineHeight: "1.5",
                }}
              >
                Psychology analytics to improve discipline
              </div>
            </div>
          </a>
        </div>
      </div>

      {/* Ticker Cards HTML Overlay (positioned via CSS) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 5,
        }}
      >
        {tickers.map((ticker, idx) => {
          // Use animated position (synced with 3D rectangle movement)
          const animatedPos = animatedPositions[idx] || ticker.position;
          
          // Convert 3D position to 2D screen coordinates
          // Match the Three.js camera projection: fov 75, position [0,0,8]
          // Use the same coordinate mapping that the 3D scene uses
          // The 3D boxes are positioned in world space, we need to project to screen
          
          // Simple perspective projection matching Three.js camera
          // Scale factor based on camera distance and field of view
          const scale = 1.2; // Adjust this to match visual alignment
          const projectedX = animatedPos.x * scale;
          const projectedY = -animatedPos.y * scale; // Invert Y for screen coordinates
          
          // Convert to percentage centered at 50% (middle of viewport)
          // Adjust the multiplier to match the visual scale of the 3D scene
          const screenX = 50 + projectedX * 5;
          const screenY = 50 + projectedY * 5;
          
          const isPositive = ticker.changePercent > 0;
          const shouldPulse = Math.abs(ticker.changePercent) > 1.5;

          return (
            <div
              key={`ticker-html-${idx}`}
              className="ticker-card-html"
              style={{
                position: "absolute",
                left: `${screenX}%`,
                top: `${screenY}%`,
                transform: "translate(-50%, -50%)", // Center the card on the position
                width: "120px",
                height: "80px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                background: hoveredTicker === idx 
                  ? "rgba(10, 10, 10, 0.95)" 
                  : "rgba(10, 10, 10, 0.85)",
                border: hoveredTicker === idx
                  ? `1px solid rgba(255, 255, 255, 0.5)`
                  : `1px solid ${isPositive ? "rgba(255, 255, 255, 0.3)" : "rgba(255, 255, 255, 0.2)"}`,
                borderRadius: "8px",
                color: "#ffffff",
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: "14px",
                fontWeight: 500,
                backdropFilter: "blur(10px)",
                boxShadow: hoveredTicker === idx
                  ? `0 4px 16px rgba(0, 0, 0, 0.5)`
                  : `0 2px 8px rgba(0, 0, 0, 0.3)`,
                animation: shouldPulse && hoveredTicker !== idx
                  ? "pulse-glow 2s ease-in-out infinite"
                  : "none",
                pointerEvents: "auto",
                cursor: "pointer",
                transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
                willChange: "transform",
              }}
              onMouseEnter={() => setHoveredTicker(idx)}
              onMouseLeave={() => setHoveredTicker(null)}
              onClick={() => {
                // Interactive: Could open ticker details or filter
                console.log(`Clicked ticker: ${ticker.symbol}`);
              }}
            >
              <div 
                style={{ 
                  fontSize: "16px", 
                  marginBottom: "4px",
                  transition: "transform 0.3s ease",
                  transform: hoveredTicker === idx ? "scale(1.1)" : "scale(1)",
                  fontWeight: 600,
                }}
              >
                {ticker.symbol}
              </div>
              <div
                style={{
                  color: isPositive ? "#21F0D5" : "#FF2E6A",
                  fontSize: "14px",
                  fontWeight: 500,
                  marginBottom: "6px",
                  transition: "all 0.3s ease",
                  transform: hoveredTicker === idx ? "translateY(-2px)" : "translateY(0)",
                }}
              >
                {isPositive ? "+" : ""}
                {ticker.changePercent.toFixed(2)}%
              </div>
              {/* Mini Sparkline */}
              <svg
                width="60"
                height="16"
                style={{
                  marginTop: "4px",
                  opacity: hoveredTicker === idx ? 1 : 0.8,
                  transition: "opacity 0.3s ease",
                }}
              >
                <polyline
                  points={generateSparkline(isPositive, 12)
                    .map((val, i) => `${(i / 11) * 60},${16 - val * 12}`)
                    .join(" ")}
                  fill="none"
                  stroke={isPositive ? "#21F0D5" : "#FF2E6A"}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          );
        })}
      </div>
    </div>
  );
}
