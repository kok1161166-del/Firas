import React, { useEffect } from 'react';
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

function Scene() {
    const { effectsEnabled } = useStore();
    return (
        <>
            <Environment />
            <group>
                {/* Local Player ONLY */}
                <group userData={{ isPlayer: true }} name="PlayerGroup">
                    <Player />
                </group>

                <LevelManager />
            </group>
            {effectsEnabled && <Effects />}
        </>
    );
}

export const RunnerGame: React.FC<RunnerGameProps> = ({ lang, onExit }) => {
    const isAr = lang === 'ar';

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
                shadows
                dpr={[1, 1.5]}
                gl={{ antialias: false, stencil: false, depth: true, powerPreference: 'high-performance' }}
                camera={{ position: [0, 5.5, 8], fov: 60 }}
            >
                <CameraController />
                <Scene />
            </Canvas>
            <HUD />

            {/* Back to the hub — strong gold */}
            <div className="absolute top-4 left-4 z-[300] animate-fade-in">
                <span className="absolute -inset-1.5 rounded-[20px] bg-gradient-to-b from-[#F0DDAE] to-[#8A6A3A] opacity-50 blur-lg" aria-hidden="true" />
                <button
                    type="button"
                    onClick={onExit}
                    className="btn-arena group relative inline-flex items-center gap-2.5 overflow-hidden rounded-2xl border border-[#FFF3D6]/70 bg-gradient-to-b from-[#FFF3D6] via-[#E3BD64] to-[#8A6A3A] px-6 py-3.5 text-sm font-black text-black shadow-[0_14px_44px_-8px_rgba(201,162,75,0.8)] hover:brightness-110 active:scale-95"
                >
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M19 12H5M11 18l-6-6 6-6" />
                    </svg>
                    <span dir={isAr ? 'rtl' : 'ltr'}>{isAr ? 'عودة للقلعة' : 'Back to Hub'}</span>
                    <span className="pointer-events-none absolute inset-y-0 w-1/2 -skew-x-12 bg-white/50 blur-md -left-[60%] transition-all duration-700 group-hover:left-[130%]" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
};

export default RunnerGame;
