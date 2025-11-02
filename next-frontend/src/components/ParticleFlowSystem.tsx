"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface ParticleFlowSystemProps {
  count?: number;
  mouse?: { x: number; y: number };
}

// Create streak particles instead of dots
export default function ParticleFlowSystem({
  count = 720, // Total: 250 + 350 + 120
  mouse = { x: 0, y: 0 },
}: ParticleFlowSystemProps) {
  const particles = useRef<THREE.BufferGeometry>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);

  // Create particle positions, colors, velocities for layered streaks
  const { positions, colors, velocities } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    // Color palette
    const bullishColor = new THREE.Color(0x21f0d5); // Teal
    const bearishColor = new THREE.Color(0xff2e6a); // Crimson Magenta
    const purpleMix = new THREE.Color(0x8a7dff); // Purple

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Layer assignment: Back (0-250), Mid (250-600), Front (600-720)
      let layer: "back" | "mid" | "front";
      if (i < 250) {
        layer = "back";
      } else if (i < 600) {
        layer = "mid";
      } else {
        layer = "front";
      }

      // Random starting positions
      positions[i3] = (Math.random() - 0.5) * 20;
      positions[i3 + 1] = (Math.random() - 0.5) * 20;
      positions[i3 + 2] = (Math.random() - 0.5) * 10;

      // Assign flow direction
      const type = Math.random();
      let color: THREE.Color;
      let speed: number;
      let angle: number;

      if (type < 0.5) {
        // Bullish: bottom-left → top-right (aggressive diagonal)
        color = layer === "back" ? purpleMix : bullishColor;
        angle = Math.PI / 4; // 45 degrees
        speed = layer === "back" ? 0.015 : layer === "mid" ? 0.04 : 0.06;
      } else {
        // Bearish: top-right → bottom-left (counter-stream)
        color = layer === "front" ? bearishColor : bearishColor.clone().multiplyScalar(0.7);
        angle = Math.PI / 4 + Math.PI; // 225 degrees (opposite)
        speed = layer === "back" ? 0.015 : layer === "mid" ? 0.04 : 0.06;
      }

      // Apply cursor angle shift (±6°) - smoother
      const cursorAngleShift = (mouse.x * 3 * Math.PI) / 180; // Reduced from 6° to 3°
      angle += cursorAngleShift;

      velocities[i3] = Math.cos(angle) * speed;
      velocities[i3 + 1] = Math.sin(angle) * speed;
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.01;

      // Set color with opacity based on layer
      const opacity = layer === "back" ? 0.4 : layer === "mid" ? 0.7 : 0.9;
      colors[i3] = color.r * opacity;
      colors[i3 + 1] = color.g * opacity;
      colors[i3 + 2] = color.b * opacity;
    }

    return { positions, colors, velocities };
  }, [count, mouse.x]);

  useFrame((state, delta) => {
    if (!particles.current || !particles.current.attributes.position) return;

    const positions = particles.current.attributes.position.array as Float32Array;
    const time = state.clock.elapsedTime;

    // Parallax effect from mouse (shift flow direction) - reduced sensitivity
    const parallaxX = mouse.x * 0.02;
    const parallaxY = mouse.y * 0.02;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Update position with velocity + subtle parallax
      positions[i3] += velocities[i3] * delta * 10 + parallaxX * delta * 0.5;
      positions[i3 + 1] += velocities[i3 + 1] * delta * 10 + parallaxY * delta * 0.5;
      positions[i3 + 2] += velocities[i3 + 2] * delta * 5;

      // Add some flow curvature (slight sine wave for organic feel)
      const flowCurve = Math.sin(time * 0.5 + i * 0.01) * 0.002;
      positions[i3] += flowCurve;
      positions[i3 + 1] += flowCurve * 0.5;

      // Boundary wrapping - if particle goes off screen, wrap around
      if (positions[i3] > 12) positions[i3] = -12;
      if (positions[i3] < -12) positions[i3] = 12;
      if (positions[i3 + 1] > 12) positions[i3 + 1] = -12;
      if (positions[i3 + 1] < -12) positions[i3 + 1] = 12;
      if (positions[i3 + 2] > 8) positions[i3 + 2] = -8;
      if (positions[i3 + 2] < -8) positions[i3 + 2] = 8;
    }

    particles.current.attributes.position.needsUpdate = true;
  });

  return (
    <points>
      <bufferGeometry ref={particles}>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={count}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        ref={materialRef}
        size={0.1}
        sizeAttenuation={true}
        vertexColors={true}
        transparent
        opacity={1.0}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}
