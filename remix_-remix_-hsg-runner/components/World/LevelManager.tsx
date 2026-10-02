/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../store';
import { GameObject, ObjectType, LANE_WIDTH, SPAWN_DISTANCE, REMOVE_DISTANCE, GameStatus, GEMINI_COLORS, RUN_SPEED_BASE, getTargetWord } from '../../types';
import { audio } from '../System/Audio';

// Geometry Constants
const OBSTACLE_HEIGHT = 1.6;
const OBSTACLE_GEOMETRY = new THREE.ConeGeometry(0.9, OBSTACLE_HEIGHT, 6);
const OBSTACLE_GLOW_GEO = new THREE.ConeGeometry(0.9, OBSTACLE_HEIGHT, 6);
const OBSTACLE_RING_GEO = new THREE.RingGeometry(0.6, 0.9, 6);

const GEM_GEOMETRY = new THREE.IcosahedronGeometry(0.3, 0);

// Alien Geometries
const ALIEN_BODY_GEO = new THREE.CylinderGeometry(0.6, 0.3, 0.3, 8);
const ALIEN_DOME_GEO = new THREE.SphereGeometry(0.4, 16, 16, 0, Math.PI * 2, 0, Math.PI/2);
const ALIEN_EYE_GEO = new THREE.SphereGeometry(0.1);

// Missile Geometries — chunky enough to read at speed, with a bright tip so
// the incoming shot is unmistakable.
const MISSILE_CORE_GEO = new THREE.CylinderGeometry(0.13, 0.13, 3.0, 8);
const MISSILE_RING_GEO = new THREE.TorusGeometry(0.2, 0.03, 16, 32);
const MISSILE_HEAD_GEO = new THREE.SphereGeometry(0.24, 16, 16);

// Shadow Geometries
const SHADOW_LETTER_GEO = new THREE.PlaneGeometry(2, 0.6);
const SHADOW_GEM_GEO = new THREE.CircleGeometry(0.6, 32);
const SHADOW_ALIEN_GEO = new THREE.CircleGeometry(0.8, 32);
const SHADOW_MISSILE_GEO = new THREE.PlaneGeometry(0.15, 3);
const SHADOW_DEFAULT_GEO = new THREE.CircleGeometry(0.8, 6);

// Billboard plane used for the canvas-drawn letter glyphs
const LETTER_PLANE_GEO = new THREE.PlaneGeometry(1.9, 1.9);

const PARTICLE_COUNT = 600;

const MISSILE_SPEED = 30; // Extra speed added to world speed (sentry shots)

/**
 * Where a sentry opens fire, and how much further up the track it keeps
 * firing. Generous spacing on purpose: consecutive shots must always be
 * dodgeable one at a time.
 */
const SENTRY_FIRING_Z = -120;
const SENTRY_SHOT_INTERVAL = 34;

/* ------------------------------------------------------------------ *
 * Shared render resources.
 *
 * Two reasons, both performance-critical for an endless run:
 *  1. Letter glyphs are drawn into a local canvas instead of being fetched
 *     as a 3D typeface JSON. The old `Text3D` path downloaded a font over
 *     the network the first time a letter spawned (a few seconds into a
 *     run) and froze the whole loop for about a second while it parsed.
 *  2. Materials are pooled by colour so the endless spawn stream reuses the
 *     same GPU programs instead of allocating new ones every few frames.
 * ------------------------------------------------------------------ */

const LETTER_TEX_SIZE = 256;

const letterTextureCache = new Map<string, THREE.CanvasTexture>();

function getLetterTexture(char: string, hex: string): THREE.CanvasTexture {
  const key = `${char}|${hex}`;
  const cached = letterTextureCache.get(key);
  if (cached) return cached;

  const size = LETTER_TEX_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.clearRect(0, 0, size, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'italic 900 176px Outfit, "Segoe UI", system-ui, sans-serif';

  ctx.shadowColor = hex;
  ctx.shadowBlur = 44;
  ctx.fillStyle = hex;
  ctx.fillText(char, size / 2, size / 2 + 8);

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#FFF6DE';
  ctx.fillText(char, size / 2, size / 2 + 8);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  letterTextureCache.set(key, tex);
  return tex;
}

const materialCache = new Map<string, THREE.Material>();

function getSharedMaterial<T extends THREE.Material>(key: string, make: () => T): T {
  const cached = materialCache.get(key);
  if (cached) return cached as T;
  const mat = make();
  materialCache.set(key, mat);
  return mat;
}

function getGemMaterial(hex: string) {
  return getSharedMaterial(`gem|${hex}`, () => new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: 0,
    metalness: 1,
    emissive: new THREE.Color(hex),
    emissiveIntensity: 1.6,
  }));
}

function getLetterMaterial(char: string, hex: string) {
  return getSharedMaterial(`letter|${char}|${hex}`, () => new THREE.MeshBasicMaterial({
    map: getLetterTexture(char, hex),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }));
}

function getObstacleBodyMaterial() {
  return getSharedMaterial('obstacle|body', () => new THREE.MeshStandardMaterial({
    color: '#2A1A0E',
    roughness: 0.35,
    metalness: 0.85,
    flatShading: true,
  }));
}

function getObstacleEdgeMaterial(hex: string) {
  return getSharedMaterial(`obstacle|edge|${hex}`, () => new THREE.MeshBasicMaterial({
    color: new THREE.Color(hex),
    wireframe: true,
    transparent: true,
    opacity: 0.42,
  }));
}

function getFlatMaterial(key: string, hex: string, opacity: number) {
  return getSharedMaterial(`${key}|${hex}|${opacity}`, () => new THREE.MeshBasicMaterial({
    color: new THREE.Color(hex),
    transparent: true,
    opacity,
  }));
}

function getShadowMaterial() {
  return getSharedMaterial('shadow', () => new THREE.MeshBasicMaterial({
    color: '#000000',
    opacity: 0.3,
    transparent: true,
  }));
}

function getObstacleRingMaterial(hex: string) {
  return getSharedMaterial(`obstacle|ring|${hex}`, () => new THREE.MeshBasicMaterial({
    color: new THREE.Color(hex),
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
}

function getAlienBodyMaterial() {
  return getSharedMaterial('alien-body', () => new THREE.MeshStandardMaterial({
    color: '#3A2A16',
    metalness: 0.9,
    roughness: 0.2,
  }));
}

function getAlienDomeMaterial() {
  return getSharedMaterial('alien-dome', () => new THREE.MeshStandardMaterial({
    color: '#C46A2F',
    emissive: '#C46A2F',
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.85,
  }));
}

function getMissileCoreMaterial() {
  return getSharedMaterial('missile-core', () => new THREE.MeshStandardMaterial({
    color: '#E2742B',
    emissive: '#E2742B',
    emissiveIntensity: 4,
  }));
}

/** Bright tip on the leading end of a shot — the part you actually track. */
function getMissileHeadMaterial() {
  return getSharedMaterial('missile-head', () => new THREE.MeshBasicMaterial({
    color: new THREE.Color('#FFF3D6'),
    toneMapped: false,
  }));
}

// --- Particle System ---
const ParticleSystem: React.FC = () => {
    const mesh = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    
    const particles = useMemo(() => new Array(PARTICLE_COUNT).fill(0).map(() => ({
        life: 0,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Vector3(),
        rotVel: new THREE.Vector3(),
        color: new THREE.Color()
    })), []);

    useEffect(() => {
        const handleExplosion = (e: CustomEvent) => {
            const { position, color } = e.detail;
            let spawned = 0;
            const burstAmount = 40; 

            for(let i = 0; i < PARTICLE_COUNT; i++) {
                const p = particles[i];
                if (p.life <= 0) {
                    p.life = 1.0 + Math.random() * 0.5; 
                    p.pos.set(position[0], position[1], position[2]);
                    
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos(2 * Math.random() - 1);
                    const speed = 2 + Math.random() * 10;
                    
                    p.vel.set(
                        Math.sin(phi) * Math.cos(theta),
                        Math.sin(phi) * Math.sin(theta),
                        Math.cos(phi)
                    ).multiplyScalar(speed);

                    p.rot.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                    p.rotVel.set(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).multiplyScalar(5);
                    
                    p.color.set(color);
                    
                    spawned++;
                    if (spawned >= burstAmount) break;
                }
            }
        };
        
        window.addEventListener('particle-burst', handleExplosion as any);
        return () => window.removeEventListener('particle-burst', handleExplosion as any);
    }, [particles]);

    useFrame((state, delta) => {
        if (!mesh.current) return;
        const safeDelta = Math.min(delta, 0.1);

        particles.forEach((p, i) => {
            if (p.life > 0) {
                p.life -= safeDelta * 1.5;
                p.pos.addScaledVector(p.vel, safeDelta);
                p.vel.y -= safeDelta * 5; 
                p.vel.multiplyScalar(0.98);

                p.rot.x += p.rotVel.x * safeDelta;
                p.rot.y += p.rotVel.y * safeDelta;
                
                dummy.position.copy(p.pos);
                const scale = Math.max(0, p.life * 0.25);
                dummy.scale.set(scale, scale, scale);
                
                dummy.rotation.set(p.rot.x, p.rot.y, p.rot.z);
                dummy.updateMatrix();
                
                mesh.current!.setMatrixAt(i, dummy.matrix);
                mesh.current!.setColorAt(i, p.color);
            } else {
                dummy.scale.set(0,0,0);
                dummy.updateMatrix();
                mesh.current!.setMatrixAt(i, dummy.matrix);
            }
        });
        
        mesh.current.instanceMatrix.needsUpdate = true;
        if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    });

    return (
        <instancedMesh ref={mesh} args={[undefined, undefined, PARTICLE_COUNT]}>
            <octahedronGeometry args={[0.5, 0]} />
            <meshBasicMaterial toneMapped={false} transparent opacity={0.9} />
        </instancedMesh>
    );
};


/* ------------------------------------------------------------------ *
 * Pattern helpers
 *
 * These exist to make the spawner *provably* fair instead of fair-ish.
 * The old generator filled rows by shuffling lanes and taking a count,
 * which could seal every lane at once and could stack walls closer than a
 * jump arc — genuinely unpassable stretches, and long dead-straight ones
 * where nothing at all spawned.
 * ------------------------------------------------------------------ */

/** In-place Fisher-Yates on a small number array. */
function shuffleInPlace(arr: number[]) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
}

/**
 * Walks the safe corridor one lane at a time and returns the new lane.
 *
 * The corridor is the single lane a row leaves clear. Because it can only
 * move by one lane per row, a player who reads ahead always has a legal
 * next move — the pattern is solvable by weaving alone, no jumps required.
 * It wanders rather than settling, so there is no "just hold one lane"
 * degenerate strategy.
 */
function stepCorridor(state: { lane: number; step: number }, laneCount: number): number {
    const maxLane = Math.floor(laneCount / 2);
    if (maxLane <= 0) { state.lane = 0; return 0; }

    if (state.lane === 0) state.step = Math.random() < 0.5 ? 1 : -1;
    else if (Math.abs(state.lane) >= maxLane) {
        // Pinned to an edge: turn back inwards.
        state.step = state.lane > 0 ? -1 : 1;
    } else if (Math.random() < 0.3) {
        // Mostly single steps, occasionally a two-lane stride for spice.
        state.step = (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.18 ? 2 : 1);
    }

    let next = state.lane + state.step;
    if (next > maxLane || next < -maxLane) next = state.lane - state.step;
    state.lane = next;
    return next;
}

/** Visits every lane index in [-maxLane, maxLane]. */
function forEachLane(laneCount: number, fn: (lane: number) => void) {
    const maxLane = Math.floor(laneCount / 2);
    for (let l = -maxLane; l <= maxLane; l++) fn(l);
}

/** Small factory so gem rows stay one-liners above. */
const gem = (x: number, y: number, z: number, color: string, points: number): GameObject => ({
    id: uuidv4(),
    type: ObjectType.GEM,
    position: [x, y, z],
    active: true,
    color,
    points,
});

/* ------------------------------------------------------------------ *
 * ENDLESS DIFFICULTY CURVE
 *
 * The run never ends: there is no finish portal, no pause screen and no
 * "you finished" modal. Everything below is a pure function of one
 * `intensity` value (distance covered) plus the lifetime score.
 *
 * Three deliberate rules:
 *  1. Hard from the first frame. The opening already throws 78% obstacles,
 *     walls of two, a double-barrel sentry pool and a 0.26s reaction
 *     window — there is no "easy first minute" to coast through. All the
 *     ramps below are shallow, so it never spikes past that on top.
 *  2. Fair. Row spacing is a *fraction of current speed*, so the reaction
 *     window tightens 0.26s -> 0.18s and then holds. Past that point the
 *     game gets harder through density and patterns, never by stealing
 *     reaction time.
 *  3. Bounded track. The runner widens 3 -> 4 -> 5 lanes, and the 5th is
 *     earned by a strong score rather than handed out.
 * ------------------------------------------------------------------ */

const SPEED_START = RUN_SPEED_BASE + 11.5;  // 34 LY/s — opens at pace
const SPEED_MAX = 400;
/** Speed is still climbing after ~105,000 LY — roughly 17 minutes of running. */
const SPEED_RAMP_PER_LY = 0.0035;

const getSpeedForIntensity = (intensity: number) =>
  Math.min(SPEED_MAX, SPEED_START + intensity * SPEED_RAMP_PER_LY);

/** Score gates for the 4th and 5th lane. */
const LANE_4_SCORE = 20000;
const LANE_5_SCORE = 100000;

/**
 * Track width. Deliberately capped at 5 slots — lane 5 is the reward for a
 * strong run, not a default. Odd counts only, because even counts put the
 * outer lane centres exactly on the drawn separators.
 */
const getLaneCount = (totalScore: number) => {
  if (totalScore >= LANE_5_SCORE) return 5;
  if (totalScore >= LANE_4_SCORE) return 4;
  return 3;
};

/**
 * Sentries are a *readable* threat, not a wall of lead. They take a bigger
 * share of the obstacle budget as the run deepens, which is where the extra
 * difficulty comes from once the cone rate is dialled back.
 */
const getAlienChance = (intensity: number) =>
  Math.min(0.42, 0.16 + intensity * 0.00001);

/** One shot from the start, up to five deep into a long run. */
const getSentryShots = (intensity: number) =>
  1 + Math.min(4, Math.floor(intensity / 8000));

/**
 * Missile closing speed, in LY/s on top of the world speed. Fast enough to
 * feel like a real shot, still slow enough to see, jump and land.
 */
const getMissileSpeed = (intensity: number) =>
  Math.min(60, 22 + intensity * 0.0011);

/**
 * Row spacing as a slice of one second of travel: 0.26s -> 0.18s, then it
 * holds. This is the fairness contract of the endless curve.
 */
const getMinGap = (speed: number, intensity: number) =>
  Math.max(6, speed * (0.26 - Math.min(0.08, intensity * 0.000008)));

/**
 * Spacing between rows inside a single spawn slot.
 *
 * This one is not about reaction time — it is about the jump. A full jump
 * covers `speed * JUMP_AIRTIME` light-years, so anything stacked closer than
 * that lands the player on top of the next wall. Getting this wrong is what
 * produced genuinely impossible stretches, so it is derived from the physics
 * rather than from the difficulty curve.
 */
const JUMP_AIRTIME = 0.64;   // 2 * JUMP_FORCE / GRAVITY, from Player.tsx
const getStackGap = (speed: number) => speed * JUMP_AIRTIME * 0.95;

/** How many rows a single slot lays down: two at the start, four deep in. */
const getStackRows = (intensity: number) =>
  Math.min(3, 1 + Math.floor(intensity / 5000));

/**
 * How many lanes a wall may seal. Capped at `laneCount - 1` by the caller —
 * there is always a way through.
 */
const getWallSize = (intensity: number) =>
  2 + Math.floor(intensity / 500);

/** Letter cadence: 80 LY apart, tightening to 42 LY by ~4,750 LY. */
const getLetterSpacing = (intensity: number) =>
  Math.max(42, 80 - intensity * 0.008);

/**
 * Hard ceiling on live entities.
 *
 * Sized against the densest case the curve can reach: four stacked rows of
 * up to four blocks, spread over the spawn horizon. The budget is generous
 * enough that a normal run never touches it — it exists so a pathological
 * streak can never grow the list (and the React tree) without bound.
 */
const MAX_LIVE_OBJECTS = 260;

const LETTER_SPACING_BASE = 80;

export const LevelManager: React.FC<{ trackOffset?: number, playerId?: string }> = ({ trackOffset = 0, playerId }) => {
  const status = useStore(state => state.status);

  const collectGem = useStore(state => state.collectGem);
  const collectLetter = useStore(state => state.collectLetter);
  const collectedLetters = useStore(state => state.collectedLetters);
  const laneCount = useStore(state => state.laneCount);
  const setDistance = useStore(state => state.setDistance);
  const level = useStore(state => state.level);
  const updateOnlinePlayer = useStore(state => state.updateOnlinePlayer);
  const localUserId = useStore(state => state.localUserId);

  const isLocal = !playerId || playerId === localUserId;
  
  const objectsRef = useRef<GameObject[]>([]);
  const [renderTrigger, setRenderTrigger] = useState(0);
  const prevStatus = useRef(status);
  const prevLevel = useRef(level);

  const playerObjRef = useRef<THREE.Object3D | null>(null);
  /** Endless lifetime distance for this run — never rewinds on a tier change. */
  const distanceTraveled = useRef(0);
  const lastReportedDistance = useRef(0);
  const nextLetterDistance = useRef(LETTER_SPACING_BASE);
  const tierStartRef = useRef(0);
  const elapsedRef = useRef(0);
  // Scratch buffers, reused every frame to keep a long run allocation-free.
  // `scratchRef` is built up during the frame, `liveRef` becomes the new
  // `objectsRef` at the end. They must stay separate arrays: the loop above
  // iterates the live list while the scratch list is being rebuilt.
  const playerPosRef = useRef(new THREE.Vector3(0, 0, 0));
  const scratchRef = useRef<GameObject[]>([]);
  const liveRef = useRef<GameObject[]>([]);
  const newSpawnsRef = useRef<GameObject[]>([]);
  /** The wandering safe corridor the pattern generator walks. */
  const pattern = useRef({ lane: 0, step: 1 });

  // Compile every pooled material and glyph up front, so the first obstacle
  // of the run never pays for a shader build mid-frame.
  useEffect(() => {
    getObstacleBodyMaterial();
    getObstacleEdgeMaterial('#E2742B');
    getObstacleRingMaterial('#E2742B');
    getAlienBodyMaterial();
    getAlienDomeMaterial();
    getFlatMaterial('alien-eye', '#FFD9A8', 1);
    getMissileCoreMaterial();
    getMissileHeadMaterial();
    getFlatMaterial('missile-ring', '#FFD9A8', 1);
    getShadowMaterial();
    getGemMaterial('#F0DDAE');
    getGemMaterial('#FFF3D6');
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') getLetterTexture(ch, '#C9A24B');
  }, []);

  // Handle resets and transitions
  useEffect(() => {
    const isEnteringRun = (status === GameStatus.PLAYING || status === GameStatus.ONLINE)
      && prevStatus.current !== GameStatus.PLAYING && prevStatus.current !== GameStatus.ONLINE;

    if (isEnteringRun) {
        // New tier or new run: clear the field so nothing from the previous
        // tier survives the speed / lane change.
        objectsRef.current = [];
        playerObjRef.current = null; // Force re-find player
        lastReportedDistance.current = 0;

        // A brand-new run rewinds the endless counter; a milestone does not.
        const storedDistance = useStore.getState().distance;
        if (storedDistance < distanceTraveled.current) {
          distanceTraveled.current = storedDistance;
          lastReportedDistance.current = storedDistance;
        }

        // A fresh pattern corridor, centred so the first row is survivable.
        pattern.current.lane = 0;
        pattern.current.step = 1;

        tierStartRef.current = useStore.getState().tierStart;
        nextLetterDistance.current = tierStartRef.current + LETTER_SPACING_BASE;
        elapsedRef.current = 0;

        setRenderTrigger(t => t + 1);
    } else if (status === GameStatus.GAME_OVER || status === GameStatus.VICTORY || status === GameStatus.LEVEL_COMPLETE) {
        setDistance(Math.floor(distanceTraveled.current));
    }
    
    prevStatus.current = status;
    prevLevel.current = level;
  }, [status, level, setDistance]);

  useFrame((state) => {
      if (!playerObjRef.current) {
          const groupName = isLocal ? 'PlayerGroup' : `PlayerGroup-${playerId}`;
          const group = state.scene.getObjectByName(groupName);
          if (group && group.children.length > 0) {
              playerObjRef.current = group.children[0];
          }
      }
  });

  useFrame((state, delta) => {
    if (status !== GameStatus.PLAYING && status !== GameStatus.ONLINE) return;
    
    const store = useStore.getState();
    const { onlinePlayers, countdown, lives, hasTimeWarp, hasLaser, hasMagnet } = store;

    // Check countdown for online
    if (status === GameStatus.ONLINE && countdown > 0) return;

    // If we are local player and we are dead, stop progressing our level
    if (isLocal && lives <= 0) return;

    // A frame that arrives after a long stall (tab switch, GC pause) must not
    // teleport the player through the obstacle field.
    const safeDelta = Math.min(delta, 0.05);
    elapsedRef.current += safeDelta;

    // New tier started: re-base the letter cadence on the new tier origin.
    if (store.tierStart !== tierStartRef.current) {
      tierStartRef.current = store.tierStart;
      nextLetterDistance.current = store.tierStart + LETTER_SPACING_BASE;
    }

    // ---- ENDLESS PROGRESSION -------------------------------------------
    // One number drives everything: speed, lane width and spawn density all
    // grow with it, so a run never "wins" — it only ever gets harder.
    const intensity = distanceTraveled.current;
    const missileSpeed = getMissileSpeed(intensity);
    const sentryShots = getSentryShots(intensity);
    const desiredSpeed = getSpeedForIntensity(intensity) * (hasTimeWarp && isLocal ? 0.8 : 1);

    if (Math.abs(store.speed - desiredSpeed) > 0.05) {
      const eased = store.speed + (desiredSpeed - store.speed) * Math.min(1, safeDelta * 1.5);
      useStore.setState({ speed: eased });
    }
    const speed = useStore.getState().speed;

    let dist = speed * safeDelta;
    if (hasTimeWarp && isLocal && status !== GameStatus.ONLINE) {
      dist *= 0.8; // 20% slower perception of time
    }
    
    distanceTraveled.current += dist;

    // Report distance in coarse steps (12 LY) so the HUD and the persisted
    // store are not rewritten dozens of times a second.
    if (isLocal && distanceTraveled.current - lastReportedDistance.current > 12) {
      lastReportedDistance.current = distanceTraveled.current;
      setDistance(Math.floor(distanceTraveled.current));

      // Widen the track only when the lifetime score earns it.
      const desiredLanes = getLaneCount(store.score);
      if (desiredLanes !== useStore.getState().laneCount) {
        useStore.setState({ laneCount: desiredLanes });
      }
    }

    // ---- MILESTONE (the endless "tier cleared" beat) --------------------
    // Never pauses and never ends: it fires a banner and hands over a wider,
    // faster, denser tier while the player keeps running.
    if (isLocal && status !== GameStatus.ONLINE) {
      const st = useStore.getState();
      if (st.status === GameStatus.PLAYING && !st.milestoneFlash && distanceTraveled.current >= st.targetDistance) {
        st.completeLevel(distanceTraveled.current);
      }
      // One wall-clock second per second, rounded — used by score verification.
      const secs = Math.round(elapsedRef.current);
      if (secs !== st.runSeconds) useStore.setState({ runSeconds: secs });
    }

    let hasChanges = false;
    // Reused every frame — allocating a Vector3 per frame is needless garbage
    // once a run is minutes long.
    const playerPos = playerPosRef.current;
    playerPos.set(0, 0, 0);
    
    if (playerObjRef.current) {
        playerObjRef.current.getWorldPosition(playerPos);
    }

    // 1. Move & Update
    const currentObjects = objectsRef.current;
    const scratch = scratchRef.current;
    const newSpawns = newSpawnsRef.current;
    scratch.length = 0;
    newSpawns.length = 0;

    for (const obj of currentObjects) {
        // Standard Movement
        let moveAmount = dist;
        
        // Missile Movement (Moves faster than world)
        if (obj.type === ObjectType.MISSILE) {
            moveAmount += missileSpeed * safeDelta;
        }

        // Store previous Z for swept collision check (prevents tunneling)
        const prevZ = obj.position[2];
        obj.position[2] += moveAmount;

        // Magnet Logic
        if (hasMagnet && isLocal && obj.active && (obj.type === ObjectType.GEM || obj.type === ObjectType.LETTER)) {
            const dz = playerPos.z - obj.position[2];
            const dx = playerPos.x - obj.position[0];
            const dy = playerPos.y - obj.position[1];
            const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (distance < 15 && dz > -2) {
                // Move towards player
                const speedMagnet = 40 * safeDelta;
                obj.position[0] += (dx / distance) * speedMagnet;
                obj.position[1] += (dy / distance) * speedMagnet;
                obj.position[2] += (dz / distance) * speedMagnet;
            }
        }

        // Laser Logic
        if (hasLaser && isLocal && obj.active && (obj.type === ObjectType.OBSTACLE || obj.type === ObjectType.ALIEN || obj.type === ObjectType.MISSILE)) {
             const dz = playerPos.z - obj.position[2];
             const dx = Math.abs(obj.position[0] - playerPos.x);
             // Laser destroys anything in same lane up to 30 units ahead
             if (dx < 1.0 && dz > -30 && dz < 0) {
                 // But wait, it's a constant beam. Maybe fire every few seconds?
                 // For a permanent laser, let's say it destroys everything in front constantly.
                 obj.active = false;
                 hasChanges = true;
                 window.dispatchEvent(new CustomEvent('particle-burst', { 
                     detail: { position: obj.position, color: '#E2742B' } 
                 }));
             }
        }
        
        // Alien AI Logic
        // Sentry fire control. Early on a sentry gets a single shot; deeper in
        // the run it walks up firing a volley, which is where the late-game
        // pressure actually comes from.
        if (obj.type === ObjectType.ALIEN && obj.active) {
            const shots = obj.shots ?? 0;
            if (shots < sentryShots) {
                const firingZ = SENTRY_FIRING_Z + shots * SENTRY_SHOT_INTERVAL;
                if (obj.position[2] > firingZ) {
                    obj.shots = shots + 1;

                    newSpawns.push({
                        id: uuidv4(),
                        type: ObjectType.MISSILE,
                        position: [obj.position[0], 1.0, obj.position[2] + 2],
                        active: true,
                        color: '#E2742B',
                        shots: 0,
                    });
                    hasChanges = true;

                    if (isLocal) {
                        window.dispatchEvent(new CustomEvent('particle-burst', {
                            detail: { position: obj.position, color: '#C46A2F' },
                        }));
                    }
                }
            }
        }

        let keep = true;
        if (obj.active) {
            // Swept Collision: Check if object's path [prevZ, currentZ] overlaps with player collision zone
            // INCREASED THRESHOLD from 1.0 to 2.0 to prevent missile tunneling at low FPS/High Speed
            const zThreshold = 2.0; 
            const inZZone = (prevZ < playerPos.z + zThreshold) && (obj.position[2] > playerPos.z - zThreshold);

            if (inZZone) {
                // STANDARD COLLISION
                const dx = Math.abs(obj.position[0] - playerPos.x);
                if (dx < 0.9) { // Slightly increased horizontal forgiveness
                     
                     // Obstacles, Aliens, and Missiles damage player
                     const isDamageSource = obj.type === ObjectType.OBSTACLE || obj.type === ObjectType.ALIEN || obj.type === ObjectType.MISSILE;
                     
                     if (isDamageSource) {
                         // VERTICAL COLLISION WITH BOUNDS CHECK
                         // More robust than simple distance check for jumping/running
                         const playerBottom = playerPos.y;
                         const playerTop = playerPos.y + 1.8; // Approx height of player

                         let objBottom = obj.position[1] - 0.5;
                         let objTop = obj.position[1] + 0.5;

                         if (obj.type === ObjectType.OBSTACLE) {
                             objBottom = 0;
                             objTop = OBSTACLE_HEIGHT;
                         } else if (obj.type === ObjectType.MISSILE) {
                             // Missile at Y=1.0
                             objBottom = 0.5;
                             objTop = 1.5;
                         }

                         const isHit = (playerBottom < objTop) && (playerTop > objBottom);

                         if (isHit) { 
                             if (isLocal) window.dispatchEvent(new Event('player-hit'));
                             obj.active = false; 
                             hasChanges = true;
                             
                             // Visual burst for missile impact
                             if (obj.type === ObjectType.MISSILE && isLocal) {
                                window.dispatchEvent(new CustomEvent('particle-burst', { 
                                    detail: { position: obj.position, color: '#FFB870' } 
                                }));
                             }
                         }
                     } else {
                         // Item Collection
                         const dy = Math.abs(obj.position[1] - playerPos.y);
                         if (dy < 2.5) { // Generous vertical pickup range
                            if (obj.type === ObjectType.GEM) {
                                if (isLocal) {
                                    collectGem(obj.points || 50);
                                    audio.playGemCollect();
                                }
                            }
                            if (obj.type === ObjectType.LETTER && obj.targetIndex !== undefined) {
                                if (isLocal) {
                                    collectLetter(obj.targetIndex);
                                    audio.playLetterCollect();
                                }
                            }
                            
                            if (isLocal) {
                                window.dispatchEvent(new CustomEvent('particle-burst', { 
                                    detail: { 
                                        position: obj.position, 
                                        color: obj.color || '#ffffff' 
                                    } 
                                }));
                            }

                            obj.active = false;
                            hasChanges = true;
                         }
                     }
                }
            }
        }

        if (obj.position[2] > REMOVE_DISTANCE) {
            keep = false;
            hasChanges = true;
        }

        if (keep) {
            scratch.push(obj);
        }
    }

    // Add any newly spawned entities (Missiles)
    if (newSpawns.length > 0) {
        scratch.push(...newSpawns);
    }

    // 2. Spawning Logic
    let furthestZ = 0;
    // Only consider static obstacles/gems for gap calculation, not missiles or moving aliens
    const staticObjects = scratch.filter(o => o.type !== ObjectType.MISSILE);

    if (staticObjects.length > 0) {
        furthestZ = Math.min(...staticObjects.map(o => o.position[2]));
    } else {
        furthestZ = -20;
    }

    const minGap = getMinGap(speed, intensity);
    const stackGap = getStackGap(speed);
    const stackRows = getStackRows(intensity);
    // A slot lays down up to `stackRows + 1` rows, each a jump apart further
    // out. The spawn horizon has to cover that whole stack, otherwise the far
    // rows push `furthestZ` past the horizon and spawning silently stops for
    // the rest of the run.
    const spawnHorizon = SPAWN_DISTANCE + stackRows * stackGap;

    if (furthestZ > -spawnHorizon) {
        const spawnZ = Math.min(furthestZ - minGap, -SPAWN_DISTANCE);

        const isLetterDue = status !== GameStatus.ONLINE
          && distanceTraveled.current >= nextLetterDistance.current;

        if (isLetterDue) {
            // The word pickup takes the slot to itself — it is the one row the
            // player is actively hunting, so nothing competes with it.
            const safeLane = stepCorridor(pattern.current, laneCount);
            const target = getTargetWord(level);
            const availableIndices = target
              .map((_, i) => i)
              .filter(i => !collectedLetters.includes(i));

            if (availableIndices.length > 0) {
                const chosenIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
                scratch.push({
                    id: uuidv4(),
                    type: ObjectType.LETTER,
                    position: [safeLane * LANE_WIDTH, 1.0, spawnZ],
                    active: true,
                    color: GEMINI_COLORS[chosenIndex % GEMINI_COLORS.length],
                    value: target[chosenIndex],
                    targetIndex: chosenIndex,
                });
                nextLetterDistance.current += getLetterSpacing(intensity);
            } else {
                // Word already complete this tier — pay out with gems instead.
                forEachLane(laneCount, (lane) => {
                    if (lane === safeLane) return;
                    scratch.push(gem(trackOffset + lane * LANE_WIDTH, 1.2, spawnZ, '#F0DDAE', 50));
                });
            }
            hasChanges = true;
        } else {

        // ------------------------------------------------------------------
        //  PATTERN ROW
        //
        //  Solvability contract — every row below obeys all four:
        //
        //   1. One lane is always left completely clear (the "corridor").
        //   2. The corridor only ever moves by one lane between rows, so the
        //      player can walk it by weaving, never by a teleport.
        //   3. Rows inside a stack are a full jump arc apart, so a jump
        //      always lands before the next wall.
        //   4. Blocks and sentries only ever occupy non-corridor lanes.
        //
        //  Density contract — the road is never empty either: every lane the
        //  row does not block gets a gem, and blocked lanes sometimes carry
        //  one on top.
        // ------------------------------------------------------------------
        const maxLane = Math.floor(laneCount / 2);
        const wallBudget = Math.min(
            laneCount - 1,           // rule 1: never seal the whole track
            1 + Math.floor(Math.random() * getWallSize(intensity)),
        );
        const sentryP = getAlienChance(intensity);

        for (let row = 0; row <= stackRows; row++) {
            const rowZ = spawnZ - row * stackGap;

            // rule 2 — wander the corridor by at most one lane per row.
            const safeLane = stepCorridor(pattern.current, laneCount);

            const closed: number[] = [];
            for (let l = -maxLane; l <= maxLane; l++) if (l !== safeLane) closed.push(l);
            shuffleInPlace(closed);

            const blockedThisRow = closed.slice(0, wallBudget);

            for (const lane of blockedThisRow) {
                if (Math.random() < sentryP) {
                    scratch.push({
                        id: uuidv4(),
                        type: ObjectType.ALIEN,
                        position: [trackOffset + lane * LANE_WIDTH, 1.5, rowZ],
                        active: true,
                        color: '#C46A2F',
                        shots: 0,
                    });
                } else {
                    scratch.push({
                        id: uuidv4(),
                        type: ObjectType.OBSTACLE,
                        position: [trackOffset + lane * LANE_WIDTH, OBSTACLE_HEIGHT / 2, rowZ],
                        active: true,
                        color: '#E2742B',
                    });

                    // A gem perched on the block: tempting, but optional, so it
                    // never forces a jump the corridor did not already allow.
                    if (Math.random() < 0.34) {
                        scratch.push(gem(trackOffset + lane * LANE_WIDTH, OBSTACLE_HEIGHT + 1.0, rowZ, '#FFF3D6', 100));
                    }
                }
            }

            // Every lane this row leaves open is a reward lane.
            for (const lane of closed.slice(blockedThisRow.length)) {
                scratch.push(gem(trackOffset + lane * LANE_WIDTH, 1.2, rowZ, '#F0DDAE', 50));
            }
        }

        hasChanges = true;
        }
    }

    // Hard cap on live entities. `live` is built in spawn order, oldest
    // first, and the oldest objects are the ones nearest the player - so the
    // budget is spent on the front of the queue and the surplus is dropped
    // from the far tail, which the spawner then refills. Trimming the wrong
    // end would delete the obstacles the player is about to hit.
    const keep = Math.min(scratch.length, MAX_LIVE_OBJECTS);
    const live = liveRef.current;
    live.length = 0;
    for (let i = 0; i < keep; i++) live.push(scratch[i]);

    objectsRef.current = live;
    if (hasChanges || live.length !== currentObjects.length) {
        setRenderTrigger(t => t + 1);
    }
  });

  return (
    <group>
      <ParticleSystem />
      {objectsRef.current.map(obj => {
        if (!obj.active) return null;
        return <GameEntity key={obj.id} data={obj} />;
      })}
    </group>
  );
};

const GameEntity: React.FC<{ data: GameObject }> = React.memo(({ data }) => {
    const groupRef = useRef<THREE.Group>(null);
    const visualRef = useRef<THREE.Group>(null);
    const shadowRef = useRef<THREE.Mesh>(null);
    const { laneCount } = useStore();
    
    useFrame((state, delta) => {
        // 1. Move Main Container
        if (groupRef.current) {
            groupRef.current.position.set(data.position[0], 0, data.position[2]);
        }

        // 2. Animate Visuals
        if (visualRef.current) {
            const baseHeight = data.position[1];
            
            if (data.type === ObjectType.MISSILE) {
                 // Missile rotation
                 visualRef.current.rotation.z += delta * 20; // Fast spin
                 visualRef.current.position.y = baseHeight;
            } else if (data.type === ObjectType.ALIEN) {
                 // Alien Hover
                 visualRef.current.position.y = baseHeight + Math.sin(state.clock.elapsedTime * 3) * 0.2;
                 visualRef.current.rotation.y += delta;
            } else if (data.type !== ObjectType.OBSTACLE) {
                // Gem/Letter Bobbing
                visualRef.current.rotation.y += delta * 3;
                const bobOffset = Math.sin(state.clock.elapsedTime * 4 + data.position[0]) * 0.1;
                visualRef.current.position.y = baseHeight + bobOffset;
                
                if (shadowRef.current) {
                    const shadowScale = 1 - bobOffset; 
                    shadowRef.current.scale.setScalar(shadowScale);
                }
            } else {
                visualRef.current.position.y = baseHeight;
            }
        }
    });

    // Select Shadow Geometry based on type (using shared geometries)
    const shadowGeo = useMemo(() => {
        if (data.type === ObjectType.LETTER) return SHADOW_LETTER_GEO;
        if (data.type === ObjectType.GEM) return SHADOW_GEM_GEO;
        if (data.type === ObjectType.ALIEN) return SHADOW_ALIEN_GEO;
        if (data.type === ObjectType.MISSILE) return SHADOW_MISSILE_GEO;
        return SHADOW_DEFAULT_GEO; 
    }, [data.type]);

    // Pooled materials - resolved once per entity, reused through the cache.
    const tone = data.color || '#C9A24B';
    const obstacleBodyMaterial = getObstacleBodyMaterial();
    const obstacleEdgeMaterial = getObstacleEdgeMaterial(tone);
    const obstacleRingMaterial = getObstacleRingMaterial(tone);
    const alienBodyMaterial = getAlienBodyMaterial();
    const alienDomeMaterial = getAlienDomeMaterial();
    const alienEyeMaterial = getFlatMaterial('alien-eye', '#FFD9A8', 1);
    const missileCoreMaterial = getMissileCoreMaterial();
    const missileHeadMaterial = getMissileHeadMaterial();
    const missileRingMaterial = getFlatMaterial('missile-ring', '#FFD9A8', 1);
    const shadowMaterial = getShadowMaterial();

    const letterMaterial = data.type === ObjectType.LETTER && data.value
      ? getLetterMaterial(data.value, tone)
      : null;
    const gemMaterial = data.type === ObjectType.GEM ? getGemMaterial(tone) : null;

    return (
        <group ref={groupRef} position={[data.position[0], 0, data.position[2]]}>
            {shadowGeo && (
                <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} geometry={shadowGeo} material={shadowMaterial} />
            )}

            <group ref={visualRef} position={[0, data.position[1], 0]}>
                {/* --- OBSTACLE --- */}
                {data.type === ObjectType.OBSTACLE && (
                    <group>
                        <mesh geometry={OBSTACLE_GEOMETRY} castShadow receiveShadow material={obstacleBodyMaterial} />
                        <mesh scale={[1.02, 1.02, 1.02]} geometry={OBSTACLE_GLOW_GEO} material={obstacleEdgeMaterial} />
                         <mesh position={[0, -OBSTACLE_HEIGHT/2 + 0.05, 0]} rotation={[-Math.PI/2,0,0]} geometry={OBSTACLE_RING_GEO} material={obstacleRingMaterial} />
                    </group>
                )}

                {/* --- ALIEN (hovering sentinel) --- */}
                {data.type === ObjectType.ALIEN && (
                    <group>
                        {/* Saucer Body */}
                        <mesh castShadow geometry={ALIEN_BODY_GEO} material={alienBodyMaterial} />
                        {/* Dome */}
                        <mesh position={[0, 0.2, 0]} geometry={ALIEN_DOME_GEO} material={alienDomeMaterial} />
                        {/* Glowing Eyes/Lights */}
                        <mesh position={[0.3, 0, 0.3]} geometry={ALIEN_EYE_GEO} material={alienEyeMaterial} />
                        <mesh position={[-0.3, 0, 0.3]} geometry={ALIEN_EYE_GEO} material={alienEyeMaterial} />
                    </group>
                )}

                {/* --- MISSILE (sentry shot) --- */}
                {data.type === ObjectType.MISSILE && (
                    <group rotation={[Math.PI / 2, 0, 0]}>
                        {/* Core: oriented along local Y, which is Z after the rotation */}
                        <mesh geometry={MISSILE_CORE_GEO} material={missileCoreMaterial} />
                        {/* Bright head — local +Y is the end nearest the runner */}
                        <mesh position={[0, 1.42, 0]} geometry={MISSILE_HEAD_GEO} material={missileHeadMaterial} />
                        {/* Energy Rings */}
                        <mesh position={[0, 0.9, 0]} geometry={MISSILE_RING_GEO} material={missileRingMaterial} />
                        <mesh position={[0, 0, 0]} geometry={MISSILE_RING_GEO} material={missileRingMaterial} />
                        <mesh position={[0, -0.9, 0]} geometry={MISSILE_RING_GEO} material={missileRingMaterial} />
                    </group>
                )}

                {/* --- GEM --- */}
                {gemMaterial && (
                    <mesh castShadow geometry={GEM_GEOMETRY} material={gemMaterial} />
                )}

                {/* --- LETTER (canvas glyph — no network font) --- */}
                {letterMaterial && (
                    <mesh geometry={LETTER_PLANE_GEO} material={letterMaterial} rotation={[0, 0, -0.06]} />
                )}
            </group>
        </group>
    );
});
