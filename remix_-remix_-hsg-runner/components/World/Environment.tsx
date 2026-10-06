/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { LANE_WIDTH, GameStatus } from '../../types';

const StarField: React.FC<{ theme: any; lite?: boolean }> = ({ theme, lite }) => {
    // Phones get a smaller sky: the scroll loop below is CPU work per star
    // per frame, so the count is the single biggest environment cost.
    const count = lite ? 800 : 3000;
    const meshRef = useRef<THREE.Points>(null);
    const frame = useRef(0);
    const smoothRef = useRef(0);
  
  const [positions, sizes] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      let x = (Math.random() - 0.5) * 400;
      let y = (Math.random() - 0.5) * 200 + 50; 
      let z = -550 + Math.random() * 650;

      if (Math.abs(x) < 15 && y > -5 && y < 20) {
          if (x < 0) x -= 15;
          else x += 15;
      }

      pos[i * 3] = x;     
      pos[i * 3 + 1] = y; 
      pos[i * 3 + 2] = z; 
      sz[i] = Math.random() * 0.5 + 0.1;
    }
    return [pos, sz];
  }, [count]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    // On phones the sky advances every other frame — 30 updates/s is
    // indistinguishable from 60 on a parallax layer, and halves the cost.
    if (lite) {
      frame.current = (frame.current + 1) % 2;
      if (frame.current !== 0) return;
    }
    const posAttr = meshRef.current.geometry.attributes.position;
    // Damp toward the published speed so a quantised store value still reads
    // as a continuous starfield.
    const target = useStore.getState().speed;
    smoothRef.current += (target - smoothRef.current) * Math.min(1, delta * 8);
    const activeSpeed = smoothRef.current > 0 ? smoothRef.current : 2;
    const step = lite ? delta * 4.0 : delta * 2.0;

    for (let i = 0; i < count; i++) {
        let z = posAttr.array[i * 3 + 2];
        z += activeSpeed * step; 
        
        if (z > 100) {
            z = -550 - Math.random() * 50; 
        }
        posAttr.array[i * 3 + 2] = z;
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.5}
        color={theme.stars}
        transparent
        opacity={0.8}
        sizeAttenuation
      />
    </points>
  );
};

const Nebula: React.FC<{ theme: any }> = ({ theme }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    useFrame((state) => {
        if (meshRef.current) {
            meshRef.current.rotation.y = state.clock.elapsedTime * 0.02;
        }
    });

    return (
        <mesh ref={meshRef} position={[0, 50, -250]}>
            <sphereGeometry args={[200, 32, 32]} />
            <meshBasicMaterial 
                color={theme.ambient} 
                side={THREE.BackSide} 
                transparent 
                opacity={0.1} 
            />
        </mesh>
    );
};

const LaneGuides: React.FC<{ theme: any }> = ({ theme }) => {
    const { laneCount, onlinePlayers, status } = useStore();
    
    const renderGuides = (trackOffset: number, keyPrefix: string) => {
        // The separators must be derived from the *same* lane math the player
        // uses, otherwise the runner ends up walking on the lines instead of
        // between them. Player.tsx clamps the lane to +-floor(laneCount / 2),
        // so the drawable slots are exactly 2 * half + 1 and each separator
        // sits half a lane outside the outermost slot centre.
        const halfLanes = Math.floor(laneCount / 2);
        const slots = halfLanes * 2 + 1;
        const trackWidth = slots * LANE_WIDTH;
        const lines: number[] = [];
        for (let i = -halfLanes - 1; i <= halfLanes; i++) {
            lines.push((i + 0.5) * LANE_WIDTH);
        }

        return (
            <group key={keyPrefix} position={[trackOffset, 0.02, 0]}>
                <mesh position={[0, -0.02, -20]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[trackWidth, 200]} />
                    <meshBasicMaterial color={theme.bg} transparent opacity={0.9} />
                </mesh>

                {lines.map((x, i) => (
                    <mesh key={`sep-${keyPrefix}-${i}`} position={[x, 0, -20]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[0.05, 200]} /> 
                        <meshBasicMaterial color={theme.dirLight} transparent opacity={0.55} />
                    </mesh>
                ))}
            </group>
        );
    };

    if (status === GameStatus.ONLINE) {
        // Only render one set of guides since players are no longer side-by-side
        return renderGuides(0, 'online-shared');
    }

    return renderGuides(0, 'local');
};

const RetroSun: React.FC<{ theme: any }> = ({ theme }) => {
    const matRef = useRef<THREE.ShaderMaterial>(null);
    const sunGroupRef = useRef<THREE.Group>(null);

    useFrame((state) => {
        if (matRef.current) {
            matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
            matRef.current.uniforms.uColorTop.value.set(theme.sunTop);
            matRef.current.uniforms.uColorBottom.value.set(theme.sunBot);
        }
        if (sunGroupRef.current) {
            // Slow, gentle drift — the citadel horizon is meant to feel like a
            // still backdrop, not something that slides when you speed up.
            sunGroupRef.current.position.y = 30 + Math.sin(state.clock.elapsedTime * 0.2) * 1.0;
        }
    });

    return (
        <group ref={sunGroupRef} position={[0, 30, -180]}>
            <mesh>
                <sphereGeometry args={[35, 32, 32]} />
                <shaderMaterial
                    ref={matRef}
                    uniforms={{
                        uTime: { value: 0 },
                        uColorTop: { value: new THREE.Color(theme.sunTop) }, 
                        uColorBottom: { value: new THREE.Color(theme.sunBot) } 
                    }}
                    transparent
                    vertexShader={`
                        varying vec2 vUv;
                        void main() {
                            vUv = uv;
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                        }
                    `}
                    fragmentShader={`
                        varying vec2 vUv;
                        uniform float uTime;
                        uniform vec3 uColorTop;
                        uniform vec3 uColorBottom;

                        void main() {
                            vec3 color = mix(uColorBottom, uColorTop, vUv.y);
                            float stripeFreq = 40.0;
                            float stripes = sin((vUv.y * stripeFreq) - (uTime * 1.0));
                            float stripeMask = smoothstep(0.2, 0.3, stripes);
                            float scanlineFade = smoothstep(0.7, 0.3, vUv.y); 
                            vec3 finalColor = mix(color, color * 0.1, (1.0 - stripeMask) * scanlineFade);
                            gl_FragColor = vec4(finalColor, 1.0);
                        }
                    `}
                />
            </mesh>
        </group>
    );
};
const MovingGrid: React.FC<{ theme: any }> = ({ theme }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const offsetRef = useRef(0);
    const smoothRef = useRef(0);
    
    useFrame((state, delta) => {
        if (meshRef.current) {
             // The store publishes speed in coarse steps (so the HUD is not
             // re-rendered 60x/second on a phone). Parallax damps toward that
             // target itself, so these layers keep gliding smoothly.
             const target = useStore.getState().speed;
             smoothRef.current += (target - smoothRef.current) * Math.min(1, delta * 8);
             const activeSpeed = smoothRef.current > 0 ? smoothRef.current : 5;
             offsetRef.current += activeSpeed * delta;
             const cellSize = 10;
             const zPos = -100 + (offsetRef.current % cellSize);
             meshRef.current.position.z = zPos;
        }
    });

    return (
        <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, -100]}>
            <planeGeometry args={[300, 400, 30, 40]} />
            <meshBasicMaterial color={theme.grid} wireframe transparent opacity={0.22} />
        </mesh>
    );
};

const THEMES: Record<number, any> = {
  1: { bg: '#0B0906', fog: '#0B0906', grid: '#C9A24B', sunTop: '#FFF3D6', sunBot: '#8A6A3A', ambient: '#3a2a16', dirLight: '#F0DDAE', pointLight: '#C9A24B', stars: '#D9C08A' },
  2: { bg: '#100C07', fog: '#100C07', grid: '#D9C08A', sunTop: '#FFF6DE', sunBot: '#A2521F', ambient: '#4a2f16', dirLight: '#E8D5A8', pointLight: '#C9A24B', stars: '#F0DDAE' },
  3: { bg: '#0B0906', fog: '#0B0906', grid: '#E8D5A8', sunTop: '#FFFFFF', sunBot: '#C9A24B', ambient: '#3a2a16', dirLight: '#FFF3D6', pointLight: '#D9C08A', stars: '#FFF3D6' },
  4: { bg: '#050403', fog: '#050403', grid: '#8A6A3A', sunTop: '#F0DDAE', sunBot: '#2A2012', ambient: '#1C140A', dirLight: '#C9A24B', pointLight: '#8A6A3A', stars: '#C9A24B' },
  5: { bg: '#0B0906', fog: '#0B0906', grid: '#53FC18', sunTop: '#D9C08A', sunBot: '#1b3a12', ambient: '#1a3312', dirLight: '#C9A24B', pointLight: '#53FC18', stars: '#D9C08A' },
  6: { bg: '#0B0906', fog: '#0B0906', grid: '#C46A2F', sunTop: '#FFD9A8', sunBot: '#4A2210', ambient: '#4a2210', dirLight: '#F0DDAE', pointLight: '#E8A05A', stars: '#FFD9A8' }
};

export const Environment: React.FC<{ lite?: boolean }> = ({ lite }) => {
  const mapId = useStore(state => state.mapId) || 1;
  const theme = THEMES[mapId] || THEMES[1];

  return (
    <>
      <color attach="background" args={[theme.bg]} />
      {/* Fixed depth cue. An earlier version tied the fog distance to speed,
          which read as the whole backdrop sliding once the run got quick —
          the horizon is meant to stay put and let the grid do the moving. */}
      <fog attach="fog" args={[theme.fog, 40, 160]} />
      
      <ambientLight intensity={0.35} color={theme.ambient} />
      <directionalLight position={[0, 20, -10]} intensity={1.5} color={theme.dirLight} />
      {/* One extra point light is a real cost on a phone GPU — the retro sun
          already carries the far glow, so it is dropped in lite mode. */}
      {!lite && <pointLight position={[0, 25, -150]} intensity={2} color={theme.pointLight} distance={200} decay={2} />}
      
      <StarField theme={theme} lite={lite} />
      <Nebula theme={theme} />
      <MovingGrid theme={theme} />
      <LaneGuides theme={theme} />
      <RetroSun theme={theme} />
    </>
  );
};
