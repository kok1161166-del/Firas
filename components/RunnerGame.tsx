import React, { useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import './RunnerGame.css';
import { Environment } from '../remix_-remix_-hsg-runner/components/World/Environment';
import { Player } from '../remix_-remix_-hsg-runner/components/World/Player';
import { LevelManager } from '../remix_-remix_-hsg-runner/components/World/LevelManager';
import { Effects } from '../remix_-remix_-hsg-runner/components/World/Effects';
import { HUD } from '../remix_-remix_-hsg-runner/components/UI/HUD';
import { useStore } from '../remix_-remix_-hsg-runner/store';
import { GameStatus } from '../remix_-remix_-hsg-runner/types';
import type { Language } from '../types';

interface RunnerGameProps {
    lang: Language;
    onExit: () => void;
}

/**
 * Phones trade pixels for frames.
 *
 * The scene is identical, only the sampling budget changes: half-resolution
 * buffers, no shadow pass, no post-processing chain. Every dropped pass is a
 * full-screen GPU pass saved, which is exactly what a mid-range phone needs
 * to keep the touch-to-lane response tight.
 */
const isCoarsePointer = () => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900;
};

// Arcade mode: the front page is stripped — jump straight into gameplay.
// Any navigation toward a home-ish screen snaps back into the run.
const HOME_STATUSES = new Set<GameStatus>([
    GameStatus.LANDING,
    GameStatus.AUTH,
    GameStatus.PROFILE,
    GameStatus.MENU,
    GameStatus.LEVEL_SELECT,
    GameStatus.LOBBY,
    GameStatus.GUIDELINES,
    GameStatus.PRIVACY,
    GameStatus.ABOUT,
    GameStatus.CONTACT,
    GameStatus.TERMS,
]);
// Dynamic Camera Controller (same as the standalone runner)
const CameraController = () => {
    const { camera, size } = useThree();
    const { laneCount } = useStore();

    useFrame((state, delta) => {
        const aspect = size.width / size.height;
        const isMobile = aspect < 1.2;

        const heightFactor = isMobile ? 2.0 : 0.5;
        const distFactor = isMobile ? 4.5 : 1.0;

        const extraLanes = Math.max(0, laneCount - 3);

        const targetX = 0;
        const targetY = 5.5 + extraLanes * heightFactor;
        const targetZ = 8.0 + extraLanes * distFactor;

        const targetPos = new THREE.Vector3(targetX, targetY, targetZ);
        camera.position.lerp(targetPos, delta * 4.0);
        camera.lookAt(targetX, 0, -30);
    });

    return null;
};

function Scene({ lite }: { lite: boolean }) {
    const { effectsEnabled } = useStore();
    return (
        <>
            <Environment lite={lite} />
            <group>
                {/* Local Player ONLY */}
                <group userData={{ isPlayer: true }} name="PlayerGroup">
                    <Player />
                </group>

                <LevelManager lite={lite} />
            </group>
            {effectsEnabled && !lite && <Effects />}
        </>
    );
}

export const RunnerGame: React.FC<RunnerGameProps> = ({ lang, onExit }) => {
    const isAr = lang === 'ar';
    const [lite] = useState(isCoarsePointer);

    // Jump straight into gameplay — no landing / auth / menus.
    useEffect(() => {
        useStore.getState().startGame(1);
        const unsub = useStore.subscribe((s) => {
            if (HOME_STATUSES.has(s.status)) useStore.getState().restartGame();
        });
        return () => unsub();
    }, []);

    // Lock background scroll + Esc to go back.
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onExit();
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = prev;
            document.removeEventListener('keydown', onKey);
        };
    }, [onExit]);

    return (
        <div className="runner-scope relative w-full h-[100dvh] bg-black overflow-hidden select-none" dir="ltr">
            <Canvas
                shadows={lite ? false : true}
                dpr={lite ? 1 : [1, 1.5]}
                gl={{ antialias: false, stencil: false, depth: true, powerPreference: 'high-performance', alpha: false }}
                camera={{ position: [0, 5.5, 8], fov: 60 }}
                performance={{ min: 0.5 }}
                frameloop="always"
                style={{ touchAction: 'none' }}
            >
                <CameraController />
                <Scene lite={lite} />
            </Canvas>
            <HUD />

            {/* Back to the hub — parked top-right so the in-game left rail stays clear */}
            <div className="absolute top-4 right-4 z-[300] animate-fade-in">
                <span className="absolute -inset-1.5 rounded-[20px] bg-gradient-to-b from-[#F0DDAE] to-[#8A6A3A] opacity-50 blur-lg" aria-hidden="true" />
                <button
                    type="button"
                    onClick={onExit}
                    className="btn-arena group relative inline-flex items-center gap-2.5 overflow-hidden rounded-2xl border border-[#FFF3D6]/70 bg-gradient-to-b from-[#FFF3D6] via-[#E3BD64] to-[#8A6A3A] px-5 py-3 sm:px-6 sm:py-3.5 text-xs sm:text-sm font-black text-black shadow-[0_14px_44px_-8px_rgba(201,162,75,0.8)] hover:brightness-110 active:scale-95"
                >
                    <span className="pointer-events-none absolute inset-y-0 w-1/2 -skew-x-12 bg-white/50 blur-md -right-[60%] transition-all duration-700 group-hover:right-[130%]" aria-hidden="true" />
                    <span dir={isAr ? 'rtl' : 'ltr'}>{isAr ? 'عودة للقلعة' : 'Back to Hub'}</span>
                    <svg className="w-5 h-5 shrink-0 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M19 12H5M11 18l-6-6 6-6" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default RunnerGame;
