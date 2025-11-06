"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createNoise3D } from "simplex-noise";

// GLSL shaders for custom particle appearance
const vertexShader = `
  attribute float size;
  attribute vec3 color;
  attribute float alpha;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z) * 0.2;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float r = dot(gl_PointCoord - vec2(0.5), gl_PointCoord - vec2(0.5));
    if (r > 0.25) {
        discard;
    }
    gl_FragColor = vec4(vColor, vAlpha);
  }
`;

interface ParticleFlowSystemProps {
  count?: number;
  mouse?: { x: number; y: number };
}

export default function ParticleFlowSystem({
  count = 1500, // Increased count for a denser field
  mouse = { x: 0, y: 0 },
}: ParticleFlowSystemProps) {
  const particles = useRef<THREE.BufferGeometry>(null);
  const shaderMaterial = useRef<THREE.ShaderMaterial>(null);
  const noise = useMemo(() => createNoise3D(Math.random), []);

  const particleData = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const life = new Float32Array(count);

    const bullishColor = new THREE.Color(0x21f0d5);
    const bearishColor = new THREE.Color(0xff2e6a);
    const neutralColor = new THREE.Color(0x8a7dff);

    for (let i = 0; i < count; i++) {
      life[i] = Math.random() * 10;
      sizes[i] = Math.random() > 0.95 ? 2.0 : Math.random() * 1.0 + 0.5;
      alphas[i] = 0;

      positions.set(
        [
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 10,
        ],
        i * 3
      );

      const randomColor =
        Math.random() > 0.5
          ? bullishColor
          : Math.random() > 0.5
          ? bearishColor
          : neutralColor;
      colors.set([randomColor.r, randomColor.g, randomColor.b], i * 3);
    }

    return { positions, colors, sizes, alphas, life };
  }, [count]);

  useFrame((state, delta) => {
    if (
      !particles.current ||
      !particles.current.attributes.position ||
      !shaderMaterial.current
    )
      return;

    const positions = particles.current.attributes.position
      .array as Float32Array;
    const alphas = particles.current.attributes.alpha.array as Float32Array;
    const time = state.clock.getElapsedTime();

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      particleData.life[i] -= delta;

      if (particleData.life[i] < 0) {
        // Re-birth particle
        particleData.life[i] = Math.random() * 10;
        alphas[i] = 0;
        positions.set(
          [
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 10,
          ],
          i3
        );
      }

      // Fade in
      if (alphas[i] < 1) {
        alphas[i] += delta * 0.5;
      }

      const x = positions[i3];
      const y = positions[i3 + 1];
      const z = positions[i3 + 2];

      const noiseFactor = 0.08;
      const evolution = time * 0.05;
      const nx =
        noise(x * noiseFactor, y * noiseFactor, z * noiseFactor + evolution) *
        0.1;
      const ny =
        noise(
          x * noiseFactor + 100,
          y * noiseFactor,
          z * noiseFactor + evolution
        ) * 0.1;
      const nz =
        noise(
          x * noiseFactor,
          y * noiseFactor + 100,
          z * noiseFactor + evolution
        ) * 0.05;

      positions[i3] += nx;
      positions[i3 + 1] += ny;
      positions[i3 + 2] += nz;

      const distFromCenter = Math.sqrt(x * x + y * y + z * z);
      const centeringForce = 0.0001 * Math.max(0, distFromCenter - 5);
      positions[i3] -= x * centeringForce;
      positions[i3 + 1] -= y * centeringForce;
      positions[i3 + 2] -= z * centeringForce;

      const mouseInfluence = 1.5;
      const mouseVec = new THREE.Vector3(mouse.x * 10, mouse.y * 10, 0);
      const particleVec = new THREE.Vector3(x, y, z);
      const dist = particleVec.distanceTo(mouseVec);
      if (dist < mouseInfluence) {
        const repel = particleVec.sub(mouseVec).normalize().multiplyScalar(0.1);
        positions[i3] += repel.x;
        positions[i3 + 1] += repel.y;
      }
    }

    particles.current.attributes.position.needsUpdate = true;
    particles.current.attributes.alpha.needsUpdate = true;
  });

  return (
    <points>
      <bufferGeometry ref={particles}>
        <bufferAttribute
          attach="attributes-position"
          args={[particleData.positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[particleData.colors, 3]}
        />
        <bufferAttribute
          attach="attributes-size"
          args={[particleData.sizes, 1]}
        />
        <bufferAttribute
          attach="attributes-alpha"
          args={[particleData.alphas, 1]}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={shaderMaterial}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
