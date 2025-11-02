"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface TickerCardProps {
  symbol: string;
  change: number;
  changePercent: number;
  initialPosition: { x: number; y: number; z: number };
  velocity: { x: number; y: number };
  isBullish: boolean;
}

export default function TickerCard({
  symbol,
  change,
  changePercent,
  initialPosition,
  velocity,
  isBullish,
}: TickerCardProps) {
  const meshRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const currentPos = useRef({ ...initialPosition });

  // Animate along circular/vortex flow path
  useEffect(() => {
    let frameId: number;
    const startTime = Date.now();

    const animate = () => {
      if (!meshRef.current) return;

      const t = (Date.now() - startTime) * 0.001;
      
      // Calculate center point (center of vortex)
      const centerX = 0;
      const centerY = 0;
      
      // Get current radius and angle
      const dx = currentPos.current.x - centerX;
      const dy = currentPos.current.y - centerY;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      
      // Circular motion: rotate around center
      // Bullish rotate counter-clockwise (positive), bearish clockwise (negative)
      const rotationSpeed = isBullish ? 0.03 : -0.03;
      const newAngle = angle + rotationSpeed;
      
      // Optional: spiral inward/outward (subtle)
      const spiralSpeed = isBullish ? -0.005 : 0.005;
      const newRadius = Math.max(2, Math.min(7, radius + spiralSpeed * Math.sin(t)));
      
      // Calculate new position in circle
      currentPos.current.x = centerX + Math.cos(newAngle) * newRadius;
      currentPos.current.y = centerY + Math.sin(newAngle) * newRadius;
      
      // Add vertical flow (up for bullish, down for bearish)
      currentPos.current.y += isBullish ? -0.02 : 0.02;
      
      // Wrap around if too far from center
      const distanceFromCenter = Math.sqrt(
        Math.pow(currentPos.current.x - centerX, 2) + 
        Math.pow(currentPos.current.y - centerY, 2)
      );
      if (distanceFromCenter > 10) {
        // Reset to edge
        const resetAngle = Math.random() * Math.PI * 2;
        currentPos.current.x = centerX + Math.cos(resetAngle) * 3;
        currentPos.current.y = centerY + Math.sin(resetAngle) * 3;
      }

      meshRef.current.position.set(
        currentPos.current.x,
        currentPos.current.y,
        currentPos.current.z
      );

      frameId = requestAnimationFrame(animate);
    };

    animate();
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [initialPosition, velocity, isBullish]);

  const isPositive = changePercent > 0;
  const shouldPulse = Math.abs(changePercent) > 1.5;

  return (
    <group
      ref={meshRef}
      position={[initialPosition.x, initialPosition.y, initialPosition.z]}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* Card background - glowing rectangle */}
      <mesh>
        <planeGeometry args={[3, 2]} />
        <meshStandardMaterial
          color={hovered ? 0x1a1a1a : 0x0a0a0a}
          opacity={0.7}
          transparent
          emissive={isPositive ? 0x21f0d5 : 0xff2e6a}
          emissiveIntensity={hovered ? 0.5 : 0.3}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Enhanced border glow */}
      <mesh>
        <ringGeometry args={[1.5, 1.6, 64]} />
        <meshStandardMaterial
          color={isPositive ? 0x21f0d5 : 0xff2e6a}
          transparent
          opacity={hovered ? 0.6 : 0.4}
          side={THREE.DoubleSide}
          emissive={isPositive ? 0x21f0d5 : 0xff2e6a}
          emissiveIntensity={0.8}
        />
      </mesh>
    </group>
  );
}
